import {
  put,
  loadData,
  currentNamespace,
  completeActiveSession,
} from './store';
import {
  type QueueItem,
  type AnswerEvent,
  type Question,
  localDay,
} from './model';
import { isPinyin, objectiveScore } from './question-tools';
import { gradeAnswer } from './ai-client';
export type AssessmentSession = {
  id: string;
  items: QueueItem[];
  mode: 'review' | 'test';
  title: string;
};
export type AssessmentDraft = {
  id: string;
  kind: 'assessment';
  sessionId: string;
  session?: AssessmentSession;
  status: 'answering' | 'grading' | 'complete';
  index: number;
  answers: Record<string, string>;
  times: Record<string, number>;
  completedQuestions: string[];
  startedAt: string;
  submittedAt?: string;
};
export const newAssessment = (s: AssessmentSession): AssessmentDraft => ({
  id: 'assessment:' + s.id,
  kind: 'assessment',
  sessionId: s.id,
  session: s,
  status: 'answering',
  index: 0,
  answers: {},
  times: {},
  completedQuestions: [],
  startedAt: new Date().toISOString(),
});
export const assessmentEventId = (sessionId: string, q: Question) =>
  'assessment-answer:' + sessionId + ':' + q.id;
export async function scoreAssessment(
  s: AssessmentSession,
  d: AssessmentDraft,
  manual?: { questionId: string; outcome: 'correct' | 'unsure' | 'wrong' },
  ns = currentNamespace(),
) {
  if (d.status === 'answering') throw new Error('请先交卷');
  if (currentNamespace() !== ns) throw new Error('账户已切换，批改已暂停');
  const snapshot = await loadData(ns);
  const existing = new Set(snapshot.events.map((e) => e.id));
  let error: unknown;
  for (const { question: q } of s.items) {
    const id = assessmentEventId(s.id, q);
    if (existing.has(id)) continue;
    const pinyin = isPinyin(q);
    if (pinyin && manual?.questionId !== q.id) continue;
    if (manual && !pinyin) continue;
    try {
      const answer = d.answers[q.id] ?? '';
      const grade =
        q.type === 'subjective' && answer.trim()
          ? await gradeAnswer(q, answer)
          : undefined;
      if (currentNamespace() !== ns)
        throw new Error('账户已切换，已保留批改进度');
      const score = pinyin
        ? manual!.outcome === 'correct'
          ? 1
          : manual!.outcome === 'unsure'
            ? 0.5
            : 0
        : grade
          ? grade.score / grade.maxScore
          : objectiveScore(q, answer);
      const at = d.submittedAt!;
      const event: AnswerEvent = {
        id,
        questionId: q.id,
        nodeId: q.nodeId,
        skillId: q.skillId,
        subject: q.subject,
        outcome: score >= 0.85 ? 'correct' : score >= 0.4 ? 'unsure' : 'wrong',
        score,
        source: pinyin ? 'self' : grade ? 'rubric' : 'test',
        answer: pinyin ? undefined : answer,
        grade,
        occurredAt: at,
        displayedAt: d.startedAt,
        revealedAt: at,
        activeThinkMs: d.times[q.id] ?? 0,
        expectedSeconds: q.expectedSeconds,
        difficulty: q.difficulty,
        variant: q.variant,
        usedHint: false,
        reason: pinyin ? '测试后手动检查' : '专项测试',
        sessionId: s.id,
        localDay: localDay(new Date(at)),
        version: 1,
      };
      if (grade && q.rubric) {
        const grouped = new Map<string, { points: number; max: number }>();
        for (const r of q.rubric) {
          const v = grouped.get(r.skillId) ?? { points: 0, max: 0 };
          v.points += grade.criteria.find((c) => c.id === r.id)?.score ?? 0;
          v.max += r.max;
          grouped.set(r.skillId, v);
        }
        event.targets = Array.from(grouped, ([skillId, v]) => ({
          skillId,
          score: v.points / v.max,
          weight: v.max / grade.maxScore,
        }));
      }
      await put('event', event, id, false, ns);
      existing.add(id);
    } catch (e) {
      error = e;
    }
  }
  const complete = s.items.every(({ question: q }) =>
    existing.has(assessmentEventId(s.id, q)),
  );
  const next = {
    ...d,
    session: s,
    status: complete ? 'complete' : 'grading',
  } as AssessmentDraft;
  await put('job', next, next.id, false, ns);
  await put(
    'test',
    {
      id: 'test:' + s.id,
      title: s.title,
      subject: s.items.every(
        (i) => i.question.subject === s.items[0].question.subject,
      )
        ? s.items[0].question.subject
        : 'all',
      sessionId: s.id,
      eventIds: s.items
        .map((i) => assessmentEventId(s.id, i.question))
        .filter((id) => existing.has(id)),
      at: d.submittedAt,
      scope: [...new Set(s.items.map((i) => i.question.nodeId))],
    },
    'test:' + s.id,
    false,
    ns,
  );
  if (complete) await completeActiveSession(s.id, ns);
  if (error) throw error;
  return next;
}
