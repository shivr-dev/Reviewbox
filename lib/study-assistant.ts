import { buildQueue, computeMastery, forgettingRisk, DAY } from './engine';
import {
  cleanEvents,
  evidenceReliability,
  memoryFamily,
  memoryFingerprint,
  objective,
  pressureQuestions,
  reusable,
} from './learning-intelligence';
import {
  keyOf,
  localDay,
  SUBJECTS,
  subjectName,
  type AnswerEvent,
  type QueueItem,
  type StudyData,
  type Subject,
} from './model';
import { isPinyin } from './question-tools';
import { examFeedback } from './exam-outcomes';
import { policyFor } from './policy-config';
import {
  assessmentInformation,
  examImpact,
  metadataQuality,
  createSignalContext,
} from './learning-signals';
import {
  effectiveAnswerTime,
  skillPracticeLimit,
  dependencyLinks,
  hintEvidenceWeight,
} from './learning-evidence';

export type AssistantSettings = {
  version: 1;
  onboardedAt?: string;
  weights: Record<Subject, number>;
  dailyMinutes: number;
};
export type AssistantStageKind = 'prerequisite' | 'recall' | 'learn' | 'verify';
export type AssistantSkillState =
  | 'unknown'
  | 'developing'
  | 'fragile'
  | 'retained';
export type AssistantStage = {
  kind: AssistantStageKind;
  title: string;
  seconds: number;
  items: QueueItem[];
  reasons: string[];
};
export type AssistantRecommendation = {
  mode: 'initial' | 'test' | 'pressure';
  subject: Subject | 'all';
  scope: string[];
  title: string;
  reason: string;
  questions: QueueItem[];
  informationValue?: number;
};
const clamp = (n: number, low = 0, high = 1) =>
  Math.max(low, Math.min(high, n));
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((sum, x) => sum + x, 0) / xs.length : 0;
const duration = (seconds: number) =>
  Number.isFinite(seconds) ? clamp(seconds, 15, 1200) : 60;
const parsedNow = (now: number) => (Number.isFinite(now) ? now : Date.now());

export function assistantSettings(data: StudyData): AssistantSettings {
  const saved = (
    data.settings as StudyData['settings'] & {
      assistant?: Partial<AssistantSettings>;
    }
  ).assistant;
  const weights = Object.fromEntries(
    SUBJECTS.map(({ id }) => {
      const n = saved?.weights?.[id];
      return [
        id,
        typeof n === 'number' && Number.isFinite(n) ? clamp(n, 0, 5) : 3,
      ];
    }),
  ) as Record<Subject, number>;
  const minutes = saved?.dailyMinutes ?? data.settings.dailyMinutes;
  return {
    version: 1,
    onboardedAt: saved?.onboardedAt,
    weights,
    dailyMinutes:
      typeof minutes === 'number' && Number.isFinite(minutes)
        ? clamp(minutes, 10, 120)
        : 20,
  };
}

/** Observations must still correspond to available, uncontested content. Raw records stay immutable. */
export function assistantObservations(data: StudyData, now: number) {
  const questions = new Map(data.questions.map((q) => [q.id, q]));
  const nodes = new Map(data.nodes.map((n) => [n.id, n]));
  const seen = new Set<string>();
  return cleanEvents(data.events, now).filter((e) => {
    const q = questions.get(e.questionId),
      node = nodes.get(e.nodeId);
    if (
      !q ||
      q.reviewStatus === 'paused' ||
      !node ||
      q.nodeId !== e.nodeId ||
      q.skillId !== e.skillId ||
      q.subject !== e.subject ||
      node.subject !== e.subject ||
      !node.skills.some((s) => s.id === e.skillId)
    )
      return false;
    // Importing the same completed answer with another id must not inflate the evidence.
    const fingerprint = [e.sessionId, e.questionId, e.occurredAt,e.attemptNumber??''].join('|');
    if (seen.has(fingerprint)) return false;
    seen.add(fingerprint);
    return true;
  });
}
export function reliableAssistantEvent(e: AnswerEvent) {
  return (
    Number.isFinite(e.activeThinkMs) &&
    e.activeThinkMs > 0 &&
    e.activeThinkMs <= DAY &&
    Number.isFinite(e.expectedSeconds) &&
    e.expectedSeconds > 0 &&
    (e.evidenceWeight === undefined || e.evidenceWeight > 0) &&
    hintEvidenceWeight(e) >= policyFor().evidence.hintWeights.light &&
    !e.learningEvidence?.suspect &&
    !e.learningEvidence?.timedOut &&
    e.predictedConfidence !== 'guess' &&
    evidenceReliability(e) >= 0.8
  );
}
const observations = assistantObservations,
  reliable = reliableAssistantEvent;
function dayOf(e: AnswerEvent) {
  return localDay(new Date(e.occurredAt));
}
function examDays(date: string, now: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Infinity;
  const at = new Date(date + 'T23:59:59').getTime();
  return at >= now ? (at - now) / DAY : Infinity;
}
const STAGE_TITLES: Record<AssistantStageKind, string> = {
  prerequisite: '先补前置基础',
  recall: '到期主动回忆',
  learn: '学习与基础巩固',
  verify: '间隔与变式验证',
};

/** Research-informed, transparent scheduling heuristics; not a clinically validated optimum.
 * Retrieval: Roediger & Karpicke (2006), doi:10.1111/j.1467-9280.2006.01693.x.
 * Spacing depends on retention horizon: Cepeda et al. (2008), doi:10.1111/j.1467-9280.2008.02209.x.
 * Existing scheduling evidence adjusts priorities; no universal forgetting curve is claimed.
 */
export function dailyStudyPlan(data: StudyData, now = Date.now()) {
  now = parsedNow(now);
  const policy = policyFor(data);
  const signalContext=createSignalContext(data,now,policy);
  const settings = assistantSettings(data),
    today = localDay(new Date(now));
  const events = observations(data, now),
    safe = { ...data, events };
  const states = computeMastery(data.nodes, events);
  const activeQuestions = data.questions.filter(
    (q) =>
      reusable(q, now) &&
      settings.weights[q.subject] > 0 &&
      data.nodes.some(
        (n) =>
          n.id === q.nodeId &&
          n.subject === q.subject &&
          n.skills.some((s) => s.id === q.skillId),
      ),
  );
  const available = new Set(
    activeQuestions.map((q) => keyOf(q.nodeId, q.skillId)),
  );
  const history = new Map<string, AnswerEvent[]>();
  for (const e of events) {
    const key = keyOf(e.nodeId, e.skillId),
      rows = history.get(key) ?? [];
    rows.push(e);
    history.set(key, rows);
  }
  const skills = data.nodes.flatMap((n) =>
    n.skills
      .filter((s) => available.has(keyOf(n.id, s.id)))
      .map((s) => {
        const key = keyOf(n.id, s.id),
          rows = history.get(key) ?? [],
          proof = rows.filter(reliable);
        const days = new Set(proof.map(dayOf)).size,
          tasks = new Set(proof.map((e) => e.questionId)).size;
        const state: AssistantSkillState = !rows.length
          ? 'unknown'
          : proof.length < 2
            ? 'developing'
            : mean(proof.slice(-4).map((e) => e.score)) < 0.6
              ? 'fragile'
              : days >= 3 && tasks >= 2 && (states[key]?.stage ?? 0) >= 1
                ? 'retained'
                : 'developing';
        return {
          key,
          nodeId: n.id,
          skillId: s.id,
          subject: n.subject,
          title: n.title + ' · ' + s.title,
          state,
          observations: rows.length,
          reliableObservations: proof.length,
          days,
          mastery: rows.length ? (states[key]?.mastery ?? null) : null,
        };
      }),
  );
  const skillMap = new Map(skills.map((s) => [s.key, s]));
  const completedSeconds = Math.round(
    events
      .filter((e) => dayOf(e) === today)
      .reduce(
        (sum, e) =>
          sum +
          (Number.isFinite(e.activeThinkMs) && e.activeThinkMs > 0
            ? effectiveAnswerTime(e) / 1000
            : 0),
        0,
      ),
  );
  const budgetSeconds = Math.round(settings.dailyMinutes * 60),
    remainingSeconds = Math.max(0, budgetSeconds - completedSeconds);
  const base = buildQueue(
    {
      ...safe,
      settings: { ...data.settings, dailyMinutes: settings.dailyMinutes },
    },
    { practice: true, limit: Math.max(20, activeQuestions.length), now },
  );
  const baseMap = new Map(base.map((item) => [item.question.id, item]));
  const fingerprints = memoryFingerprint(safe, now);
  const blocked = new Map<string, string[]>();
  for (const n of data.nodes) {
    const prerequisites = dependencyLinks(n)
      .filter((d) => d.kind === 'requires' && d.weight >= 0.8)
      .map((d) => d.nodeId)
      .filter((id) => {
        const pre = data.nodes.find((p) => p.id === id);
        if (!pre) return false;
        return pre.skills.some((s) => {
          const info = skillMap.get(keyOf(pre.id, s.id));
          return info && ['unknown', 'fragile'].includes(info.state);
        });
      });
    if (prerequisites.length) blocked.set(n.id, prerequisites);
  }
  const prerequisiteIds = new Set([...blocked.values()].flat());
  const candidates = activeQuestions.flatMap((q) => {
    const n = data.nodes.find((n) => n.id === q.nodeId);
    if (!n || !available.has(keyOf(q.nodeId, q.skillId))) return [];
    const key = keyOf(q.nodeId, q.skillId),
      info = skillMap.get(key)!,
      state = states[key],
      rows = history.get(key) ?? [];
    const todayRows = rows.filter((e) => dayOf(e) === today);
    // New-item diagnosis can use another item, but same-day repetition is never called spacing.
    if (
      todayRows.some((e) => e.questionId === q.id) ||
      todayRows.length >= skillPracticeLimit(state, policy)
    )
      return [];
    const due = !!state?.nextReview && Date.parse(state.nextReview) <= now;
    const cross = baseMap.get(q.id)?.verificationOf;
    if (info.state === 'retained' && !due && !cross) return [];
    if (
      info.state === 'developing' &&
      rows.length &&
      !due &&
      !cross &&
      todayRows.length >= skillPracticeLimit(state, policy)
    )
      return [];
    const previous = rows.at(-1);
    const delayed =
      previous &&
      dayOf(previous) !== today &&
      now - Date.parse(previous.occurredAt) >= DAY / 2;
    let kind: AssistantStageKind =
      prerequisiteIds.has(q.nodeId) && info.state !== 'retained'
        ? 'prerequisite'
        : cross
          ? 'verify'
          : due && info.state !== 'unknown'
            ? 'recall'
            : delayed && info.state === 'developing'
              ? 'verify'
              : 'learn';
    const baseReason =
      kind === 'prerequisite'
        ? info.state === 'unknown'
          ? '先确认后续学习需要的前置能力；未测不等于不会。'
          : '近期前置能力作答不稳定，先补基础。'
        : cross
          ? '上一道答对的证据不足，使用已有变式交叉验证。'
          : kind === 'recall'
            ? '已到个人复习时间，先尝试回忆再查看反馈。'
            : kind === 'verify'
              ? '与上次学习隔开后重新作答，检验能否保留。'
              : info.state === 'unknown'
                ? '尚无作答证据，先诊断再决定学习深度。'
                : '近期作答提示需要巩固；同日练习不会被认作长期掌握。';
    const feedback = examFeedback(data, q.subject, n.id, now);
    const reason = feedback?.boost
      ? baseReason + ' ' + feedback.reason
      : baseReason;
    const exam = Math.min(
      ...data.exams
        .filter(
          (e) =>
            e.subject === q.subject &&
            (!e.scope.length || e.scope.includes(n.id)),
        )
        .map((e) => examDays(e.date, now)),
      Infinity,
    );
    const fingerprint = fingerprints.find(
      (f) => f.family === memoryFamily(q, n),
    );
    const quality = metadataQuality(data, q, now,policy,signalContext),
      impact = examImpact(data, q.subject, n.id, now,policy,signalContext),
      u = policy.utility;
    const weakness = state?.attemptCount ? 1 - state.mastery : 1;
    const priority =
      ((u.learning * weakness +
        u.retention * (state ? forgettingRisk(state, now) : 0) +
        u.exam * (impact.value + (feedback?.boost ?? 0)) +
        u.information * (cross ? 1 : info.state === 'unknown' ? 1 : 0) +
        u.exploration * (kind === 'learn' ? u.explorationShare : 0)) *
        (settings.weights[q.subject] / 5) *
        (quality.suspect ? policy.engine.priority.dependencyDiscount : 1)) /
      Math.max(u.minimumMinutes, duration(q.expectedSeconds) / 60);
    return [
      {
        kind,
        seconds: duration(q.expectedSeconds),
        item: {
          ...baseMap.get(q.id),
          question: q,
          priority,
          reason,
        } as QueueItem,
        reason,
        exam,
      },
    ];
  });
  candidates.sort(
    (a, b) =>
      b.item.priority - a.item.priority ||
      a.item.question.id.localeCompare(b.item.question.id),
  );
  const selected: typeof candidates = [],
    perSkill = new Map<string, number>();
  let seconds = 0;
  while (candidates.length) {
    const index = candidates.findIndex((c) => {
      const q = c.item.question,
        key = keyOf(q.nodeId, q.skillId);
      if (
        seconds + c.seconds > remainingSeconds ||
        (perSkill.get(key) ?? 0) >= skillPracticeLimit(states[key], policy)
      )
        return false;
      // Every prerequisite with available diagnostic material is scheduled before its dependent.
      return !(blocked.get(q.nodeId) ?? []).some(
        (id) => !selected.some((x) => x.item.question.nodeId === id),
      );
    });
    if (index < 0) break;
    const c = candidates.splice(index, 1)[0];
    selected.push(c);
    seconds += c.seconds;
    const key = keyOf(c.item.question.nodeId, c.item.question.skillId);
    perSkill.set(key, (perSkill.get(key) ?? 0) + 1);
  }
  // Contiguous stages preserve the actual prerequisite order, including cyclic-graph safety.
  const stages: AssistantStage[] = [];
  for (const c of selected) {
    let stage = stages.at(-1);
    if (!stage || stage.kind !== c.kind) {
      stage = {
        kind: c.kind,
        title: STAGE_TITLES[c.kind],
        seconds: 0,
        items: [],
        reasons: [],
      };
      stages.push(stage);
    }
    stage.seconds += c.seconds;
    stage.items.push(c.item);
    if (!stage.reasons.includes(c.reason)) stage.reasons.push(c.reason);
  }
  const recommendations: AssistantRecommendation[] = [];
  for (const { id: subject } of SUBJECTS.filter(
    (s) => settings.weights[s.id] > 0,
  )) {
    const subjectEvents = events.filter((e) => e.subject === subject),
      scope = [
        ...new Set(
          activeQuestions
            .filter((q) => q.subject === subject)
            .map((q) => q.nodeId),
        ),
      ];
    const information = assessmentInformation(data, subject, now,policy,signalContext);
    const nearest = Math.min(
      Infinity,
      ...data.exams
        .filter((e) => e.subject === subject)
        .map((e) => examDays(e.date, now)),
    );
    const pendingInitial=data.tests.some(t=>t.subject===subject&&t.eventIds.some(id=>!events.some(e=>e.id===id)));
    const modes: AssistantRecommendation['mode'][] = (!subjectEvents.length||pendingInitial)
      ? ['initial']
      : [
          'test',
          ...(nearest >= 2 && Number.isFinite(nearest)
            ? ['pressure' as const]
            : []),
        ];
    for (const mode of modes) {
      const value =
        mode === 'initial'
          ? 1
          : mode === 'test'
            ? information.test
            : information.pressure;
      if (value <= 0) continue;
      const reason =
        mode === 'initial'
          ? '先用已有代表题确认起点；未测保持未知，拼音交卷后逐题自评。'
          : information.explanation;
      const pool =
        mode === 'pressure'
          ? pressureQuestions(safe, states, subject, scope, now).filter(
              (q) =>
                !events.some(
                  (e) =>
                    e.questionId === q.id &&
                    now - Date.parse(e.occurredAt) < DAY / 2,
                ),
            )
          : activeQuestions.filter(
              (q) => q.subject === subject && (objective(q) || isPinyin(q)),
            );
      const seenSkills = new Map<string, number>();
      const ordered = [...pool].sort(
        (a, b) =>
          Number(subjectEvents.some((e) => e.questionId === a.id)) -
            Number(subjectEvents.some((e) => e.questionId === b.id)) ||
          a.id.localeCompare(b.id),
      );
      const questions = ordered
        .filter((q) => {
          const k = keyOf(q.nodeId, q.skillId),
            n = seenSkills.get(k) ?? 0;
          if (n >= policy.evidence.retentionLimit) return false;
          seenSkills.set(k, n + 1);
          return true;
        })
        .slice(
          0,
          mode === 'initial'
            ? policy.assistant.initialPerSubject
            : policy.utility.candidateLimit,
        )
        .map((question) => ({ question, reason, priority: value }));
      if (questions.length)
        recommendations.push({
          mode,
          subject,
          scope,
          title:
            subjectName(subject) +
            (mode === 'initial'
              ? '首次能力定位'
              : mode === 'pressure'
                ? '考前压力测试'
                : '阶段短测'),
          reason,
          questions,
          informationValue: value,
        });
    }
  }
  recommendations.sort(
    (a, b) =>
      Number(a.mode !== 'initial') - Number(b.mode !== 'initial') ||
      (b.subject === 'all' ? 0 : settings.weights[b.subject]) -
        (a.subject === 'all' ? 0 : settings.weights[a.subject]),
  );
  const initialSubjects = recommendations.filter((r) => r.mode === 'initial');
  if (initialSubjects.length > 1) {
    const questions: QueueItem[] = [];
    for (
      let index = 0;
      questions.length < policy.assistant.initialCombined;
      index++
    ) {
      const round = initialSubjects.flatMap((r) =>
        r.questions[index] ? [r.questions[index]] : [],
      );
      if (!round.length) break;
      questions.push(
        ...round.slice(0, policy.assistant.initialCombined - questions.length),
      );
    }
    recommendations.unshift({
      mode: 'initial',
      subject: 'all',
      scope: [...new Set(questions.map((q) => q.question.nodeId))],
      title: '首次综合能力定位',
      informationValue: 1,
      reason:
        '覆盖已导入且重视的学科，以少量代表题确认起点；未测能力保持未知。',
      questions,
    });
  }
  return {
    date: today,
    settings,
    queue: selected.map((c) => c.item),
    stages,
    skills,
    recommendations,
    budgetSeconds,
    completedSeconds,
    remainingSeconds,
    scheduledSeconds: seconds,
    minutes: Math.ceil(seconds / 60),
    missingSubjects: SUBJECTS.filter(
      (s) =>
        settings.weights[s.id] > 0 &&
        !activeQuestions.some((q) => q.subject === s.id),
    ).map((s) => s.id),
    status: !activeQuestions.length
      ? '需要导入学习内容'
      : !remainingSeconds
        ? '今日学习时间已完成'
        : !selected.length
          ? '今天暂无到期任务；可选择阶段短测'
          : '今日计划已根据现有学习证据调整',
    methodology:
      '这是依据主动回忆、间隔学习原则与个人历史的透明经验计划；证据不足时保持未知，不承诺科学最优。',
  };
}

/** Most recently completed local Monday-Sunday week; date arithmetic handles DST/year boundaries. */
export function completedWeek(now = Date.now()) {
  const current = new Date(parsedNow(now));
  current.setHours(0, 0, 0, 0);
  current.setDate(current.getDate() - ((current.getDay() + 6) % 7));
  const start = new Date(current);
  start.setDate(start.getDate() - 7);
  const last = new Date(current);
  last.setDate(last.getDate() - 1);
  return {
    id: localDay(start),
    start: start.toISOString(),
    endExclusive: current.toISOString(),
    startDate: localDay(start),
    endDate: localDay(last),
    releasedOn: localDay(current),
  };
}

export function weeklyLearningGpa(data: StudyData, now = Date.now()) {
  now = parsedNow(now);
  const period = completedWeek(now),
    from = Date.parse(period.start),
    until = Date.parse(period.endExclusive);
  const events = observations(data, Math.min(now, until - 1));
  const settings = assistantSettings(data);
  const eligible = events.filter(
    (e) =>
      reliable(e) &&
      !e.usedHint &&
      !e.hintLevel &&
      effectiveAnswerTime(e) >= 1500 &&
      !e.learningEvidence?.pressure &&
      settings.weights[e.subject] > 0,
  );
  const previous = new Map<string, AnswerEvent>(),
    dailyQuestions = new Set<string>(),
    trials: AnswerEvent[] = [];
  const week: AnswerEvent[] = [];
  for (const e of eligible) {
    const key = keyOf(e.nodeId, e.skillId),
      old = previous.get(key),
      at = Date.parse(e.occurredAt);
    const dailyKey = e.questionId + '|' + dayOf(e);
    if (dailyQuestions.has(dailyKey)) continue;
    dailyQuestions.add(dailyKey);
    if (at >= from) week.push(e);
    if (
      at >= from &&
      old &&
      old.score >= 0.85 &&
      dayOf(e) !== dayOf(old) &&
      at - Date.parse(old.occurredAt) >= DAY / 2 &&
      at - Date.parse(old.occurredAt) <= 180 * DAY &&
      Math.abs(old.difficulty - e.difficulty) <= 1
    )
      trials.push(e);
    previous.set(key, e);
  }
  // A completed report is based on content/settings present now, not fabricated historic availability.
  const available = new Set(
    data.questions
      .filter((q) => reusable(q, until - 1) && settings.weights[q.subject] > 0)
      .map((q) => keyOf(q.nodeId, q.skillId)),
  );
  const tested = new Set(
    week
      .filter((e) => available.has(keyOf(e.nodeId, e.skillId)))
      .map((e) => keyOf(e.nodeId, e.skillId)),
  );
  const days = new Set(week.map(dayOf)).size,
    trialSkills = new Set(trials.map((e) => keyOf(e.nodeId, e.skillId))).size;
  const accuracy = trials.length ? mean(trials.map((e) => e.score)) : null;
  const coverage = available.size ? tested.size / available.size : 0;
  const distributed = clamp(days / 4);
  const sufficient =
    trials.length >= 8 && days >= 3 && trialSkills >= 2 && available.size > 0;
  const value = sufficient
    ? Math.round(
        4 * (0.7 * accuracy! + 0.2 * coverage + 0.1 * distributed) * 100,
      ) / 100
    : null;
  return {
    period,
    value,
    label: '学习 GPA（非官方成绩）',
    sample: trials.length,
    reliableAnswers: week.length,
    days,
    trialSkills,
    coverage,
    testedSkills: tested.size,
    availableSkills: available.size,
    components: {
      accuracy: { value: accuracy, weight: 0.7, title: '可靠间隔作答表现' },
      coverage: { value: coverage, weight: 0.2, title: '已测能力覆盖' },
      distribution: {
        value: distributed,
        weight: 0.1,
        title: '分散学习（四天达标）',
      },
    },
    reason: sufficient
      ? '上一个已结束周的可靠间隔作答、已测覆盖及分散学习综合估计。'
      : '样本不足：至少需要 8 次可靠间隔作答、3 个学习日和 2 种能力；不会以 XP 或同日连刷代替证据。',
    caveat:
      '0–4 分是本系统的学习过程指标，不等于学校 GPA。覆盖率按当前已导入内容与学科权重计算，撤销旧事件或修订争议题后会重新核算。',
  };
}

export function studyAssistantSnapshot(data: StudyData, now = Date.now()) {
  return {
    plan: dailyStudyPlan(data, now),
    weekly: weeklyLearningGpa(data, now),
  };
}
export type DailyStudyPlan = ReturnType<typeof dailyStudyPlan>;
export type WeeklyLearningGpa = ReturnType<typeof weeklyLearningGpa>;
export type StudyAssistantSnapshot = ReturnType<typeof studyAssistantSnapshot>;
