import type { AnswerEvent, Question, QueueItem, StudyData } from './model';
import { questionAvailable } from './question-quality';
export type RemedyGroup = {
  id: string;
  nodeId: string;
  skillId: string;
  title: string;
  sources: {
    question: Question;
    eventId: string;
    answer: string;
    score: number;
  }[];
  stage: number;
  lessonCompletedAt?: string;
  html?: string;
  interactiveState?: Record<string, unknown>;
  htmlSections?: string[];
  htmlSource?: string;
};
export type Remediation = {
  id: string;
  kind: 'remediation';
  sessionId: string;
  title: string;
  createdAt: string;
  subject: string;
  groups: RemedyGroup[];
};
const DAY = 86400000;
export function buildRemediation(
  data: StudyData,
  sessionId: string,
  title: string,
  now = Date.now(),
): Remediation {
  const groups = new Map<string, RemedyGroup>();
  for (const e of data.events.filter(
    (e) => e.sessionId === sessionId && !e.voidedBy && e.score < 0.85,
  )) {
    const q = data.questions.find(
      (q) => q.id === e.questionId && questionAvailable(q),
    );
    if (!q) continue;
    const targets = e.targets?.filter((t) => t.score < 0.85) ?? [
      { skillId: e.skillId, score: e.score },
    ];
    for (const t of targets) {
      const id = e.nodeId + '::' + t.skillId,
        n = data.nodes.find((n) => n.id === e.nodeId);
      if (!n?.skills.some((s) => s.id === t.skillId)) continue;
      const group = groups.get(id) ?? {
        id,
        nodeId: e.nodeId,
        skillId: t.skillId,
        title:
          n.title + ' · ' + n.skills.find((s) => s.id === t.skillId)!.title,
        sources: [],
        stage: 0,
      };
      if (!group.sources.some((s) => s.eventId === e.id))
        group.sources.push({
          question: q,
          eventId: e.id,
          answer: e.answer ?? '手动检查：' + e.outcome,
          score: t.score,
        });
      groups.set(id, group);
    }
  }
  const gs = [...groups.values()].sort(
    (a, b) =>
      a.sources.reduce((s, q) => s + q.score, 0) / a.sources.length -
      b.sources.reduce((s, q) => s + q.score, 0) / b.sources.length,
  );
  return {
    id: 'remediation:' + sessionId,
    kind: 'remediation',
    sessionId,
    title: title + ' · 补救课程',
    createdAt: new Date(now).toISOString(),
    subject: gs[0]?.sources[0]?.question.subject ?? 'all',
    groups: gs,
  };
}
export function remedyProgress(
  job: Remediation,
  g: RemedyGroup,
  events: AnswerEvent[],
  now = Date.now(),
) {
  const linked = events
    .filter(
      (e) =>
        !e.voidedBy &&
        e.learningEvidence?.remediationId === job.id &&
        e.learningEvidence.remediationGroup === g.id,
    )
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const practices = linked.filter(
    (e) =>
      e.learningEvidence?.remediationPhase === 'practice' &&
      Date.parse(e.occurredAt) >=
        Date.parse(g.lessonCompletedAt ?? job.createdAt),
  );
  const last = practices.at(-1),
    due = last ? Date.parse(last.occurredAt) + DAY : null;
  const sourceIds = new Set(g.sources.map((s) => s.question.id)),
    sourceVariants = new Set(g.sources.map((s) => s.question.variant));
  const checks = linked.filter(
    (e) =>
      e.learningEvidence?.remediationPhase === 'verify' &&
      due !== null &&
      Date.parse(e.occurredAt) >= due &&
      !sourceIds.has(e.questionId) &&
      !sourceVariants.has(e.variant) &&
      !practices.some(
        (p) => p.questionId === e.questionId || p.variant === e.variant,
      ),
  );
  const successful = checks.find(
    (e) =>
      e.score >= 0.85 &&
      !e.usedHint &&
      !e.learningEvidence?.suspect &&
      e.predictedConfidence !== 'guess' &&
      (e.activeThinkMs ??
        Date.parse(e.revealedAt) - Date.parse(e.displayedAt)) >=
        Math.max(1500, e.expectedSeconds * 100),
  );
  return {
    practices,
    due,
    ready: due !== null && now >= due,
    successful,
    failed: !successful && checks.length > 0,
  };
}
export function remedyPractice(
  data: StudyData,
  job: Remediation,
  g: RemedyGroup,
  phase: 'practice' | 'verify',
  now = Date.now(),
): QueueItem[] {
  if (
    !g.sources.some(
      (s) =>
        data.events.some((e) => e.id === s.eventId && !e.voidedBy) &&
        data.questions.some(
          (q) => q.id === s.question.id && questionAvailable(q),
        ),
    )
  )
    return [];
  const p = remedyProgress(job, g, data.events, now);
  if (phase === 'verify' && (!p.ready || p.successful)) return [];
  const sources = new Set(g.sources.map((s) => s.question.id)),
    variants = new Set(g.sources.map((s) => s.question.variant));
  const candidates = data.questions.filter(
    (q) =>
      questionAvailable(q) &&
      q.nodeId === g.nodeId &&
      q.skillId === g.skillId &&
      !q.tags.includes('course-check') &&
      (!q.expiresAt || Date.parse(q.expiresAt) > now),
  );
  const newQuestions = candidates.filter(
    (q) =>
      !sources.has(q.id) &&
      !variants.has(q.variant) &&
      !p.practices.some(
        (e) =>
          e.questionId === q.id ||
          e.variant === q.variant ||
          data.questions.find((x) => x.id === e.questionId)?.prompt.trim() ===
            q.prompt.trim(),
      ) &&
      !data.events.some((e) => !e.voidedBy && e.questionId === q.id) &&
      !g.sources.some((s) => s.question.prompt.trim() === q.prompt.trim()),
  );
  const selected = (
    phase === 'verify'
      ? newQuestions.filter((q) => q.verified)
      : newQuestions.length
        ? newQuestions
        : candidates.filter((q) => sources.has(q.id))
  ).slice(0, phase === 'verify' ? 1 : 3);
  return selected.map((q) => ({
    question: q,
    reason: phase === 'verify' ? '补救课程 · 隔天验证' : '补救课程 · 巩固练习',
    priority: 1,
    remediationId: job.id,
    remediationGroup: g.id,
    remediationPhase: phase,
    scaffold:
      phase === 'practice' && sources.has(q.id)
        ? '已讲解原题：用于巩固，不计作独立迁移验证'
        : undefined,
  }));
}
export function dueRemediation(data: StudyData, now = Date.now()): QueueItem[] {
  return (data.jobs ?? [])
    .filter((j): j is Remediation => j.kind === 'remediation')
    .flatMap((j) =>
      j.groups.flatMap((g) => remedyPractice(data, j, g, 'verify', now)),
    )
    .slice(0, 2);
}
export function remedySource(g: RemedyGroup) {
  return [
    '能力：' + g.title,
    '教学目标：讲清这些失分反映的共同问题，区分实际证据和推测；对比错误步骤与正确思路，提供充分讲解和互动，最后进入平台巩固练习。',
    ...g.sources.map(
      (s, i) =>
        `例题 ${i + 1}\n材料：${s.question.passage ?? ''}\n题目：${s.question.prompt}\n学生原回答：${s.answer}\n参考答案：${s.question.answer}\n解析：${s.question.explanation}\n示例步骤：${s.question.solution?.join('\n') ?? ''}`,
    ),
  ].join('\n\n');
}
