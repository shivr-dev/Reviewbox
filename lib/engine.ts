import { isExamScheduled } from './model';
import {
  keyOf,
  localDay,
  type Mastery,
  type AnswerEvent,
  type Node,
  type Exam,
  type StudyData,
  type QueueItem,
} from './model';
import {
  attributesFor,
  cognitiveDiagnosis,
  flowDifficulty,
  memoryFingerprint,
  memoryFamily,
  transferCandidates,
  verificationCandidate,
  cleanEvents,
} from './learning-intelligence';
import { dueRemediation } from './remediation';
import { DEFAULT_POLICY, policyFor, type PolicyConfig } from './policy-config';
import { metadataQuality, createSignalContext } from './learning-signals';
import { createTopicRotation } from './topic-rotation';
import {
  answerEvidenceWeight,
  hintEvidenceWeight,
  effectiveAnswerTime,
  adaptiveRecallInterval,
  errorCauseEstimate,
  skillPracticeLimit,
  dependencyLinks,
} from './learning-evidence';
export const DAY = 86400000;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function initial(nodeId: string, skillId: string): Mastery {
  return {
    nodeId,
    skillId,
    mastery: 0.35,
    stability: 0.5,
    confidence: 0.5,
    lastReviewed: null,
    lastSuccess: null,
    checkpoint: null,
    checkpointVariant: '',
    stage: 0,
    nextReview: null,
    attemptCount: 0,
    errorCount: 0,
    gainDay: '',
    dailyGain: 0,
    lastFailure: null,
  };
}
export function applyAnswer(
  old: Mastery,
  e: AnswerEvent,
  policy: PolicyConfig = DEFAULT_POLICY,
  history: AnswerEvent[] = [],
): Mastery {
  const s = { ...old };
  const now = Date.parse(e.occurredAt);
  if (
    e.voidedBy ||
    !Number.isFinite(now) ||
    !Number.isFinite(e.score) ||
    e.score < 0 ||
    e.score > 1
  )
    return s;
  const config = policy.evidence;
  const quality = answerEvidenceWeight(e, policy);
  const sameDay = s.gainDay === e.localDay;
  s.evidenceDays = [...new Set([...(s.evidenceDays ?? []), e.localDay])].slice(
    -180,
  );
  s.successDays = [...(s.successDays ?? [])];
  if (!sameDay) {
    s.gainDay = e.localDay;
    s.dailyGain = 0;
  }
  // Hint-assisted answers still contribute; only independent retrieval advances retention evidence.
  const reliable =
    e.score >= 0.85 &&
    hintEvidenceWeight(e, policy) === 1 &&
    !e.learningEvidence?.suspect &&
    e.predictedConfidence !== 'guess' &&
    effectiveAnswerTime(e) >=
      Math.max(1500, Math.min(5000, e.expectedSeconds * 200));
  let advanced = false;
  if (reliable) {
    s.lastSuccess = e.occurredAt;
    s.successDays = [...new Set([...s.successDays, e.localDay])].slice(-180);
    if (!s.checkpoint) {
      s.checkpoint = e.occurredAt;
      s.checkpointVariant = e.variant;
    } else if (
      now - Date.parse(s.checkpoint) >=
        adaptiveRecallInterval(old, e, policy) * DAY &&
      s.checkpointVariant !== e.variant
    ) {
      s.stage = Math.min(3, s.stage + 1);
      s.checkpoint = e.occurredAt;
      s.checkpointVariant = e.variant;
      advanced = true;
    }
  }
  const weight = clamp(e.evidenceWeight ?? 1);
  const evidence = clamp((e.score - 0.6) / 0.4, -1, 1) * weight;
  if (evidence > 0) {
    const gain = Math.max(
      0,
      Math.min(
        config.positiveRate * (1 - s.mastery) * evidence,
        config.dailyGainCap - s.dailyGain,
        [0.7, 0.82, 0.91, 0.99][s.stage] - s.mastery,
      ) * quality,
    );
    s.mastery += gain;
    s.dailyGain += gain;
  } else {
    const cause = errorCauseEstimate(e, history);
    // A single ambiguous loss has limited effect; corroborated concept evidence can matter more.
    const attribution = cause.confirmed
      ? config.failureAttribution.confirmedBase +
        cause.concept * config.failureAttribution.confirmedConcept
      : config.failureAttribution.unconfirmedBase +
        cause.concept * config.failureAttribution.unconfirmedConcept;
    s.mastery += config.negativeRate * evidence * quality * attribution;
  }
  s.mastery = clamp(s.mastery, 0, 0.99);
  // Smooth log-space updates, bounded per observation. Same-day repetition cannot inflate stability.
  if (e.score < 0.4 || (reliable && (!sameDay || advanced))) {
    const target =
      e.score < 0.4
        ? Math.max(0.25, s.stability * 0.5)
        : Math.max(s.stability, adaptiveRecallInterval(s, e, policy) * 1.5);
    const ratio = Math.exp(
      config.smoothing * Math.log(target / Math.max(0.25, old.stability)),
    );
    s.stability = clamp(
      old.stability *
        clamp(ratio, config.stabilityDownLimit, config.stabilityUpLimit),
      0.25,
      config.maxStability,
    );
  }
  if (e.score < 0.4) {
    s.lastFailure = e.occurredAt;
    s.errorCount++;
    // One failure does not erase several days of successful retention; fresh retrieval is due soon.
    if (s.errorCount >= 2 && s.mastery < 0.5)
      s.stage = Math.max(0, s.stage - 1);
  }
  let interval =
    e.score < 0.4
      ? Math.min(1, s.stability)
      : Math.min(
          adaptiveRecallInterval(s, e, policy),
          s.stability * (0.8 + 0.7 * s.mastery),
        );
  if (hintEvidenceWeight(e, policy) < 1) interval = Math.min(interval, 1);
  let due = now + Math.max(0.25, interval) * DAY;
  if (s.stage < 3 && s.checkpoint)
    due = Math.min(
      due,
      Date.parse(s.checkpoint) + adaptiveRecallInterval(s, e, policy) * DAY,
    );
  if (sameDay && old.nextReview && !advanced)
    due = Math.min(due, Date.parse(old.nextReview));
  s.nextReview = new Date(Math.max(now + 60000, due)).toISOString();
  s.lastReviewed = e.occurredAt;
  s.attemptCount++;
  s.confidence =
    (1 - config.smoothing) * s.confidence + config.smoothing * quality;
  return s;
}
export function computeMastery(
  nodes: Node[],
  events: AnswerEvent[],
  policy: PolicyConfig = DEFAULT_POLICY,
) {
  const map: Record<string, Mastery> = {};
  for (const n of nodes)
    for (const skill of n.skills)
      map[keyOf(n.id, skill.id)] = initial(n.id, skill.id);
  const seen = new Set<string>(),
    history: AnswerEvent[] = [];
  for (const e of [...events].sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  )) {
    if (e.voidedBy) continue;
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const targets = e.targets?.length
      ? e.targets
      : [{ skillId: e.skillId, score: e.score, weight: 1 }];
    for (const target of targets) {
      const k = keyOf(e.nodeId, target.skillId);
      map[k] = applyAnswer(
        map[k] ?? initial(e.nodeId, target.skillId),
        {
          ...e,
          skillId: target.skillId,
          score: target.score,
          evidenceWeight: target.weight * (e.evidenceWeight ?? 1),
        },
        policy,
        history,
      );
    }
    history.push(e);
  }
  return map;
}
export function forgettingRisk(s: Mastery, now = Date.now()) {
  return s.lastSuccess
    ? clamp(
        1 -
          Math.exp(
            -Math.max(0, now - Date.parse(s.lastSuccess)) /
              DAY /
              Math.max(0.25, s.stability),
          ),
      )
    : 0;
}
export function nodeMastery(n: Node, states: Record<string, Mastery>) {
  const items = n.skills
    .map((x) => states[keyOf(n.id, x.id)])
    .filter((x) => x?.attemptCount);
  return items.length
    ? items.reduce((a, s) => a + s.mastery, 0) / items.length
    : null;
}
export function priority(
  n: Node,
  s: Mastery,
  events: AnswerEvent[],
  exams: Exam[],
  now: number,
  policy: PolicyConfig = DEFAULT_POLICY,
) {
  events = cleanEvents(events, now);
  const weights = policy.engine.priority;
  events = events.filter((e) => !e.voidedBy);
  const today = localDay(new Date(now));
  const done = events.filter(
    (e) => e.nodeId === n.id && e.skillId === s.skillId && e.localDay === today,
  );
  const errors = events
    .filter(
      (e) =>
        e.nodeId === n.id &&
        e.skillId === s.skillId &&
        now - Date.parse(e.occurredAt) < 14 * DAY,
    )
    .reduce(
      (a, e) =>
        a +
        (1 - e.score) * Math.exp(-(now - Date.parse(e.occurredAt)) / DAY / 3),
      0,
    );
  const exam = Math.max(
    0,
    ...exams
      .filter(
        (e) =>
          isExamScheduled(e) &&
          e.subject === n.subject &&
          (!e.scope.length || e.scope.includes(n.id)) &&
          Date.parse(e.date + 'T23:59:59') >= now,
      )
      .map(
        (e) => clamp(1 - (Date.parse(e.date) - now) / DAY / 21) * n.examWeight,
      ),
  );
  const overdue = s.nextReview
    ? clamp((now - Date.parse(s.nextReview)) / DAY / Math.max(1, s.stability))
    : 1;
  return (
    (weights.weakness * (1 - s.mastery) +
      weights.forgetting * forgettingRisk(s, now) +
      weights.errors * clamp(errors) +
      weights.exam * exam +
      weights.importance * n.importance +
      weights.verification * overdue) /
    (1 + weights.repetitionPenalty * done.length)
  );
}
function boundedExpectedSeconds(seconds: number) {
  return Number.isFinite(seconds) ? clamp(seconds, 15, 900) : 60;
}
function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
export function buildQueue(
  data: StudyData,
  opts: {
    subject?: string;
    subjects?: string[];
    scope?: string[];
    limit?: number;
    now?: number;
    practice?: boolean;
    test?: boolean;
  } = {},
): QueueItem[] {
  data = {
    ...data,
    questions: data.questions.filter((q) => q.reviewStatus !== 'paused'),
  };
  const now = opts.now ?? Date.now(),
    today = localDay(new Date(now));
  const policy = policyFor(data),
    weights = policy.engine.priority;
  const signalContext = createSignalContext(data, now, policy),
    qualities = new Map<string, ReturnType<typeof metadataQuality>>();
  const contentQualityOf = (q: StudyData['questions'][number]) => {
    let quality = qualities.get(q.id);
    if (!quality) {
      quality = metadataQuality(data, q, now, policy, signalContext);
      qualities.set(q.id, quality);
    }
    return quality;
  };
  const states = computeMastery(
    data.nodes,
    cleanEvents(data.events, now),
    policy,
  );
  const events = cleanEvents(data.events, now);
  const fingerprints = memoryFingerprint(data, now);
  const diagnosis = cognitiveDiagnosis(data, opts.subject, now);
  const target =
    opts.limit ??
    Math.max(5, Math.floor((data.settings.dailyMinutes * 60) / 55));
  const active = data.nodes.filter(
    (n) =>
      (!opts.subject || n.subject === opts.subject) &&
      (!opts.subjects?.length || opts.subjects.includes(n.subject)) &&
      (!opts.scope?.length || opts.scope.includes(n.id)),
  );
  const candidates: QueueItem[] = [];
  const mastered: QueueItem[] = [];
  for (const n of active)
    for (const skill of n.skills) {
      const s = states[keyOf(n.id, skill.id)] ?? initial(n.id, skill.id);
      const history = events.filter(
        (e) => e.nodeId === n.id && e.skillId === skill.id,
      );
      const practiced = history.filter((e) => e.localDay === today);
      const skillLimit = skillPracticeLimit(s, policy);
      if (!opts.test && practiced.length >= skillLimit) continue;
      const high = s.mastery >= 0.9 && s.stage === 3;
      const due = !s.nextReview || Date.parse(s.nextReview) <= now;
      if (
        !opts.practice &&
        !opts.test &&
        !due &&
        !(s.mastery < 0.45 && practiced.length < 2)
      ) {
        if (
          !(
            high &&
            data.settings.surprise &&
            s.lastReviewed &&
            now - Date.parse(s.lastReviewed) >= 7 * DAY
          )
        )
          continue;
      }
      const flow = flowDifficulty(data, n.id, skill.id, s.mastery, now, events);
      const desired = flow.difficulty;
      const qs = data.questions
        .filter(
          (q) =>
            !q.tags.includes('exam-only') &&
            !q.tags.includes('course-check') &&
            (!q.tags.includes('course-content') ||
              (data.jobs ?? []).some(
                (c) =>
                  c.kind === 'course' &&
                  c.sections?.some(
                    (section: any) =>
                      section.content &&
                      q.id.startsWith(
                        'lesson-q:' +
                          section.id +
                          ':' +
                          section.revision +
                          ':practice:',
                      ),
                  ),
              )) &&
            q.nodeId === n.id &&
            q.skillId === skill.id &&
            (!q.expiresAt || Date.parse(q.expiresAt) > now),
        )
        .sort((a, b) => {
          const last = (id: string) =>
            history.filter((e) => e.questionId === id).at(-1)?.occurredAt ??
            '1970';
          const rank = (q: typeof a) =>
            Math.abs(q.difficulty - desired) *
              2 *
              contentQualityOf(q).confidence.difficulty +
            (practiced.some((e) => e.questionId === q.id) ? 20 : 0) +
            (last(q.id) !== '1970' ? 1 : 0) +
            hash(today + q.id);
          return rank(a) - rank(b);
        });
      for (const q of qs.slice(
        0,
        opts.test
          ? policy.evidence.retentionLimit
          : Math.max(0, skillLimit - practiced.length),
      )) {
        let reason = !s.attemptCount
          ? '初次诊断'
          : s.mastery < 0.45
            ? '巩固基础'
            : due
              ? '间隔复习'
              : '专项练习';
        let p = priority(n, s, data.events, data.exams, now, policy);
        const contentQuality = contentQualityOf(q);
        p *= contentQuality.confidence.skill;
        const weakness = diagnosis.find(
          (d) =>
            d.subject === n.subject &&
            d.identifiable &&
            d.deficit > 0.7 &&
            attributesFor(q, n).includes(d.attribute),
        );
        if (weakness && !opts.test) {
          p += weights.diagnosisBonus;
          reason = '能力诊断 · ' + weakness.title;
        }
        const fingerprint = fingerprints.find(
          (f) => f.family === memoryFamily(q, n),
        );
        if (fingerprint?.ready && fingerprint.factor < 0.9)
          p += weights.fingerprintBonus;
        const recent = history
          .slice()
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
        if (recent?.predictedConfidence === 'sure' && recent.score < 0.6) {
          p += weights.calibrationBonus;
          reason = '信心校准';
        }
        const weakPre = dependencyLinks(n)
          .filter((d) => d.kind === 'requires' && d.weight >= 0.8)
          .map((d) => data.nodes.find((x) => x.id === d.nodeId))
          .filter(Boolean)
          .find((x) => (nodeMastery(x!, states) ?? 0.35) < 0.45);
        if (weakPre && s.mastery < 0.45) {
          p *= weights.dependencyDiscount;
          reason = '基础诊断';
        }
        if (
          data.exams.some(
            (e) =>
              isExamScheduled(e) &&
              e.subject === n.subject &&
              (!e.scope.length || e.scope.includes(n.id)) &&
              Date.parse(e.date) > now &&
              Date.parse(e.date) - now < 14 * DAY,
          )
        )
          reason = '考试准备';
        const item = {
          question: q,
          priority: p,
          reason,
          scaffold: s.mastery < 0.35 ? n.description : undefined,
          predictedSuccess: flow.levels.find(
            (l) => l.difficulty === q.difficulty,
          )?.probability,
        };
        if (high && !due && !opts.practice && !opts.test) {
          item.reason = '随机抽查';
          mastered.push(item);
        } else candidates.push(item);
      }
    }
  // Add weak prerequisites before the dependent skill, without forcing repeats.
  for (const c of candidates) {
    if (
      active.some((n) =>
        dependencyLinks(n).some(
          (d) =>
            d.nodeId === c.question.nodeId &&
            d.kind === 'requires' &&
            d.weight >= 0.8,
        ),
      )
    ) {
      c.priority += weights.prerequisiteBonus;
      if (c.reason === '巩固基础') c.reason = '前置诊断';
    }
  }
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      hash(today + a.question.id) - hash(today + b.question.id),
  );
  const queue: QueueItem[] = [];
  const perSkill = new Map<string, number>();
  const rotation = createTopicRotation(events, now);
  let seconds = 0;
  while (candidates.length && queue.length < target) {
    const idx = rotation.nextIndex(
      candidates,
      (c) => c.question,
      (c) => {
        const k = keyOf(c.question.nodeId, c.question.skillId);
        const state =
          states[k] ?? initial(c.question.nodeId, c.question.skillId);
        const count = perSkill.get(k) ?? 0;
        const limit = opts.test
          ? policy.evidence.retentionLimit
          : skillPracticeLimit(state, policy);
        return (
          count < limit &&
          (opts.test ||
            !queue.length ||
            seconds + boundedExpectedSeconds(c.question.expectedSeconds) <=
              data.settings.dailyMinutes * 60) &&
          !queue.some((x) => x.question.id === c.question.id)
        );
      },
    );
    if (idx < 0) break;
    const c = candidates.splice(idx, 1)[0];
    if (
      !opts.test &&
      seconds + boundedExpectedSeconds(c.question.expectedSeconds) >
        data.settings.dailyMinutes * 60 &&
      queue.length
    )
      continue;
    queue.push(c);
    rotation.record(c.question);
    seconds += boundedExpectedSeconds(c.question.expectedSeconds);
    const k = keyOf(c.question.nodeId, c.question.skillId);
    perSkill.set(k, (perSkill.get(k) ?? 0) + 1);
  }
  const surpriseCount =
    data.settings.surprise && !opts.practice && !opts.test
      ? Math.min(
          Math.floor(target * 0.075) +
            (hash(today + 'surprise') < (target * 0.075) % 1 ? 1 : 0),
          Math.ceil(target * 0.1),
        )
      : 0;
  const pool = mastered.sort(
    (a, b) => hash(today + a.question.id) - hash(today + b.question.id),
  );
  const used = new Set<string>();
  for (const c of pool) {
    if (used.size >= surpriseCount) break;
    const k = keyOf(c.question.nodeId, c.question.skillId);
    if (used.has(k)) continue;
    used.add(k);
    if (queue.length >= target) queue.pop();
    queue.splice(Math.min(queue.length, Math.floor(queue.length * 0.65)), 0, c);
  }
  if (!opts.test) {
    const pending = events
      .filter(
        (e) =>
          e.learningEvidence?.suspect && active.some((n) => n.id === e.nodeId),
      )
      .reverse();
    for (const e of pending) {
      const q = verificationCandidate(data, e, [], now);
      if (!q) continue;
      const existing = queue.findIndex((x) => x.question.id === q.id);
      if (existing >= 0) queue.splice(existing, 1);
      if (queue.length >= target) queue.pop();
      queue.splice(Math.min(2, queue.length), 0, {
        question: q,
        reason: '变式交叉验证',
        priority: 1,
        verificationOf: e.id,
      });
      break;
    }
    const transfer = transferCandidates(data, opts.subject, now).find(
      (t) =>
        active.some((n) => n.id === t.target.nodeId) &&
        !queue.some((x) => x.question.id === t.target.id),
    );
    if (transfer && queue.length >= 4) {
      if (queue.length >= target) queue.pop();
      queue.push({
        question: { ...transfer.target, transferFrom: transfer.source.id },
        priority: 0.5,
        reason: '跨语境迁移',
      });
    }
  }
  if (!opts.test)
    for (const item of dueRemediation(data, now).filter((x) =>
      active.some((n) => n.id === x.question.nodeId),
    )) {
      const same = queue.findIndex((x) => x.question.id === item.question.id);
      if (same >= 0) queue.splice(same, 1);
      if (queue.length >= target) queue.pop();
      queue.push(item);
    }
  return queue;
}
