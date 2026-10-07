import {
  keyOf,
  type AnswerEvent,
  type Node,
  type Question,
  type StudyData,
  type Mastery,
} from './model';
import { isPinyin } from './question-tools';

const DAY = 86400000;
const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const mean = (xs: number[]) =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
export const ATTRIBUTE_NAMES: Record<string, string> = {
  symbolic: '符号与逐步推导',
  calculation: '数值运算',
  evidence: '信息提取与证据判断',
  vocabulary: '词义辨析',
  syntax: '语法与结构',
  recall: '准确回忆',
  causal: '因果与机制推理',
  application: '情境建模与应用',
};
export const FAMILY_NAMES = {
  formula: '公式与运算',
  vocabulary: '字词与术语',
  fact: '事实与记忆',
  reasoning: '理解与推理',
};
export type MemoryFamily = keyof typeof FAMILY_NAMES;
export type PolicyId = 'cautious' | 'balanced' | 'expansive';
export const POLICIES: { id: PolicyId; title: string; factor: number }[] = [
  { id: 'cautious', title: '较早验证', factor: 0.8 },
  { id: 'balanced', title: '均衡间隔', factor: 1 },
  { id: 'expansive', title: '延长间隔', factor: 1.2 },
];
export function cleanEvents(events: AnswerEvent[], now = Date.now()) {
  const seen = new Set<string>();
  return [...events]
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    )
    .filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      const at = Date.parse(e.occurredAt);
      return (
        !e.voidedBy &&
        Number.isFinite(at) &&
        at <= now &&
        Number.isFinite(e.score) &&
        e.score >= 0 &&
        e.score <= 1
      );
    });
}
const taskText = (q: Question, n?: Node) =>
  [
    n?.title,
    n?.skills.find((s) => s.id === q.skillId)?.title,
    ...(q.tags ?? []),
  ].join(' ');
export function attributesFor(q: Question, n?: Node): string[] {
  const explicit = q.cognitiveAttributes?.filter((id) => id in ATTRIBUTE_NAMES);
  if (explicit?.length) return [...new Set(explicit)];
  const t = taskText(q, n),
    result: string[] = [];
  if (/推导|证明|代数|方程|符号|symbol|equation/i.test(t))
    result.push('symbolic');
  if (/计算|运算|求|顶点|最值|calculation/i.test(t)) result.push('calculation');
  if (/阅读|材料|证据|分析|identification|evidence|analysis|reading/i.test(t))
    result.push('evidence');
  if (isPinyin(q) || /字词|词义|术语|keyterm|vocabulary|definition/i.test(t))
    result.push('vocabulary');
  if (/语法|标点|时态|grammar|agreement|punctuation|sentence|modifier/i.test(t))
    result.push('syntax');
  if (
    /记忆|背诵|日期|化学式|recall/i.test(t) ||
    ['recall', 'pinyin'].includes(q.type)
  )
    result.push('recall');
  if (/原因|机制|现象|因果|影响|cause|effect|phenomenon/i.test(t))
    result.push('causal');
  if (/应用|建模|实验|application|experiment/i.test(t))
    result.push('application');
  // No semantic evidence means no Q-matrix row; never infer a cause just from a subject label.
  return [...new Set(result)].slice(0, 4);
}
export function memoryFamily(q: Question, n?: Node): MemoryFamily {
  if (q.memoryFamily) return q.memoryFamily;
  const t = taskText(q, n);
  if (isPinyin(q) || /字词|单词|术语|vocabulary|keyterm|definition/i.test(t))
    return 'vocabulary';
  if (/公式|计算|运算|方程|化学式|化合价|formula|equation/i.test(t))
    return 'formula';
  return ['recall', 'pinyin'].includes(q.type) ||
    /背诵|史实|日期|作者|朝代/.test(t)
    ? 'fact'
    : 'reasoning';
}
export function objective(q: Question) {
  return !isPinyin(q) && ['choice', 'blank', 'matching'].includes(q.type);
}
export function reusable(q: Question, now = Date.now()) {
  return (
    q.reviewStatus !== 'paused' &&
    !q.tags?.some((t) =>
      ['exam-only', 'course-check', 'course-content'].includes(t),
    ) &&
    (!q.expiresAt || Date.parse(q.expiresAt) > now)
  );
}
export function evidenceReliability(e: AnswerEvent) {
  const objective =
    e.learningEvidence?.assessment === 'objective' ||
    (e.source === 'test' && !!e.answer);
  let weight = objective || e.source === 'rubric' ? 1 : 0.45;
  if (e.usedHint) weight *= 0.4;
  if (e.learningEvidence?.suspect) weight *= 0.3;
  if (
    !Number.isFinite(e.activeThinkMs) ||
    e.activeThinkMs < Math.max(1500, Math.min(5000, e.expectedSeconds * 200))
  )
    weight *= 0.25;
  if (e.predictedConfidence === 'guess') weight *= 0.5;
  return weight;
}

export type Diagnosis = {
  subject: string;
  attribute: string;
  title: string;
  deficit: number;
  errorShare: number;
  observations: number;
  distinctTasks: number;
  days: number;
  identifiable: boolean;
  evidenceIds: string[];
};
/** DINA-inspired finite latent profiles with fixed slip/guess priors. Not population-calibrated DINA. */
export function cognitiveDiagnosis(
  data: StudyData,
  subject?: string,
  now = Date.now(),
): Diagnosis[] {
  const qs = new Map(data.questions.map((q) => [q.id, q])),
    ns = new Map(data.nodes.map((n) => [n.id, n]));
  const events = cleanEvents(data.events, now).filter(
    (e) =>
      (!subject || e.subject === subject) &&
      now - Date.parse(e.occurredAt) < 90 * DAY,
  );
  const result: Diagnosis[] = [];
  for (const subj of [...new Set(events.map((e) => e.subject))]) {
    const seenTasks = new Set<string>();
    const rows = events
      .filter((e) => e.subject === subj && !e.learningEvidence?.pressure)
      .map((e) => {
        const q = qs.get(e.questionId);
        const mapped =
          e.learningEvidence?.cognitiveAttributes ??
          (q ? attributesFor(q, ns.get(q.nodeId)) : []);
        return {
          e,
          q,
          attrs: Array.isArray(mapped)
            ? mapped.filter((id) => id in ATTRIBUTE_NAMES)
            : [],
        };
      })
      .filter((r) => r.attrs.length && r.q)
      .filter((r) => {
        const key = r.e.questionId + '|' + r.e.localDay;
        if (seenTasks.has(key)) return false;
        seenTasks.add(key);
        return true;
      })
      .slice(-120);
    const attrs = [...new Set(rows.flatMap((r) => r.attrs))].slice(0, 8);
    if (!attrs.length) continue;
    const logs = Array.from({ length: 1 << attrs.length }, (_, mask) =>
      rows.reduce((sum, r) => {
        const mastered = r.attrs.every(
          (a) => (mask & (1 << attrs.indexOf(a))) !== 0,
        );
        const guess = r.q?.options?.length ? 1 / r.q.options.length : 0.12;
        const p = mastered ? 0.9 : clamp(guess, 0.12, 0.5);
        // Fractional scores are a weighted Bernoulli approximation, disclosed in methodology.
        const decay = Math.exp(-(now - Date.parse(r.e.occurredAt)) / DAY / 45);
        return (
          sum +
          evidenceReliability(r.e) *
            decay *
            (r.e.score * Math.log(p) + (1 - r.e.score) * Math.log(1 - p))
        );
      }, 0),
    );
    const peak = Math.max(...logs),
      weights = logs.map((v) => Math.exp(v - peak)),
      total = weights.reduce((a, b) => a + b, 0);
    const deficits = attrs.map(
      (_, i) =>
        weights.reduce((s, w, mask) => s + (mask & (1 << i) ? 0 : w), 0) /
        total,
    );
    const errors = rows.filter((r) => r.e.score < 0.65);
    for (const [i, attribute] of attrs.entries()) {
      const relevant = rows.filter((r) => r.attrs.includes(attribute));
      const signatures = new Set(
        relevant.map((r) => r.attrs.slice().sort().join('|')),
      );
      const confounded = attrs.some(
        (other) =>
          other !== attribute &&
          rows.every(
            (r) => r.attrs.includes(attribute) === r.attrs.includes(other),
          ),
      );
      const tasks = new Set(
        relevant.map((r) => r.q!.variant + '|' + r.e.questionId),
      ).size;
      const days = new Set(relevant.map((r) => r.e.localDay)).size;
      // Attribute responsibility is normalized within each wrong item's required attributes.
      const mass = errors.reduce((sum, r) => {
        if (!r.attrs.includes(attribute)) return sum;
        const denominator = r.attrs.reduce(
          (s, a) => s + deficits[attrs.indexOf(a)],
          0,
        );
        return (
          sum + ((1 - r.e.score) * deficits[i]) / Math.max(0.001, denominator)
        );
      }, 0);
      const totalError = errors.reduce((s, r) => s + 1 - r.e.score, 0);
      result.push({
        subject: subj,
        attribute,
        title: ATTRIBUTE_NAMES[attribute],
        deficit: deficits[i],
        errorShare: totalError ? mass / totalError : 0,
        observations: relevant.length,
        distinctTasks: tasks,
        days,
        identifiable:
          !confounded &&
          signatures.size > 0 &&
          relevant.length >= 6 &&
          tasks >= 3 &&
          days >= 2,
        evidenceIds: relevant
          .filter((r) => r.e.score < 0.65)
          .slice(-4)
          .map((r) => r.e.id),
      });
    }
  }
  return result.sort(
    (a, b) =>
      Number(b.identifiable) - Number(a.identifiable) ||
      b.errorShare - a.errorShare,
  );
}

export function guessingSignals(
  q: Question,
  e: AnswerEvent,
  history: AnswerEvent[],
) {
  if (
    !objective(q) ||
    !e.answer ||
    e.score < 0.85 ||
    e.usedHint ||
    e.learningEvidence?.verificationOf
  )
    return [];
  const similar = history.filter(
    (x) =>
      x.nodeId === e.nodeId &&
      x.skillId === e.skillId &&
      x.score >= 0.85 &&
      x.activeThinkMs > 0,
  );
  const times = similar.map((x) => x.activeThinkMs).sort((a, b) => a - b);
  const median =
    times.length >= 4
      ? times[Math.floor(times.length / 2)]
      : q.expectedSeconds * 1000;
  const fast =
    e.activeThinkMs <
    Math.max(1500, Math.min(q.expectedSeconds * 250, median * 0.3));
  const lowConfidence =
    e.predictedConfidence === 'guess' || e.predictedConfidence === 'unsure';
  // Fast alone never labels a fluent learner as guessing.
  if (!fast || !lowConfidence) return [];
  return [
    '思考时间显著短于同类题',
    e.predictedConfidence === 'guess' ? '作答前标记为猜测' : '作答前信心较低',
    '正确结果尚需变式验证',
  ];
}
export function verificationCandidate(
  data: StudyData,
  event: AnswerEvent,
  excluded: string[] = [],
  now = Date.now(),
) {
  const source = data.questions.find((q) => q.id === event.questionId);
  if (
    !source ||
    !event.learningEvidence?.suspect ||
    event.learningEvidence.verificationOf
  )
    return undefined;
  if (data.events.some((e) => e.learningEvidence?.verificationOf === event.id))
    return undefined;
  return data.questions
    .filter(
      (q) =>
        q.id !== source.id &&
        q.prompt !== source.prompt &&
        q.variant !== source.variant &&
        q.nodeId === source.nodeId &&
        q.skillId === source.skillId &&
        q.verified &&
        objective(q) &&
        reusable(q, now) &&
        Math.abs(q.difficulty - source.difficulty) <= 1 &&
        !excluded.includes(q.id) &&
        !data.events.some(
          (e) => e.questionId === q.id && now - Date.parse(e.occurredAt) < DAY,
        ),
    )
    .sort(
      (a, b) =>
        Math.abs(a.difficulty - source.difficulty) -
        Math.abs(b.difficulty - source.difficulty),
    )[0];
}

type DelayedTrial = {
  e: AnswerEvent;
  previous: AnswerEvent;
  gap: number;
  family: MemoryFamily;
};
function delayedTrials(data: StudyData, now: number): DelayedTrial[] {
  const qs = new Map(data.questions.map((q) => [q.id, q])),
    ns = new Map(data.nodes.map((n) => [n.id, n]));
  const previous = new Map<string, AnswerEvent>(),
    trials: DelayedTrial[] = [];
  for (const e of cleanEvents(data.events, now)) {
    if (
      e.usedHint ||
      e.learningEvidence?.pressure ||
      e.learningEvidence?.suspect
    )
      continue;
    const k = keyOf(e.nodeId, e.skillId),
      old = previous.get(k),
      q = qs.get(e.questionId);
    if (
      old &&
      (q || e.learningEvidence?.memoryFamily) &&
      old.score >= 0.85 &&
      !old.learningEvidence?.suspect
    ) {
      const gap = (Date.parse(e.occurredAt) - Date.parse(old.occurredAt)) / DAY;
      if (
        gap >= 0.5 &&
        gap <= 180 &&
        Math.abs(old.difficulty - e.difficulty) <= 1
      )
        trials.push({
          e,
          previous: old,
          gap,
          family:
            e.learningEvidence?.memoryFamily ??
            memoryFamily(q!, ns.get(q!.nodeId)),
        });
    }
    // Recent unsuccessful recall terminates the previous successful anchor.
    previous.set(k, e);
  }
  return trials;
}
export function memoryFingerprint(data: StudyData, now = Date.now()) {
  const trials = delayedTrials(data, now);
  return (Object.keys(FAMILY_NAMES) as MemoryFamily[]).map((family) => {
    const rows = trials.filter((t) => t.family === family),
      days = new Set(rows.map((t) => t.e.localDay)).size;
    const bins = [1, 3, 7, 14, 30].map((upper, i, all) => {
      const selected = rows.filter(
        (t) => t.gap <= upper && (i === 0 || t.gap > all[i - 1]),
      );
      const weight = selected.reduce((s, t) => s + evidenceReliability(t.e), 0);
      const success = selected.reduce(
        (s, t) => s + t.e.score * evidenceReliability(t.e),
        0,
      );
      return {
        days: upper,
        count: selected.length,
        retention: (success + 2) / (weight + 3),
      };
    });
    // Shrink sparse data to a 7-day e-folding prior, fit the weighted exponential hazard.
    const success = rows.reduce(
      (s, t) => s + t.e.score * evidenceReliability(t.e),
      0,
    );
    const exposure = rows.reduce(
      (s, t) => s + t.gap * evidenceReliability(t.e),
      0,
    );
    const failures = rows.reduce(
      (s, t) => s + (1 - t.e.score) * evidenceReliability(t.e),
      0,
    );
    const horizon = clamp((exposure + 14) / (failures + 2), 1, 90);
    const ready =
      rows.length >= 6 && days >= 3 && bins.filter((b) => b.count).length >= 2;
    return {
      family,
      title: FAMILY_NAMES[family],
      trials: rows.length,
      days,
      ready,
      horizon,
      bins,
      retention: mean(rows.map((t) => t.e.score)),
      success,
      factor: ready ? clamp(Math.sqrt(horizon / 7), 0.65, 1.35) : 1,
      curve: [0, 1, 3, 7, 14, 30].map((days) => ({
        days,
        retention: Math.exp(-days / horizon),
      })),
      shape: !ready
        ? '积累间隔证据'
        : horizon < 5
          ? '较快下降'
          : horizon < 14
            ? '逐步下降'
            : '保持较久',
    };
  });
}
export function policyAssignment(nodeId: string, skillId: string): PolicyId {
  let hash = 2166136261;
  for (const c of nodeId + '::' + skillId)
    hash = Math.imul(hash ^ c.charCodeAt(0), 16777619);
  return POLICIES[(hash >>> 0) % POLICIES.length].id;
}
export function policyEvolution(data: StudyData, now = Date.now()) {
  const trials = delayedTrials(data, now).filter(
    (t) => t.previous.learningEvidence?.policy,
  );
  const arms = POLICIES.map((p) => {
    const rows = trials.filter(
      (t) => t.previous.learningEvidence?.policy === p.id,
    );
    const count = rows.length,
      skills = new Set(rows.map((t) => keyOf(t.e.nodeId, t.e.skillId))).size;
    // Success per delayed trial, rather than repetition count, evaluates each policy.
    const score = count ? mean(rows.map((t) => t.e.score)) : 0;
    const uncertainty = count ? Math.sqrt(Math.log(60) / (2 * count)) : 1;
    return {
      ...p,
      count,
      skills,
      score,
      lower: Math.max(0, score - uncertainty),
      upper: Math.min(1, score + uncertainty),
      ready: count >= 20 && skills >= 4,
    };
  });
  const ranked = [...arms].sort((a, b) => b.lower - a.lower);
  const winner =
    arms.every((a) => a.ready) &&
    ranked[0].lower > Math.max(...ranked.slice(1).map((a) => a.upper)) + 0.03
      ? ranked[0].id
      : undefined;
  return {
    arms,
    winner,
    trials: trials.length,
    status: winner ? '采用证据较强的策略' : '保守比较中',
  };
}
export function learningSchedule(
  data: StudyData,
  q: Question,
  now = Date.now(),
) {
  const family = memoryFamily(
    q,
    data.nodes.find((n) => n.id === q.nodeId),
  );
  const fingerprint = memoryFingerprint(data, now).find(
    (f) => f.family === family,
  )!;
  const policies = policyEvolution(data, now),
    policy = policies.winner ?? policyAssignment(q.nodeId, q.skillId);
  const factor = POLICIES.find((p) => p.id === policy)!.factor;
  const node = data.nodes.find((n) => n.id === q.nodeId);
  return {
    family,
    policy,
    factor: clamp(factor * fingerprint.factor, 0.55, 1.5),
    cognitiveAttributes: attributesFor(q, node),
    conceptIds: conceptsFor(q, node),
    contextId: q.contextId ?? q.subject + ':' + q.variant,
    transferFrom: q.transferFrom,
  };
}

export function flowDifficulty(
  data: StudyData,
  nodeId: string,
  skillId: string,
  mastery = 0.35,
  now = Date.now(),
  orderedEvents?: AnswerEvent[],
) {
  const history = (orderedEvents ?? cleanEvents(data.events, now))
    .filter(
      (e) =>
        e.nodeId === nodeId &&
        e.skillId === skillId &&
        !e.usedHint &&
        !e.learningEvidence?.pressure &&
        !e.learningEvidence?.suspect,
    )
    .slice(-30);
  const ability = clamp(mastery + 0.15, 0.1, 0.95);
  const priorLogit = Math.log(ability / (1 - ability));
  let adjustment = 0;
  for (let step = 0; step < 6; step++) {
    let gradient = -2 * adjustment,
      curvature = 2;
    for (const e of history) {
      const weight = evidenceReliability(e),
        p =
          1 /
          (1 +
            Math.exp(-(priorLogit + adjustment + (3 - e.difficulty) * 0.75)));
      gradient += weight * (e.score - p);
      curvature += weight * p * (1 - p);
    }
    adjustment = clamp(adjustment + gradient / curvature, -2, 2);
  }
  const levels = [1, 2, 3, 4, 5].map((difficulty) => {
    const prior =
      1 / (1 + Math.exp(-(priorLogit + adjustment + (3 - difficulty) * 0.75)));
    const same = history.filter((e) => e.difficulty === difficulty),
      weight = same.reduce((s, e) => s + evidenceReliability(e), 0);
    const observed = same.reduce(
      (s, e) => s + e.score * evidenceReliability(e),
      0,
    );
    return {
      difficulty,
      probability: (prior * 5 + observed) / (5 + weight),
      samples: same.length,
    };
  });
  // Enforce monotone difficulty even if sparse samples disagree.
  for (let i = 1; i < levels.length; i++)
    levels[i].probability = Math.min(
      levels[i].probability,
      levels[i - 1].probability,
    );
  const selected = [...levels].sort(
    (a, b) => Math.abs(a.probability - 0.75) - Math.abs(b.probability - 0.75),
  )[0];
  return { ...selected, target: 0.75, samples: history.length, levels };
}

const CONCEPT_PATTERNS: [string, RegExp][] = [
  ['vector', /向量|力的合成|力的分解|vector/i],
  ['proportion', /比例|比率|密度|浓度|速率|proportion|ratio/i],
  ['conservation', /守恒|平衡|equilibrium|conservation/i],
  ['causality', /因果|原因|cause and effect|causality/i],
  ['evidence', /证据|材料分析|source analysis|textual evidence/i],
  ['structure-function', /结构与功能|structure and function/i],
];
export const CONCEPT_NAMES: Record<string, string> = {
  vector: '方向与向量',
  proportion: '比例关系',
  conservation: '守恒与平衡',
  causality: '因果推理',
  evidence: '证据判断',
  'structure-function': '结构与功能',
};
export function conceptsFor(q: Question, n?: Node) {
  if (q.conceptIds?.length) return [...new Set(q.conceptIds)];
  const text = taskText(q, n);
  return CONCEPT_PATTERNS.filter(([, pattern]) => pattern.test(text)).map(
    ([id]) => id,
  );
}
export function transferCandidates(
  data: StudyData,
  subject?: string,
  now = Date.now(),
) {
  const events = cleanEvents(data.events, now),
    ns = new Map(data.nodes.map((n) => [n.id, n]));
  const sources = data.questions.filter((q) =>
    events.some(
      (e) =>
        e.questionId === q.id &&
        e.score >= 0.85 &&
        !e.usedHint &&
        !e.learningEvidence?.suspect &&
        now - Date.parse(e.occurredAt) >= DAY,
    ),
  );
  const pairs: {
    source: Question;
    target: Question;
    concept: string;
    crossSubject: boolean;
  }[] = [];
  for (const target of data.questions) {
    if (
      (subject && target.subject !== subject) ||
      !target.verified ||
      !reusable(target, now) ||
      events.some(
        (e) =>
          e.questionId === target.id &&
          now - Date.parse(e.occurredAt) < 7 * DAY,
      )
    )
      continue;
    const concepts = conceptsFor(target, ns.get(target.nodeId));
    const source = sources.find(
      (s) =>
        s.id !== target.id &&
        s.prompt !== target.prompt &&
        s.variant !== target.variant &&
        Math.abs(s.difficulty - target.difficulty) <= 1 &&
        (s.subject !== target.subject ||
          (s.contextId &&
            target.contextId &&
            s.contextId !== target.contextId)) &&
        conceptsFor(s, ns.get(s.nodeId)).some((id) => concepts.includes(id)),
    );
    if (source)
      pairs.push({
        source,
        target,
        concept: concepts.find((id) =>
          conceptsFor(source, ns.get(source.nodeId)).includes(id),
        )!,
        crossSubject: source.subject !== target.subject,
      });
  }
  return pairs.sort((a, b) => Number(b.crossSubject) - Number(a.crossSubject));
}

export function transferTarget(data: StudyData, source: Question) {
  const sourceNode = data.nodes.find((n) => n.id === source.nodeId),
    concepts = conceptsFor(source, sourceNode);
  for (const node of data.nodes.filter((n) => n.subject !== source.subject)) {
    for (const skill of node.skills) {
      const probe = {
        ...source,
        nodeId: node.id,
        skillId: skill.id,
        subject: node.subject,
        tags: [],
        conceptIds: undefined,
      };
      const common = conceptsFor(probe, node).find((id) =>
        concepts.includes(id),
      );
      if (common) return { node, skill, concept: common };
    }
  }
  return undefined;
}
export function transferProgress(
  data: StudyData,
  subject?: string,
  now = Date.now(),
) {
  const ns = new Map(data.nodes.map((n) => [n.id, n])),
    qs = new Map(data.questions.map((q) => [q.id, q]));
  const grouped = new Map<string, AnswerEvent[]>();
  for (const e of cleanEvents(data.events, now)) {
    if (
      e.usedHint ||
      e.learningEvidence?.suspect ||
      e.learningEvidence?.pressure
    )
      continue;
    const q = qs.get(e.questionId);
    if (
      !e.learningEvidence?.transferFrom &&
      !q?.transferFrom &&
      e.reason !== '跨语境迁移'
    )
      continue;
    const concepts =
      e.learningEvidence?.conceptIds ??
      (q ? conceptsFor(q, ns.get(q.nodeId)) : []);
    for (const id of concepts) grouped.set(id, [...(grouped.get(id) ?? []), e]);
  }
  return [...grouped]
    .filter(([, es]) => !subject || es.some((e) => e.subject === subject))
    .map(([concept, es]) => {
      const successful = es.filter(
        (e) => e.score >= 0.85 && evidenceReliability(e) >= 0.8,
      );
      const contexts = new Set(
        successful.map(
          (e) =>
            e.learningEvidence?.contextId ??
            qs.get(e.questionId)?.contextId ??
            e.subject + ':' + e.variant,
        ),
      ).size;
      const days = new Set(successful.map((e) => e.localDay)).size,
        subjects = new Set(successful.map((e) => e.subject)).size;
      return {
        concept,
        title: CONCEPT_NAMES[concept] ?? concept,
        attempts: es.length,
        contexts,
        subjects,
        days,
        ready: contexts >= 2 && days >= 2 && successful.length >= 3,
        score: mean(es.map((e) => e.score)),
      };
    });
}

export function pressureQuestions(
  data: StudyData,
  states: Record<string, Mastery>,
  subject?: string,
  scope: string[] = [],
  now = Date.now(),
) {
  const events = cleanEvents(data.events, now),
    perSkill = new Map<string, number>();
  return data.questions
    .filter(
      (q) =>
        objective(q) &&
        reusable(q, now) &&
        (!subject || q.subject === subject) &&
        (!scope.length || scope.includes(q.nodeId)),
    )
    .sort((a, b) => {
      const rank = (q: Question) => {
        const baseline = events.filter(
          (e) =>
            e.nodeId === q.nodeId &&
            e.skillId === q.skillId &&
            e.questionId !== q.id &&
            Math.abs(e.difficulty - q.difficulty) <= 1 &&
            !e.usedHint &&
            !e.learningEvidence?.pressure &&
            evidenceReliability(e) >= 0.8,
        );
        return (
          (baseline.length >= 2 ? -1 : 0) +
          (states[keyOf(q.nodeId, q.skillId)]?.mastery ?? 0.35) +
          (events.some(
            (e) =>
              e.questionId === q.id && now - Date.parse(e.occurredAt) < DAY,
          )
            ? 5
            : 0)
        );
      };
      return rank(a) - rank(b);
    })
    .filter((q) => {
      const k = keyOf(q.nodeId, q.skillId),
        count = perSkill.get(k) ?? 0;
      perSkill.set(k, count + 1);
      return count < 2;
    })
    .slice(0, 10);
}
export function pressureReport(data: StudyData, pressureEvents: AnswerEvent[]) {
  const baseline = cleanEvents(data.events),
    pressure = cleanEvents(pressureEvents);
  const groups = [
    ...new Set(pressure.map((e) => keyOf(e.nodeId, e.skillId))),
  ].map((k) => {
    const tested = pressure.filter((e) => keyOf(e.nodeId, e.skillId) === k);
    const first = tested[0],
      at = Math.min(...tested.map((e) => Date.parse(e.occurredAt)));
    const normal = baseline
      .filter(
        (e) =>
          keyOf(e.nodeId, e.skillId) === k &&
          Date.parse(e.occurredAt) < at &&
          at - Date.parse(e.occurredAt) <= 60 * DAY &&
          !e.learningEvidence?.pressure &&
          !e.usedHint &&
          evidenceReliability(e) >= 0.8 &&
          tested.some((t) => Math.abs(t.difficulty - e.difficulty) <= 1) &&
          !tested.some((t) => t.questionId === e.questionId),
      )
      .slice(-8);
    const comparable =
      normal.length >= 3 &&
      new Set(normal.map((e) => e.questionId)).size >= 2 &&
      new Set(normal.map((e) => e.localDay)).size >= 2;
    const ordinary = mean(normal.map((e) => e.score)),
      pressured = mean(tested.map((e) => e.score));
    const status = !comparable
      ? '证据不足'
      : ordinary < 0.65
        ? '基础能力优先'
        : ordinary >= 0.8 && pressured < 0.6
          ? '压力敏感信号'
          : '表现较稳定';
    const n = data.nodes.find((n) => n.id === first.nodeId);
    return {
      key: k,
      nodeId: first.nodeId,
      skillId: first.skillId,
      title: n?.title ?? first.nodeId,
      skill:
        n?.skills.find((s) => s.id === first.skillId)?.title ?? first.skillId,
      ordinary,
      pressured,
      status,
      comparable,
      normalCount: normal.length,
      pressureCount: tested.length,
      timedOut: tested.some((e) => e.learningEvidence?.timedOut),
    };
  });
  return groups;
}
