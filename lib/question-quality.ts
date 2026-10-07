import type { AnswerEvent, Question, StudyData } from './model';

export type QuestionReview = {
  id: string;
  kind: 'question-review';
  questionId: string;
  action: 'pause' | 'resume' | 'revise';
  reason: string;
  at: string;
  original: Question;
  replacement?: Question;
  excludedEventIds: string[];
  retainedEventIds?: string[];
};
export const questionAvailable = (q: Question) => q.reviewStatus !== 'paused';
export function projectQuality(data: StudyData): StudyData {
  const reviews = (data.jobs ?? [])
    .filter((j): j is QuestionReview => j.kind === 'question-review')
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const latest = new Map<string, QuestionReview>();
  const exclusions = new Map<string, { id: string; reason: string }>();
  for (const r of reviews) {
    latest.set(r.questionId, r);
    if (r.action === 'revise')
      for (const id of r.excludedEventIds)
        exclusions.set(id, { id: r.id, reason: r.reason });
  }
  for (const r of latest.values())
    if (r.action === 'pause') {
      for (const e of data.events.filter((e) => e.questionId === r.questionId))
        exclusions.set(e.id, { id: r.id, reason: r.reason });
    }
  for (const r of latest.values())
    if (r.action === 'revise') {
      // A delayed grader of an old run must never introduce new evidence for a retired revision.
      for (const e of data.events.filter(
        (e) =>
          e.questionId === r.questionId && !r.retainedEventIds?.includes(e.id),
      ))
        exclusions.set(e.id, { id: r.id, reason: r.reason });
    }
  return {
    ...data,
    questions: data.questions.map((q) => ({
      ...q,
      reviewStatus:
        latest.get(q.id)?.action === 'pause' ||
        latest.get(q.id)?.action === 'revise'
          ? 'paused'
          : 'active',
    })),
    events: data.events.map((e) => {
      const { voidedBy: _, ...raw } = e;
      return { ...raw, voidedBy: exclusions.get(e.id) };
    }),
  };
}
export const learningEvents = (events: AnswerEvent[]) =>
  events.filter((e) => !e.voidedBy);
export function questionHistory(data: StudyData, id: string) {
  return (data.jobs ?? [])
    .filter(
      (j): j is QuestionReview =>
        j.kind === 'question-review' &&
        (j.questionId === id || j.replacement?.id === id),
    )
    .sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id));
}
