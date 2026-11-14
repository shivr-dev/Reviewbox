import { isExamScheduled } from './model';
import {
  localDay,
  type AnswerEvent,
  type Question,
  type StudyData,
  type Subject,
} from './model';
import { effectiveAnswerTime } from './learning-evidence';
import {
  gpaConfig,
  examGradePoint,
  validExamDate,
  validResult,
} from './exam-outcomes';
import { policyFor, type PolicyConfig } from './policy-config';

const DAY = 86400000;
const bounded = (v: number) =>
  Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
const median = (v: number[]) => {
  const a = [...v].sort((x, y) => x - y);
  return a.length
    ? (a[Math.floor((a.length - 1) / 2)] + a[Math.ceil((a.length - 1) / 2)]) / 2
    : 0;
};

/** These are bounded decision signals, not calibrated probabilities or predicted examination scores. */
export function signalObservations(
  data: StudyData,
  now = Date.now(),
  policy = policyFor(data),
) {
  const seen = new Set<string>(),
    questions = new Map(data.questions.map((q) => [q.id, q])),
    nodes = new Map(data.nodes.map((n) => [n.id, n]));
  return data.events
    .filter((e) => {
      const at = Date.parse(e.occurredAt),
        q = questions.get(e.questionId),
        fingerprint = [
          e.sessionId,
          e.questionId,
          e.occurredAt,
          e.attemptNumber ?? '',
        ].join('|');
      if (
        seen.has(fingerprint) ||
        e.voidedBy ||
        !q ||
        q.reviewStatus === 'paused' ||
        q.nodeId !== e.nodeId ||
        q.skillId !== e.skillId ||
        q.subject !== e.subject ||
        nodes.get(e.nodeId)?.subject !== e.subject ||
        !nodes.get(e.nodeId)?.skills.some((s) => s.id === e.skillId) ||
        !Number.isFinite(at) ||
        at > now ||
        at < now - policy.signals.historyDays * DAY ||
        !Number.isFinite(e.score) ||
        e.score < 0 ||
        e.score > 1 ||
        (e.evidenceWeight !== undefined &&
          (!Number.isFinite(e.evidenceWeight) || e.evidenceWeight <= 0))
      )
        return false;
      seen.add(fingerprint);
      return true;
    })
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt));
}
function independent(events: AnswerEvent[]) {
  return events.filter(
    (e) =>
      !e.usedHint &&
      !e.hintLevel &&
      !e.learningEvidence?.suspect &&
      !e.learningEvidence?.gameRecovery &&
      e.predictedConfidence !== 'guess' &&
      !e.learningEvidence?.timedOut &&
      (e.learningEvidence?.assessment === 'objective' ||
        e.learningEvidence?.assessment === 'rubric' ||
        e.source === 'rubric' ||
        (e.source === 'test' && !!e.answer)),
  );
}
const activeMinutes = (events: AnswerEvent[]) =>
  events.reduce((s, e) => s + effectiveAnswerTime(e) / 60000, 0);
const key = (e: AnswerEvent) => e.nodeId + '::' + e.skillId;

/** One immutable-input decision pass. Never retained in a module/global cache. */
export type SignalContext = {
  data: StudyData;
  now: number;
  policy: PolicyConfig;
  observations: AnswerEvent[];
  independent: AnswerEvent[];
  byQuestion: Map<string, AnswerEvent[]>;
  bySkill: Map<string, AnswerEvent[]>;
  bySubject: Map<string, AnswerEvent[]>;
  nodes: Map<string, StudyData['nodes'][number]>;
};
export function createSignalContext(
  data: StudyData,
  now = Date.now(),
  policy = policyFor(data),
): SignalContext {
  const observations = signalObservations(data, now, policy),
    rows = independent(observations);
  const byQuestion = new Map<string, AnswerEvent[]>(),
    bySkill = new Map<string, AnswerEvent[]>(),
    bySubject = new Map<string, AnswerEvent[]>();
  for (const e of rows)
    for (const [map, id] of [
      [byQuestion, e.questionId],
      [bySkill, key(e)],
      [bySubject, e.subject],
    ] as const) {
      const group = map.get(id) ?? [];
      group.push(e);
      map.set(id, group);
    }
  return {
    data,
    now,
    policy,
    observations,
    independent: rows,
    byQuestion,
    bySkill,
    bySubject,
    nodes: new Map(data.nodes.map((n) => [n.id, n])),
  };
}
function signalContext(
  data: StudyData,
  now: number,
  policy: PolicyConfig,
  context?: SignalContext,
) {
  return context?.data === data &&
    context.now === now &&
    context.policy === policy
    ? context
    : createSignalContext(data, now, policy);
}

export function fatigueState(
  data: StudyData,
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
) {
  const all = signalContext(data, now, policy, context).observations,
    recent = all.filter(
      (e) =>
        Date.parse(e.occurredAt) >=
        now - policy.signals.fatigueWindowMinutes * 60000,
    ),
    reliable = independent(recent),
    today = localDay(new Date(now)),
    todayEvents = all.filter((e) => localDay(new Date(e.occurredAt)) === today),
    effectiveMinutes = activeMinutes(todayEvents);
  const split = Math.floor(reliable.length / 2),
    before = reliable.slice(0, split),
    after = reliable.slice(split),
    errorRise = bounded(
      mean(before.map((e) => e.score)) - mean(after.map((e) => e.score)),
    );
  const speed = (events: AnswerEvent[]) =>
      median(
        events
          .filter((e) => e.expectedSeconds > 0)
          .map((e) => effectiveAnswerTime(e) / (e.expectedSeconds * 1000)),
      ),
    baselineSpeed = speed(before),
    speedChange =
      baselineSpeed > 0
        ? bounded(
            (speed(after) / baselineSpeed - 1) /
              (policy.signals.fatigueSpeedRatio - 1),
          )
        : 0;
  let hardRun = 0;
  for (let i = reliable.length - 1; i >= 0 && reliable[i].difficulty >= 3; i--)
    hardRun++;
  const duration = bounded(
      activeMinutes(recent) / policy.signals.fatigueDurationMinutes,
    ),
    difficultyRun = bounded(hardRun / policy.signals.fatigueMinSamples);
  const hour = new Date(now).getHours(),
    hourHistory = independent(
      all.filter(
        (e) =>
          new Date(e.occurredAt).getHours() === hour &&
          localDay(new Date(e.occurredAt)) !== today,
      ),
    ),
    hourKnown = hourHistory.length >= policy.signals.fatigueMinSamples;
  const timeOfDay = hourKnown
    ? bounded(
        mean(independent(all).map((e) => e.score)) -
          mean(hourHistory.map((e) => e.score)),
      )
    : 0;
  const known = reliable.length >= policy.signals.fatigueMinSamples;
  // A slow answer alone never implies fatigue. Performance change must accompany strain.
  const strain = Math.max(duration, difficultyRun),
    value = known
      ? bounded(
          mean([
            errorRise,
            Math.min(errorRise, speedChange),
            Math.min(errorRise, strain),
            timeOfDay,
          ]),
        )
      : 0;
  return {
    value,
    known,
    samples: reliable.length,
    effectiveMinutes,
    components: { errorRise, speedChange, difficultyRun, duration, timeOfDay },
    explanation: !known
      ? '近期独立作答不足，暂不判断疲劳。'
      : value >= policy.signals.fatigueHigh
        ? '近期错误与作答负担同时上升，可先安排轻任务或休息。'
        : '尚未发现足够的疲劳证据。',
  };
}

export function completionEstimate(
  data: StudyData,
  kind: string,
  minutes: number,
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
) {
  const events = signalContext(data, now, policy, context).observations,
    sessionIds = new Set(events.map((e) => e.sessionId)),
    completed = new Set<string>();
  const jobs = (data.jobs ?? []).filter((j) => {
    const at = Date.parse(j.completedAt ?? j.at ?? j.startedAt ?? j.createdAt);
    return (
      Number.isFinite(at) &&
      at <= now &&
      at >= now - policy.signals.historyDays * DAY
    );
  });
  for (const j of jobs)
    if (
      j.kind === 'study-completion' ||
      j.kind === 'game-chest' ||
      j.status === 'complete' ||
      j.status === 'completed'
    )
      completed.add(String(j.sessionId ?? j.id));
  const testSessions = new Set(
    data.tests
      .filter(
        (t) => Number.isFinite(Date.parse(t.at)) && Date.parse(t.at) <= now,
      )
      .map((t) => t.sessionId),
  );
  for (const id of testSessions) completed.add(id);
  const types = new Map(
    events.map((e) => [
      e.sessionId,
      e.learningEvidence?.pressure
        ? 'pressure'
        : e.source === 'test'
          ? 'test'
          : 'practice',
    ]),
  );
  const target =
    kind === 'initial' || kind === 'verify'
      ? 'test'
      : kind === 'remedy'
        ? 'course'
        : kind;
  const ids = [...sessionIds].filter(
      (id) =>
        !['practice', 'test', 'pressure'].includes(target) ||
        types.get(id) === target,
    ),
    samples = ids.length,
    finished = ids.filter((id) => completed.has(id)).length,
    prior = policy.signals.completionPriorSamples;
  const historical =
      (finished + policy.signals.completionDefault * prior) / (samples + prior),
    budget = Math.max(
      policy.utility.minimumMinutes,
      data.settings.assistant?.dailyMinutes ?? data.settings.dailyMinutes,
    ),
    effort =
      1 /
      (1 +
        Math.max(0, minutes - budget) / policy.signals.completionEffortMinutes);
  return {
    value: bounded(historical * effort),
    known: samples >= policy.signals.completionMinSamples,
    samples,
    explanation:
      samples >= policy.signals.completionMinSamples
        ? `参考 ${samples} 次同类学习的完成记录，并考虑本次用时。`
        : '完成记录较少，采用保守默认值；不因此限制自主学习。',
  };
}

export function metadataQuality(
  data: StudyData,
  q: Question,
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
) {
  const ctx = signalContext(data, now, policy, context);
  const observations = ctx.byQuestion.get(q.id) ?? [],
    days = new Set(observations.map((e) => localDay(new Date(e.occurredAt))))
      .size,
    known =
      observations.length >= policy.signals.metadataMinSamples &&
      days >= policy.signals.metadataMinDays;
  const declared = (
    q as Question & {
      metadataConfidence?: Partial<
        Record<
          'difficulty' | 'skill' | 'prerequisite' | 'expectedSeconds',
          number
        >
      >;
    }
  ).metadataConfidence;
  const initial = policy.signals.metadataDefaultConfidence,
    confidence = {
      difficulty: bounded(declared?.difficulty ?? initial),
      skill: bounded(declared?.skill ?? initial),
      prerequisite: bounded(declared?.prerequisite ?? initial),
      expectedSeconds: bounded(declared?.expectedSeconds ?? initial),
    },
    flags: string[] = [];
  if (!Number.isFinite(q.expectedSeconds) || q.expectedSeconds <= 0) {
    confidence.expectedSeconds = 0;
    flags.push('作答时长标注无效');
  }
  if (!Number.isFinite(q.difficulty) || q.difficulty < 1 || q.difficulty > 5) {
    confidence.difficulty = 0;
    flags.push('难度标注无效');
  }
  if (!ctx.nodes.get(q.nodeId)?.skills.some((s) => s.id === q.skillId)) {
    confidence.skill = 0;
    flags.push('能力关联不存在');
  }
  if (known) {
    const actual = median(
        observations.map((e) => effectiveAnswerTime(e) / 1000),
      ),
      ratio = q.expectedSeconds > 0 ? actual / q.expectedSeconds : 0;
    if (
      ratio > policy.signals.metadataTimeRatio ||
      ratio < 1 / policy.signals.metadataTimeRatio
    ) {
      confidence.expectedSeconds = Math.min(
        confidence.expectedSeconds,
        policy.signals.metadataSuspectConfidence,
      );
      flags.push('跨日实际作答时长持续偏离标注');
    }
    const peers = (ctx.bySkill.get(q.nodeId + '::' + q.skillId) ?? []).filter(
      (e) =>
        e.questionId !== q.id &&
        e.nodeId === q.nodeId &&
        e.skillId === q.skillId &&
        Math.abs(e.difficulty - q.difficulty) < 1,
    );
    if (
      peers.length >= policy.signals.metadataMinSamples &&
      Math.abs(
        mean(peers.map((e) => e.score)) -
          mean(observations.map((e) => e.score)),
      ) > policy.signals.metadataSuccessTolerance
    ) {
      confidence.difficulty = Math.min(
        confidence.difficulty,
        policy.signals.metadataSuspectConfidence,
      );
      confidence.skill = Math.min(
        confidence.skill,
        policy.signals.metadataSuspectConfidence,
      );
      flags.push('与同能力同难度题表现持续冲突，需核对难度或能力标注');
    }
  }
  return {
    confidence,
    suspect: flags.length > 0,
    flags,
    samples: observations.length,
    days,
    explanation: flags.length
      ? flags.join('；')
      : known
        ? '当前行为记录未发现标注冲突。'
        : '样本不足，标注置信度暂为先验；不擅自重标题目。',
  };
}

export type ExamImpactSignal = {
  value: number;
  known: boolean;
  samples: number;
  examId?: string;
  scoreGap: number;
  topicWeight: number;
  improvability: number;
  remainingTime: number;
  gpaMarginal: number;
  estimatedCredits: boolean;
  explanation: string;
};
export function examImpact(
  data: StudyData,
  subject: Subject | 'all',
  nodeId?: string,
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
): ExamImpactSignal {
  const ctx = signalContext(data, now, policy, context);
  if (subject === 'all') {
    const candidates = [...new Set(data.exams.map((e) => e.subject))].map((s) =>
      examImpact(data, s, nodeId, now, policy, ctx),
    );
    return (
      candidates.sort((a, b) => b.value - a.value)[0] ?? {
        value: 0,
        known: false,
        samples: 0,
        scoreGap: 0,
        topicWeight: 0,
        improvability: 0,
        remainingTime: 0,
        gpaMarginal: 0,
        estimatedCredits: true,
        explanation: '没有已登记的相关未来考试。',
      }
    );
  }
  const config = gpaConfig(data),
    events = (ctx.bySubject.get(subject) ?? []).filter(
      (e) => e.subject === subject && (!nodeId || e.nodeId === nodeId),
    ),
    results = data.exams
      .filter(
        (e) =>
          e.subject === subject &&
          validResult(e.result) &&
          Date.parse(e.result.recordedAt) <= now &&
          validExamDate(e.date) &&
          new Date(e.date + 'T23:59:59').getTime() <= now,
      )
      .sort((a, b) => b.date.localeCompare(a.date)),
    latest = results[0];
  const candidates = data.exams
    .filter(
      (e) =>
        isExamScheduled(e) &&
        e.subject === subject &&
        validExamDate(e.date) &&
        new Date(e.date + 'T23:59:59').getTime() >= now &&
        (!nodeId || !e.scope.length || e.scope.includes(nodeId)),
    )
    .map((exam) => {
      const days = Math.max(
          0,
          (new Date(exam.date + 'T23:59:59').getTime() - now) / DAY,
        ),
        score = latest?.result?.score,
        maxScore = latest?.result?.maxScore ?? 100,
        current = score === undefined ? undefined : score / maxScore,
        target = bounded(exam.target / 100),
        scoreGap =
          current === undefined
            ? policy.signals.examGapFallback
            : bounded(target - current),
        node = data.nodes.find((n) => n.id === nodeId),
        topicWeight = node ? bounded(node.examWeight) : 1;
      const weights = data.exams
          .filter(
            (e) =>
              validResult(e.result) && Date.parse(e.result.recordedAt) <= now,
          )
          .map((e) => (config.weighted ? e.result!.credits : 1)),
        credits = config.weighted ? (latest?.result?.credits ?? 1) : 1,
        share = credits / (weights.reduce((a, b) => a + b, 0) + credits),
        ratio =
          current ??
          bounded(events.length ? mean(events.map((e) => e.score)) : target),
        step = policy.signals.examMarginalStep;
      let gpaMarginal = 0;
      try {
        const point = (r: number) => examGradePoint(config,r*maxScore,maxScore);
        gpaMarginal =
          bounded(
            (point(Math.min(1, ratio + step)) - point(ratio)) / config.scale,
          ) * share;
      } catch {
        /* invalid formulas are already guarded by gpaConfig */
      }
      const early = events.slice(0, Math.floor(events.length / 2)),
        late = events.slice(Math.floor(events.length / 2)),
        improvability =
          events.length >= policy.signals.assessmentMinSamples
            ? bounded(
                (mean(late.map((e) => e.score)) -
                  mean(early.map((e) => e.score)) +
                  1) /
                  2,
              )
            : policy.signals.examImprovabilityFallback,
        remainingTime = 1 / (1 + days / policy.signals.examHorizonDays),
        examShare = credits / Math.max(credits, ...weights, 1),
        value = bounded(
          examShare * scoreGap * topicWeight * improvability * remainingTime +
            gpaMarginal,
        );
      return {
        value,
        known: !!latest,
        samples: events.length,
        examId: exam.id,
        scoreGap,
        topicWeight,
        improvability,
        remainingTime,
        gpaMarginal,
        estimatedCredits: !latest,
        explanation: latest
          ? '结合最近实考目标差距、课程权重、可改进程度与 GPA 公式的边际变化。'
          : '尚无该科实考成绩；影响仅作保守估计，不预测实考分数。',
      };
    })
    .sort((a, b) => b.value - a.value);
  return (
    candidates[0] ?? {
      value: 0,
      known: false,
      samples: events.length,
      scoreGap: 0,
      topicWeight: 0,
      improvability: 0,
      remainingTime: 0,
      gpaMarginal: 0,
      estimatedCredits: true,
      explanation: '没有已登记的相关未来考试。',
    }
  );
}

export function assessmentInformation(
  data: StudyData,
  subject?: Subject | 'all',
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
) {
  const ctx = signalContext(data, now, policy, context);
  const events = ctx.independent.filter(
      (e) => !subject || subject === 'all' || e.subject === subject,
    ),
    ordinary = events.filter(
      (e) => !e.learningEvidence?.pressure && e.source !== 'test',
    ),
    pressureEvents = events.filter((e) => e.learningEvidence?.pressure),
    skills = new Map<string, AnswerEvent[]>();
  for (const e of ordinary) {
    const a = skills.get(key(e)) ?? [];
    a.push(e);
    skills.set(key(e), a);
  }
  const covered = [...skills.values()],
    available = new Set(
      data.questions
        .filter(
          (q) =>
            q.reviewStatus !== 'paused' &&
            (!subject || subject === 'all' || q.subject === subject),
        )
        .map((q) => q.nodeId + '::' + q.skillId),
    ).size,
    coverage = bounded(covered.length / Math.max(1, available)),
    uncertainty = mean(
      covered.map((a) => {
        const p = mean(a.map((e) => e.score));
        return Math.max(4 * p * (1 - p), 1 / (1 + a.length));
      }),
    ),
    readiness =
      ordinary.length /
      (ordinary.length + policy.signals.assessmentEvidenceScale),
    recentTests = events.filter(
      (e) => e.source === 'test' && Date.parse(e.occurredAt) >= now - DAY,
    ),
    recheckDiminishing =
      1 / (1 + recentTests.length / policy.signals.assessmentEvidenceScale),
    enough = ordinary.length >= policy.signals.assessmentSufficientSamples,
    stable = covered.length
      ? mean(
          covered.map((a) => Math.abs(mean(a.map((e) => e.score)) - 0.5) * 2),
        )
      : 0;
  const test =
    ordinary.length >= policy.signals.assessmentMinSamples
      ? bounded(
          coverage *
            readiness *
            uncertainty *
            recheckDiminishing *
            (enough ? 1 - stable : 1),
        )
      : 0;
  const ordinaryBySkill = new Map(
      covered.map((a) => [key(a[0]), mean(a.map((e) => e.score))]),
    ),
    matchedPressure = pressureEvents.filter((e) => ordinaryBySkill.has(key(e))),
    pressureGap = mean(
      matchedPressure.map((e) =>
        Math.max(0, ordinaryBySkill.get(key(e))! - e.score),
      ),
    ),
    baselineDays = new Set(
      ordinary.map((e) => localDay(new Date(e.occurredAt))),
    ).size,
    pressureUnknown =
      1 / (1 + matchedPressure.length / policy.signals.pressureEvidenceScale),
    baselineCoverage =
      ordinary.length / (ordinary.length + policy.signals.pressureMinBaseline),
    baselineSuccess = mean(ordinary.map((e) => e.score)),
    pressure =
      ordinary.length >= policy.signals.pressureMinBaseline &&
      baselineDays >= policy.signals.pressureMinDays
        ? bounded(
            baselineCoverage *
              baselineSuccess *
              mean([pressureUnknown, pressureGap]),
          )
        : 0;
  return {
    test,
    pressure,
    known: ordinary.length >= policy.signals.assessmentMinSamples,
    samples: ordinary.length,
    coverage,
    uncertainty,
    pressureSamples: matchedPressure.length,
    pressureGap,
    baselineDays,
    sufficientEvidence:
      enough && stable >= 1 - policy.signals.metadataSuccessTolerance,
    explanation:
      ordinary.length < policy.signals.assessmentMinSamples
        ? '独立证据不足，先学习与练习；不反复追加验证。'
        : `测试价值参考能力覆盖与不确定性；压力验证另需跨日基线，已有验证会递减价值。`,
  };
}

export type StudyHypothesis = {
  type: 'speed' | 'retention' | 'concept' | 'fatigue';
  subject?: Subject;
  nodeId?: string;
  claim?: string;
};
export function verifiedHypothesis(
  data: StudyData,
  hypothesis: StudyHypothesis,
  now = Date.now(),
  policy = policyFor(data),
  context?: SignalContext,
) {
  const ctx = signalContext(data, now, policy, context);
  const all = ctx.independent.filter(
      (e) =>
        (!hypothesis.subject || e.subject === hypothesis.subject) &&
        (!hypothesis.nodeId || e.nodeId === hypothesis.nodeId),
    ),
    min = policy.signals.hypothesisMinSamples;
  let supported = false,
    samples = all.length,
    strategy: string | undefined;
  if (hypothesis.type === 'fatigue') {
    const fatigue = fatigueState(data, now, policy, ctx);
    samples = fatigue.samples;
    supported = fatigue.known && fatigue.value >= policy.signals.fatigueHigh;
    if (supported) strategy = 'shorter-light-block';
  }
  if (hypothesis.type === 'speed') {
    const slow = all.filter(
        (e) =>
          e.expectedSeconds > 0 &&
          effectiveAnswerTime(e) > e.expectedSeconds * 1000,
      ),
      timed = all.filter((e) => e.learningEvidence?.pressure),
      untimed = all.filter((e) => !e.learningEvidence?.pressure),
      gap = mean(untimed.map((e) => e.score)) - mean(timed.map((e) => e.score));
    supported =
      slow.length >= policy.signals.speedMinSamples &&
      timed.length >= min &&
      untimed.length >= min &&
      gap > policy.signals.metadataSuccessTolerance;
    if (supported) strategy = 'paced-worked-example';
  }
  if (hypothesis.type === 'retention') {
    const delayed = all.filter((e) =>
      all.some(
        (prev) =>
          key(prev) === key(e) &&
          prev.questionId !== e.questionId &&
          prev.score > e.score &&
          Date.parse(e.occurredAt) - Date.parse(prev.occurredAt) >= DAY,
      ),
    );
    samples = delayed.length;
    supported =
      delayed.length >= min &&
      new Set(delayed.map((e) => localDay(new Date(e.occurredAt)))).size >=
        policy.signals.pressureMinDays;
    if (supported) strategy = 'shorter-recall-interval';
  }
  if (hypothesis.type === 'concept') {
    const confirmed = all.filter(
      (e) =>
        e.errorCause?.confirmed &&
        e.errorCause.concept > e.errorCause.unknown &&
        new Set(e.errorCause.evidenceIds ?? []).size >= 2,
    );
    samples = confirmed.length;
    supported = confirmed.length >= min;
    if (supported) strategy = 'worked-example-then-verify';
  }
  return {
    type: hypothesis.type,
    supported,
    samples,
    strategy,
    explanation: supported
      ? '候选解释已获得独立作答证据支持，可采用相应学习策略。'
      : '证据不足，仅保留为待验证解释；不更改掌握度、分数或任务规则。',
  };
}
