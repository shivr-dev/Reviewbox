import type { AnswerEvent, Mastery, Node } from './model';
import { DEFAULT_POLICY, type PolicyConfig } from './policy-config';

const DAY = 86400000;
const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));
/** Active interaction time is distinct from elapsed page time. Missing telemetry is not invented. */
export function effectiveAnswerTime(e: AnswerEvent): number {
  const active = Number.isFinite(e.activeThinkMs)
    ? clamp(e.activeThinkMs, 0, DAY)
    : 0;
  if (!Number.isFinite(e.wallTimeMs) || !Number.isFinite(e.idleMs))
    return active;
  return Math.min(active, Math.max(0, e.wallTimeMs! - e.idleMs!));
}
export function hintEvidenceWeight(e: AnswerEvent, policy = DEFAULT_POLICY) {
  return e.hintLevel
    ? policy.evidence.hintWeights[e.hintLevel]
    : e.usedHint
      ? policy.evidence.hintWeights.legacy
      : 1;
}
/** Time enters evidence once, weakly. Slow answers are not treated as lower understanding. */
export function timingEvidenceWeight(e: AnswerEvent, policy = DEFAULT_POLICY) {
  const minimum = Math.max(1500, Math.min(5000, e.expectedSeconds * 200));
  return effectiveAnswerTime(e) < minimum ? policy.evidence.timingFloor : 1;
}
export function answerEvidenceWeight(e: AnswerEvent, policy = DEFAULT_POLICY) {
  const objective =
    e.learningEvidence?.assessment === 'objective' ||
    (e.source === 'test' && !!e.answer);
  const source =
    e.source === 'rubric'
      ? policy.evidence.sourceWeights.rubric
      : objective
        ? policy.evidence.sourceWeights.objective
        : policy.evidence.sourceWeights.self;
  const suspect = e.learningEvidence?.suspect
    ? policy.evidence.suspectWeight
    : 1;
  const confidence =
    e.predictedConfidence === 'guess' ? policy.evidence.guessWeight : 1;
  return (
    source *
    hintEvidenceWeight(e, policy) *
    timingEvidenceWeight(e, policy) *
    suspect *
    confidence
  );
}
export function errorCauseEstimate(
  e: AnswerEvent,
  history: AnswerEvent[] = [],
): NonNullable<AnswerEvent['errorCause']> {
  const names = [
    'concept',
    'calculation',
    'reading',
    'careless',
    'unknown',
  ] as const;
  if (e.errorCause) {
    const weights = names.map((k) =>
      Math.max(0, Number.isFinite(e.errorCause![k]) ? e.errorCause![k] : 0),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    if (total > 0)
      return {
        ...Object.fromEntries(names.map((k, i) => [k, weights[i] / total])),
        confirmed:
          !!e.errorCause.confirmed &&
          new Set([...history,e].filter(x=>(e.errorCause!.evidenceIds??[]).includes(x.id)&&!x.voidedBy&&x.nodeId===e.nodeId&&x.skillId===e.skillId&&x.score<.4&&!x.usedHint&&Date.parse(x.occurredAt)<=Date.parse(e.occurredAt)).map(x=>x.questionId)).size >= 2,
        evidenceIds: e.errorCause.evidenceIds,
      } as NonNullable<AnswerEvent['errorCause']>;
  }
  const comparable = history
    .filter(
      (x) =>
        !x.voidedBy &&
        x.nodeId === e.nodeId &&
        x.skillId === e.skillId &&
        x.questionId !== e.questionId &&
        Date.parse(x.occurredAt) < Date.parse(e.occurredAt),
    )
    .slice(-8);
  const losses = comparable.filter(
    (x) => x.score < 0.4 && hintEvidenceWeight(x) >= 0.7,
  );
  const successes = comparable.filter((x) => x.score >= 0.85 && !x.usedHint);
  // Hypotheses only: one wrong result cannot identify a misconception or careless error.
  const concept = losses.length >= 2 ? 0.4 : 0.2;
  const careless = successes.length >= 3 ? 0.2 : 0.1;
  return {
    concept,
    calculation: 0.1,
    reading: 0.1,
    careless,
    unknown: 1 - concept - 0.1 - 0.1 - careless,
    confirmed: false,
    evidenceIds: [...losses.map((x) => x.id), e.id].slice(-4),
  };
}
export function acquisitionMode(s: Mastery) {
  return (
    s.attemptCount < 4 || s.mastery < 0.5 || (s.successDays?.length ?? 0) < 2
  );
}
export function skillPracticeLimit(s: Mastery, policy = DEFAULT_POLICY) {
  return acquisitionMode(s)
    ? policy.evidence.acquisitionLimit
    : policy.evidence.retentionLimit;
}
export function dependencyLinks(n: Node) {
  const explicit = n.dependencies ?? [];
  return [
    ...explicit.map((d) => ({
      ...d,
      weight: clamp(
        d.weight ??
          (d.kind === 'requires' ? 0.8 : d.kind === 'helpful' ? 0.4 : 0.1),
      ),
    })),
    ...n.prerequisites
      .filter((id) => !explicit.some((d) => d.nodeId === id))
      .map((nodeId) => ({ nodeId, kind: 'requires' as const, weight: 0.8 })),
  ];
}
export function masteryStatus(
  s?: Mastery,
): '未知' | '学习中' | '不稳定' | '已保持' | '已验证' {
  if (!s?.attemptCount) return '未知';
  if (
    s.lastFailure &&
    (!s.lastSuccess || Date.parse(s.lastFailure) >= Date.parse(s.lastSuccess))
  )
    return '不稳定';
  if (s.stage >= 3 && (s.successDays?.length ?? 0) >= 4) return '已验证';
  if (s.stage >= 1 && (s.successDays?.length ?? 0) >= 2) return '已保持';
  return s.errorCount > 0 && s.mastery < 0.5 ? '不稳定' : '学习中';
}
export function aggregateMasteryStatus(states: (Mastery | undefined)[]) {
  if (!states.some((s) => s?.attemptCount)) return '未知';
  const statuses = states.map(masteryStatus);
  if (statuses.includes('不稳定')) return '不稳定';
  if (statuses.every((s) => s === '已验证')) return '已验证';
  if (statuses.every((s) => s === '已保持' || s === '已验证')) return '已保持';
  return '学习中';
}
/** 1/3/7 are cold-start anchors; observed cross-day history and memory family take over. */
export function adaptiveRecallInterval(
  s: Mastery,
  e: AnswerEvent,
  policy: PolicyConfig = DEFAULT_POLICY,
) {
  const days = s.evidenceDays?.length ?? 0;
  if (days < 3)
    return (
      policy.evidence.coldIntervals[
        Math.min(s.stage, policy.evidence.coldIntervals.length - 1)
      ] ?? 1
    );
  const family = e.learningEvidence?.memoryFamily;
  const familyFactor = policy.evidence.familyFactors[family ?? 'reasoning'];
  const subjectFactor = policy.evidence.subjectFactors[e.subject] ?? 1;
  const personal = clamp(e.learningEvidence?.intervalFactor ?? 1, 0.55, 1.5);
  const evidence = Math.min(
    1.5,
    1 + Math.log1p((s.successDays?.length ?? 0) - 1) / 5,
  );
  return clamp(
    s.stability * familyFactor * subjectFactor * personal * evidence,
    0.5,
    policy.evidence.maxStability,
  );
}
