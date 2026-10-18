import { computeMastery } from './engine';
import { studyAgenda } from './study-orchestrator';
import { dailyStudyPlan } from './study-assistant';
import { POLICY_REGISTRY, policyFor } from './policy-config';
import { effectiveAnswerTime } from './learning-evidence';
import { examGpa, validResult } from './exam-outcomes';
import {
  type AnswerEvent,
  type LocalRecord,
  type Mastery,
  type StudyData,
} from './model';
import { projectQuality } from './question-quality';
import type { DecisionTrace } from './study-utility';

const DAY = 86400000;
const at = (v: unknown) => (typeof v === 'string' ? Date.parse(v) : NaN);
const mean = (v: number[]) =>
  v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
const clone = <T>(v: T): T => structuredClone(v);
// Backups share the application's heterogeneous LocalRecord payload schema.
type PersistedPayload = LocalRecord['payload'];
type BackupRecord = LocalRecord & { namespace?: string };
type ReplayDailyPlan = {
  recommendations?: { mode?: string; title?: string }[];
};
type ReplayOutcome = {
  id: string;
  at: string;
  traceId: string;
  actionId: string;
  policyId: string;
  choice: string;
  sessionId?: string;
  baselineEventIds?: string[];
};
/** Decode a local export without opening the learner database or restoring records. */
export function evaluationInput(value: unknown): StudyData {
  const raw = value as StudyData & {
    records?: BackupRecord[];
    schemaVersion?: number;
  };
  if (!raw || typeof raw !== 'object')
    throw new Error('Expected StudyData or a schemaVersion 1 backup');
  let data: StudyData;
  if (Array.isArray(raw.records)) {
    if (raw.schemaVersion !== 1)
      throw new Error('Unsupported backup schemaVersion');
    const namespaces = new Set(
      raw.records.map((r) => r.namespace).filter((v) => typeof v === 'string'),
    );
    if (namespaces.size > 1)
      throw new Error(
        'Replay one account at a time; backup contains multiple namespaces',
      );
    const latest = new Map<string, BackupRecord>(),
      allowed = new Set([
        'node',
        'question',
        'event',
        'exam',
        'note',
        'material',
        'test',
        'pack',
        'setting',
        'job',
      ]);
    for (const r of raw.records) {
      if (
        !r ||
        typeof r.id !== 'string' ||
        !allowed.has(r.kind) ||
        !Number.isFinite(at(r.updated_at)) ||
        (!r.deleted && (!r.payload || typeof r.payload !== 'object'))
      )
        throw new Error('Invalid backup record');
      const key = r.kind + ':' + r.id,
        old = latest.get(key);
      if (!old || at(r.updated_at) > at(old.updated_at)) latest.set(key, r);
    }
    const get = (kind: string) =>
      [...latest.values()]
        .filter((r) => r.kind === kind && !r.deleted)
        .map((r) => clone(r.payload));
    const jobs = get('job'),
      jobMap = new Map(jobs.map((j) => [j.id, j]));
    const hydrated = jobs.map((j) =>
      j.kind === 'course' && j.storageVersion === 1
        ? {
            ...j,
            sections: (j.sections ?? []).map((s: PersistedPayload) => {
              const stored = jobMap.get('course-section:' + s.id);
              if (!stored || stored.courseId !== j.id)
                return { ...s, history: [] };
              const section = stored.section;
              return {
                ...section,
                history: (section.history ?? [])
                  .map((h: PersistedPayload) => ({
                    ...h,
                    content: jobMap.get(h.contentId)?.content,
                  }))
                  .filter((h: { content?: unknown }) => h.content),
              };
            }),
            chat: (j.chatIds ?? [])
              .map((id: string) => jobMap.get(id))
              .filter((x: PersistedPayload) => x?.courseId === j.id)
              .map((x: PersistedPayload) => x.message),
          }
        : j,
    );
    data = projectQuality({
      nodes: get('node'),
      questions: get('question'),
      events: get('event'),
      exams: get('exam'),
      notes: get('note'),
      materials: get('material'),
      tests: get('test'),
      packs: get('pack'),
      jobs: hydrated,
      settings: {
        dailyMinutes: 20,
        name: 'Offline replay',
        surprise: false,
        ...get('setting').reduce((a, b) => ({ ...a, ...b }), {}),
      },
    });
  } else data = clone(raw);
  for (const field of [
    'nodes',
    'questions',
    'events',
    'exams',
    'tests',
    'notes',
    'materials',
    'packs',
  ] as const)
    if (!Array.isArray(data[field]))
      throw new Error('Missing StudyData array: ' + field);
  if (
    !data.settings ||
    typeof data.settings !== 'object' ||
    (data.jobs !== undefined && !Array.isArray(data.jobs))
  )
    throw new Error('Invalid StudyData settings or jobs');
  return data;
}
type ReplayAction = {
  id: string;
  kind?: string;
  subject?: string;
  scope?: string[];
  items?: { question: { nodeId: string } }[];
  target?: string;
  examId?: string;
  paperId?: string;
  courseId?: string;
  sourceSessionId?: string;
};
export type ReplayAgenda = { primary?: ReplayAction; actions?: ReplayAction[] };
export type EvaluationOptions = {
  legacyAgenda: (data: StudyData, now: number) => ReplayAgenda;
  legacyComputeMastery: (
    nodes: StudyData['nodes'],
    events: AnswerEvent[],
  ) => Record<string, Mastery>;
  legacyDailyPlan?: (data: StudyData, now: number) => unknown;
  now?: number;
  policyIds?: string[];
  maxCheckpoints?: number;
  everyEvents?: number;
};
const independent = (e: AnswerEvent) =>
  !e.voidedBy &&
  !e.usedHint &&
  !e.hintLevel &&
  !e.learningEvidence?.suspect &&
  !e.learningEvidence?.gameRecovery &&
  !e.learningEvidence?.timedOut &&
  e.predictedConfidence !== 'guess' &&
  effectiveAnswerTime(e) >= 1500 &&
  (e.learningEvidence?.assessment === 'objective' ||
    e.learningEvidence?.assessment === 'rubric' ||
    e.source === 'rubric' ||
    (e.source === 'test' && !!e.answer));
function uniqueEvents(data: StudyData, now: number) {
  const ids = new Set<string>(),
    fingerprints = new Set<string>(),
    qs = new Map(data.questions.map((q) => [q.id, q]));
  return data.events
    .filter((e) => {
      const t = at(e.occurredAt),
        q = qs.get(e.questionId),
        fp = [
          e.sessionId,
          e.questionId,
          e.occurredAt,
          e.attemptNumber ?? 1,
        ].join('|');
      if (
        !q ||
        q.reviewStatus === 'paused' ||
        q.nodeId !== e.nodeId ||
        q.skillId !== e.skillId ||
        q.subject !== e.subject ||
        e.voidedBy ||
        ids.has(e.id) ||
        fingerprints.has(fp) ||
        !Number.isFinite(t) ||
        t > now ||
        !Number.isFinite(e.score) ||
        e.score < 0 ||
        e.score > 1
      )
        return false;
      ids.add(e.id);
      fingerprints.add(fp);
      return true;
    })
    .sort(
      (a, b) => at(a.occurredAt) - at(b.occurredAt) || a.id.localeCompare(b.id),
    );
}
const mutationKeys = new Set([
  'createdAt',
  'startedAt',
  'completedAt',
  'updatedAt',
  'reviewedAt',
  'at',
  'occurredAt',
  'practiceCompletedAt',
  'teachingCompletedAt',
  'recordedAt',
]);
function hasLaterMutation(value: unknown, cutoff: number): boolean {
  if (!value || typeof value !== 'object') return false;
  return Object.entries(value).some(
    ([key, v]) =>
      (mutationKeys.has(key) && Number.isFinite(at(v)) && at(v) > cutoff) ||
      hasLaterMutation(v, cutoff),
  );
}
/** Replay mutable records conservatively. Missing historical versions are never invented. */
export function historicalPrefix(data: StudyData, cutoff: number): StudyData {
  const copy = clone(data);
  copy.events = clone(uniqueEvents(data, cutoff));
  copy.exams = copy.exams.map((e) => {
    if (
      e.result &&
      (!validResult(e.result) || at(e.result.recordedAt) > cutoff)
    )
      delete e.result;
    if (
      e.scoreReminderAfter &&
      (!Number.isFinite(at(e.scoreReminderAfter)) ||
        at(e.scoreReminderAfter) > cutoff)
    )
      delete e.scoreReminderAfter;
    return e;
  });
  copy.tests = copy.tests.filter(
    (t) => Number.isFinite(at(t.at)) && at(t.at) <= cutoff,
  );
  copy.jobs = (copy.jobs ?? [])
    .filter((j) => {
      const created = at(
        j.createdAt ??
          j.startedAt ??
          j.at ??
          j.teachingCompletedAt ??
          j.completedAt ??
          j.updatedAt,
      );
      return (
        Number.isFinite(created) &&
        created <= cutoff &&
        !hasLaterMutation(j, cutoff)
      );
    })
    .map((j) => {
      if (Array.isArray(j.sections))
        j.sections = j.sections.map((s: PersistedPayload) => {
          const result = { ...s };
          if (at(result.completedAt) > cutoff) {
            delete result.completedAt;
            delete result.passed;
          }
          return result;
        });
      return j;
    });
  // Current text and settings are held constant across policies; old versions may be absent in backups.
  return copy;
}
function canonical(a: NonNullable<ReplayAgenda['primary']> | undefined) {
  if (!a) return 'none';
  return [
    a.kind ?? a.id,
    a.subject ?? '',
    a.target ?? a.examId ?? a.paperId ?? a.courseId ?? a.sourceSessionId ?? '',
    [...new Set(a.scope ?? a.items?.map((i) => i.question.nodeId) ?? [])]
      .sort()
      .join(','),
  ].join('|');
}
function compareRanks(a: ReplayAgenda, b: ReplayAgenda) {
  const aa = (a.actions ?? (a.primary ? [a.primary] : [])).map(canonical),
    bb = (b.actions ?? (b.primary ? [b.primary] : [])).map(canonical),
    common = [...new Set(aa)].filter((x) => bb.includes(x));
  const displacement = common.length
    ? common.reduce((s, x) => s + Math.abs(aa.indexOf(x) - bb.indexOf(x)), 0) /
      (common.length * Math.max(1, Math.max(aa.length, bb.length) - 1))
    : null;
  return {
    samePrimary: canonical(a.primary) === canonical(b.primary),
    commonCandidates: common.length,
    normalizedRankDisplacement: displacement,
  };
}
function latentDifference(
  a: Record<string, Mastery>,
  b: Record<string, Mastery>,
) {
  const keys = Object.keys(a).filter((k) => b[k]);
  return {
    skills: keys.length,
    meanAbsoluteLatentScoreDifference: mean(
      keys.map((k) => Math.abs(a[k].mastery - b[k].mastery)),
    ),
    meanAbsoluteStabilityDifference: mean(
      keys.map((k) => Math.abs(a[k].stability - b[k].stability)),
    ),
    scores: keys.map((key) => ({
      key,
      legacy: a[key].mastery,
      current: b[key].mastery,
      legacyStability: a[key].stability,
      currentStability: b[key].stability,
    })),
  };
}
function delayedObservations(
  _data: StudyData,
  events: AnswerEvent[],
  cutoff: number,
  end: number,
  action?: ReplayAgenda['primary'],
) {
  const scope = new Set(
      action?.scope ?? action?.items?.map((i) => i.question.nodeId) ?? [],
    ),
    previous = events.filter(
      (e) => at(e.occurredAt) <= cutoff && independent(e),
    );
  const observed = events.filter(
    (e) =>
      at(e.occurredAt) >= cutoff + DAY &&
      at(e.occurredAt) <= end &&
      independent(e) &&
      (!action?.subject ||
        action.subject === 'all' ||
        e.subject === action.subject) &&
      (!scope.size || scope.has(e.nodeId)) &&
      previous.some(
        (p) =>
          p.nodeId === e.nodeId &&
          p.skillId === e.skillId &&
          p.questionId !== e.questionId &&
          p.sessionId !== e.sessionId,
      ),
  );
  return {
    count: observed.length,
    meanObservedScore: mean(observed.map((e) => e.score)),
    eventIds: observed.map((e) => e.id),
  };
}
/** Offline comparison is descriptive, not a causal estimate of an unchosen policy's learning benefit. */
export function evaluatePolicyHistory(
  data: StudyData,
  options: EvaluationOptions,
) {
  const now = options.now ?? Date.now();
  if (!Number.isFinite(now)) throw new Error('Replay time must be finite');
  for (const [key, value] of [
    ['everyEvents', options.everyEvents],
    ['maxCheckpoints', options.maxCheckpoints],
  ] as const)
    if (value !== undefined && (!Number.isFinite(value) || value < 1))
      throw new Error(key + ' must be a positive finite number');
  const events = uniqueEvents(data, now),
    stride = Math.max(1, Math.floor(options.everyEvents ?? 5)),
    limit = Math.max(
      1,
      Math.min(200, Math.floor(options.maxCheckpoints ?? 40)),
    ),
    policyIds = [...new Set(options.policyIds ?? Object.keys(POLICY_REGISTRY))];
  if (
    !policyIds.length ||
    policyIds.some((id) => !Object.hasOwn(POLICY_REGISTRY, id))
  )
    throw new Error('Select at least one known study policy');
  const candidates = [
      ...new Set([
        ...(events.length ? [at(events[0].occurredAt) - 1] : [now]),
        ...events
          .filter((_, i) => (i + 1) % stride === 0 || i === events.length - 1)
          .map((e) => at(e.occurredAt)),
      ]),
    ],
    step = Math.max(1, Math.ceil(candidates.length / limit)),
    times = candidates.filter((_, i) => i % step === 0).slice(0, limit);
  if (candidates.length && times.at(-1) !== candidates.at(-1)) {
    if (times.length === limit) times.pop();
    times.push(candidates.at(-1)!);
  }
  const variants = policyIds.map((policyId) => {
    const checkpoints = times.map((cutoff) => {
      const prefix = historicalPrefix(data, cutoff);
      prefix.settings.studyPolicy = { id: policyId };
      const old = options.legacyAgenda(clone(prefix), cutoff),
        next = studyAgenda(clone(prefix), cutoff),
        oldMastery = options.legacyComputeMastery(
          clone(prefix.nodes),
          clone(prefix.events),
        ),
        nextMastery = computeMastery(
          prefix.nodes,
          prefix.events,
          policyFor(prefix),
        );
      const oldDaily = options.legacyDailyPlan?.(clone(prefix), cutoff) as
          | ReplayDailyPlan
          | undefined,
        newDaily = dailyStudyPlan(prefix, cutoff);
      return {
        at: new Date(cutoff).toISOString(),
        prefixEvents: prefix.events.length,
        legacyPrimary: canonical(old.primary),
        primary: canonical(next.primary),
        legacyOrder: (old.actions ?? []).map(canonical),
        order: next.actions.map(canonical),
        ranking: compareRanks(old, next),
        latent: latentDifference(oldMastery, nextMastery),
        dailyInitial: {
          legacy:
            oldDaily?.recommendations?.find((r) => r.mode === 'initial')
              ?.title ?? null,
          current:
            newDaily?.recommendations?.find((r) => r.mode === 'initial')
              ?.title ?? null,
        },
        observedLaterRetention: delayedObservations(
          data,
          events,
          cutoff,
          Math.min(now, cutoff + 30 * DAY),
          next.primary,
        ),
        legacyObservedLaterRetention: delayedObservations(
          data,
          events,
          cutoff,
          Math.min(now, cutoff + 30 * DAY),
          old.primary,
        ),
        estimatedLearningBenefit: null,
        counterfactualExamBenefit: null,
      };
    });
    const churn = (field: 'primary' | 'legacyPrimary') =>
      checkpoints.length > 1
        ? checkpoints
            .slice(1)
            .filter((c, i) => c[field] !== checkpoints[i][field]).length /
          (checkpoints.length - 1)
        : null;
    return {
      policyId,
      checkpoints,
      summary: {
        checkpoints: checkpoints.length,
        primaryAgreement: mean(
          checkpoints.map((c) => Number(c.ranking.samePrimary)),
        ),
        meanRankDisplacement: mean(
          checkpoints.flatMap((c) =>
            c.ranking.normalizedRankDisplacement === null
              ? []
              : [c.ranking.normalizedRankDisplacement],
          ),
        ),
        recommendationChurn: churn('primary'),
        legacyRecommendationChurn: churn('legacyPrimary'),
        meanLatentDifference: mean(
          checkpoints.flatMap((c) =>
            c.latent.meanAbsoluteLatentScoreDifference === null
              ? []
              : [c.latent.meanAbsoluteLatentScoreDifference],
          ),
        ),
      },
    };
  });
  const observed = examGpa(data, now);
  return {
    version: 1,
    asOf: new Date(now).toISOString(),
    objective: 'expected-learning-gain-per-minute',
    eventCount: events.length,
    variants,
    observedExamOutcomes: {
      gpa: observed.value,
      scale: observed.config.scale,
      rows: observed.rows.map((r) => ({
        examId: r.exam.id,
        subject: r.exam.subject,
        date: r.exam.date,
        score: r.exam.result!.score,
        maxScore: r.exam.result!.maxScore,
        gpaPoint: r.point,
      })),
    },
    calibration: calibrationReport(data, now),
    limitations: [
      'This replay compares algorithms on identical observed prefixes. It cannot estimate causal improvement in learning or examination results.',
      'Current content and settings are held constant because historical content/setting versions may be absent. Mutable jobs updated after a cutoff are omitted conservatively.',
      'Later retention contains only observed independent cross-day responses; an unchosen recommendation is not treated as a completed treatment.',
      'Latent mastery and expected utility are heuristic scales, not calibrated probabilities. Calibration never automatically changes a policy.',
    ],
  };
}

/** Only outcomes linked to a persisted trace and session are used for completion calibration. */
export function calibrationReport(
  data: StudyData,
  now = Date.now(),
  observationDays = 7,
) {
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(observationDays) ||
    observationDays <= 0
  )
    throw new Error(
      'Calibration time and observation window must be finite and positive',
    );
  const traces = new Map<string, DecisionTrace>(),
    outcomes = new Map<string, ReplayOutcome>(),
    events = uniqueEvents(data, now);
  for (const j of data.jobs ?? []) {
    if (
      j.kind === 'study-recommendation' &&
      typeof j.id === 'string' &&
      typeof j.policyId === 'string' &&
      at(j.at) <= now &&
      Array.isArray(j.candidates) &&
      !traces.has(j.id)
    )
      traces.set(j.id, j);
    if (
      j.kind === 'study-recommendation-outcome' &&
      typeof j.id === 'string' &&
      at(j.at) <= now &&
      !outcomes.has(j.id)
    )
      outcomes.set(j.id, j);
  }
  const grouped = new Map<
    string,
    {
      traces: Set<string>;
      selected: Set<string>;
      deferred: Set<string>;
      started: Set<string>;
      completed: Set<string>;
      brier: number[];
      censored: number;
      retentionEvents: Map<string, AnswerEvent>;
    }
  >();
  for (const t of traces.values())
    if (!grouped.has(t.policyId))
      grouped.set(t.policyId, {
        traces: new Set(),
        selected: new Set(),
        deferred: new Set(),
        started: new Set(),
        completed: new Set(),
        brier: [],
        censored: 0,
        retentionEvents: new Map(),
      });
  for (const t of traces.values()) grouped.get(t.policyId)!.traces.add(t.id);
  const seenSessions = new Set<string>();
  for (const o of [...outcomes.values()].sort(
    (a, b) => at(a.at) - at(b.at) || a.id.localeCompare(b.id),
  )) {
    const trace = traces.get(o.traceId),
      candidate = trace?.candidates.find((c) => c.id === o.actionId);
    if (
      !trace ||
      !candidate ||
      at(o.at) < at(trace.at) ||
      o.policyId !== trace.policyId
    )
      continue;
    const g = grouped.get(trace.policyId)!,
      token = o.traceId + ':' + o.actionId;
    if (o.choice === 'selected') g.selected.add(token);
    if (o.choice === 'deferred') g.deferred.add(token);
    if (
      o.choice !== 'started' ||
      typeof o.sessionId !== 'string' ||
      seenSessions.has(o.sessionId)
    )
      continue;
    seenSessions.add(o.sessionId);
    g.started.add(o.sessionId);
    const end = at(o.at) + observationDays * DAY,
      done =
        (data.jobs ?? []).some(
          (j) =>
            (j.sessionId === o.sessionId || j.id === o.sessionId) &&
            (j.kind === 'study-completion' ||
              j.kind === 'game-chest' ||
              ['complete', 'completed'].includes(j.status)) &&
            Number.isFinite(at(j.completedAt ?? j.at)) &&
            at(j.completedAt ?? j.at) >= at(o.at) &&
            at(j.completedAt ?? j.at) <= Math.min(now, end),
        ) ||
        data.tests.some(
          (t) =>
            t.sessionId === o.sessionId &&
            at(t.at) >= at(o.at) &&
            at(t.at) <= Math.min(now, end),
        );
    if (done) g.completed.add(o.sessionId);
    const probability =
      typeof candidate.completionProbability === 'number'
        ? candidate.completionProbability
        : NaN;
    if (done || now >= end) {
      if (Number.isFinite(probability) && probability >= 0 && probability <= 1)
        g.brier.push((probability - Number(done)) ** 2);
    } else g.censored++;
    const baselineIds = new Set(o.baselineEventIds ?? []),
      session = events.filter(
        (e) =>
          e.sessionId === o.sessionId &&
          at(e.occurredAt) >= at(o.at) &&
          at(e.occurredAt) <= now,
      ),
      first = at(o.at);
    for (const e of events)
      if (
        !baselineIds.has(e.id) &&
        independent(e) &&
        e.sessionId !== o.sessionId &&
        at(e.occurredAt) >= first + DAY &&
        session.some(
          (p) =>
            independent(p) &&
            p.nodeId === e.nodeId &&
            p.skillId === e.skillId &&
            p.questionId !== e.questionId &&
            at(p.occurredAt) <= at(e.occurredAt) - DAY,
        )
      )
        g.retentionEvents.set(e.id, e);
  }
  return {
    observationDays,
    policies: [...grouped].map(([policyId, g]) => ({
      policyId,
      recommendations: g.traces.size,
      selected: g.selected.size,
      deferred: g.deferred.size,
      started: g.started.size,
      completedWithinWindow: g.completed.size,
      completionEvaluated: g.brier.length,
      rightCensored: g.censored,
      completionBrierScore: mean(g.brier),
      observedDelayedRetention: {
        samples: g.retentionEvents.size,
        meanScore: mean([...g.retentionEvents.values()].map((e) => e.score)),
      },
    })),
    autoUpdate: false,
    limitations: [
      'Completion is evaluated only for linked started sessions within a fixed observation window. Unfinished recent sessions are right-censored.',
      'Observed delayed scores and real examination outcomes are descriptive, not counterfactual policy benefits. Sparse results do not authorize automatic weight updates.',
    ],
  };
}
