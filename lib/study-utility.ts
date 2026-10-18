import type { StudyData, Mastery } from './model';
import { keyOf } from './model';
import type { StudyAction } from './study-orchestrator';
import { policyFor, policySnapshot } from './policy-config';
import {
  fatigueState,
  completionEstimate,
  examImpact,
  assessmentInformation,createSignalContext,verifiedHypothesis,
} from './learning-signals';
import { forgettingRisk } from './engine';

const clamp = (x: number) =>
  Math.max(0, Math.min(1, Number.isFinite(x) ? x : 0));
export type CandidateTrace = {
  id: string;
  kind: string;
  eligible: boolean;
  constraint: 'active-timed-assessment' | 'none';
  factors: Record<string, number>;
  utility: number;
  estimatedMinutes: number;
  completionProbability: number;
  reasons: string[];
  rejection?: string;
};
export type DecisionTrace = {
  version: 2;
  id: string;
  at: string;
  policyId: string;
  policy: ReturnType<typeof policySnapshot>;
  objective: string;
  mode: string;
  selectedId: string;
  candidates: CandidateTrace[];
  exclusions: { id: string; reason: string }[];
  limitations: string[];
};
export function scoreStudyActions(
  data: StudyData,
  actions: StudyAction[],
  states: Record<string, Mastery>,
  now: number,
  exclusions: { id: string; reason: string }[] = [],
) {
  const policy = policyFor(data),
    u = policy.utility,
    context=createSignalContext(data,now,policy),
    fatigue = fatigueState(data, now,policy,context),
    mode = data.settings.studyMode ?? 'guided';
  const completedToday = data.events.filter(
    (e) =>
      !e.voidedBy &&
      Date.parse(e.occurredAt) <= now &&
      now - Date.parse(e.occurredAt) < 86400000,
  );
  const explored = completedToday.filter(
    (e) =>
      !data.events.some(
        (p) =>
          p.id !== e.id &&
          p.nodeId === e.nodeId &&
          p.skillId === e.skillId &&
          Date.parse(p.occurredAt) < Date.parse(e.occurredAt) &&
          now - Date.parse(p.occurredAt) > 86400000,
      ),
  ).length;
  const explorationNeed = clamp(
    u.explorationShare -
      (completedToday.length ? explored / completedToday.length : 0),
  );
  const rows = actions.map((a) => {
    const hypothesis=(data.jobs??[]).filter(j=>j.kind==='study-advice'&&j.status==='complete'&&j.hypothesis&&Date.parse(j.at)<=now&&Date.parse(j.expires)>now).sort((a,b)=>b.at.localeCompare(a.at)).find(j=>verifiedHypothesis(data,j.hypothesis,now,policy,context).supported)?.hypothesis;
    const model =
      policy.actionModel[
        a.id.startsWith('checkpoint:') ? 'checkpoint' : a.kind
      ] ?? policy.actionModel.practice;
    const nodes = a.items?.map((i) => i.question.nodeId) ?? a.scope ?? [];
    const ss = Object.values(states).filter(
      (s) =>
        (!nodes.length || nodes.includes(s.nodeId)) &&
        (!a.subject ||
          a.subject === 'all' ||
          data.nodes.some((n) => n.id === s.nodeId && n.subject === a.subject)),
    );
    const unknown = ss.length
      ? ss.filter((s) => !s.attemptCount).length / ss.length
      : 1;
    const weakness = ss.length
      ? ss.reduce((n, s) => n + (s.attemptCount ? 1 - s.mastery : 1), 0) /
        ss.length
      : 1;
    const retain = ss.length
      ? ss.reduce((n, s) => n + forgettingRisk(s, now), 0) / ss.length
      : 0;
    const inf = assessmentInformation(data, a.subject ?? 'all', now,policy,context);
    const information =
      a.informationValue ??
      (a.kind === 'test'
        ? inf.test
        : a.kind === 'pressure'
          ? inf.pressure
          : a.kind === 'initial'
            ? unknown
            : a.kind === 'verify'
              ? 1
              : model.information);
    const impact = examImpact(data, a.subject ?? 'all', nodes[0], now,policy,context);
    const minutes = Math.max(u.minimumMinutes, a.minutes || u.minimumMinutes);
    const completion = completionEstimate(data, a.kind, minutes, now,policy,context);
    const active = (data.jobs ?? []).find(
      (j) => j.id === a.target || j.id === a.id.replace(/^resume:/, ''),
    );
    const age = active
      ? Math.max(
          0,
          (now - Date.parse(active.createdAt ?? active.startedAt)) / 86400000,
        )
      : 0;
    const timed =
      !!active &&
      ((active.kind === 'exam-run' &&
        ['active', 'break'].includes(active.status)) ||
        (active.kind === 'pressure' && active.status === 'active'));
    const factors = {
      learning: u.learning * model.learn * weakness,
      information: u.information * model.information * information,
      exam: (u.exam * impact.value * (model.learn + information)) / 2,
      retention: u.retention * model.retention * retain,
      continuity: active
        ? u.continuity * Math.exp(-age / u.resumeHalfLifeDays)
        : 0,
      administration: u.administration * model.administration,
      exploration: u.exploration * explorationNeed * unknown,
      fatigue: -u.fatigueCost * fatigue.value * model.effort,
      hypothesis:hypothesis&&((hypothesis.type==='speed'&&a.kind==='pressure')||(hypothesis.type==='concept'&&a.kind==='teach')||(hypothesis.type==='retention'&&a.kind==='verify')||(hypothesis.type==='fatigue'&&a.kind==='rest'))?u.verifiedHypothesisInfluence:0,
    };
    if (a.kind === 'rest')
      factors.administration = u.administration * fatigue.value;
    const total = Math.max(
      0,
      Object.values(factors).reduce((n, v) => n + v, 0),
    );
    const utility = (total * completion.value) / minutes;
    const row: CandidateTrace = {
      id: a.id,
      kind: a.kind,
      eligible: true,
      constraint: timed ? 'active-timed-assessment' : 'none',
      factors,
      utility,
      estimatedMinutes: minutes,
      completionProbability: completion.value,
      reasons: [
        a.reason,
        impact.value ? impact.explanation : '',
        fatigue.known ? fatigue.explanation : '',
      ].filter(Boolean),
    };
    return { action: { ...a, utility, decisionFactors: factors }, trace: row };
  });
  rows.sort(
    (a, b) =>
      Number(b.trace.constraint === 'active-timed-assessment') -
        Number(a.trace.constraint === 'active-timed-assessment') ||
      b.trace.utility - a.trace.utility ||
      a.action.id.localeCompare(b.action.id),
  );
  const selected = rows[0];
  const fingerprint = [
    policy.id,
    mode,
    Math.floor(now / 3600000),
    ...data.events
      .filter((e) => !e.voidedBy)
      .map((e) => e.id)
      .sort(),
    ...rows.map((r) => r.action.id + ':' + r.trace.utility.toFixed(5)),
  ].join('|');
  let hash = 2166136261;
  for (const c of fingerprint)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  const trace: DecisionTrace = {
    version: 2,
    id: 'study-trace:' + (hash >>> 0).toString(16),
    at: new Date(now).toISOString(),
    policyId: policy.id,
    policy: policySnapshot(policy),
    objective: policy.objective,
    mode,
    selectedId: selected?.action.id ?? '',
    candidates: rows.map((r, i) => ({
      ...r.trace,
      ...(i
        ? {
            rejection:
              selected?.trace.constraint === 'active-timed-assessment'
                ? '计时考试正在进行，先保留考试流程'
                : '本轮预计收益/分钟较低；仍可自主选择',
          }
        : {}),
    })),
    exclusions,
    limitations: [
      '效用与完成概率是待校准的启发式估计，不是已验证的学习增益概率。',
      '离线回放只能比较历史关联，不能据此宣称另一种安排一定提高考试成绩。',
    ],
  };
  return { actions: rows.map((r) => r.action), trace, fatigue };
}
