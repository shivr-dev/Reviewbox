import type { QueueItem, StudyData } from './model';

export type StudySessionView = {
  id: string;
  items: QueueItem[];
  mode: 'review' | 'test';
  title: string;
};

// Persisted completion closes the active job, not the visible result screen.
// Only the user's next action should leave that screen. Never retain across accounts.
export function sessionForView(
  jobs: StudyData['jobs'],
  current: StudySessionView | null,
  retainResult: boolean,
): StudySessionView | null {
  if (retainResult && current) {
    const completed = jobs?.find(
      (j) =>
        j.kind === 'session' &&
        j.id === current.id &&
        j.status === 'complete' &&
        Array.isArray(j.items),
    );
    if (completed) return { ...current, ...completed };
  }
  return (
    jobs
      ?.filter(
        (j) =>
          j.kind === 'session' &&
          j.status === 'active' &&
          Array.isArray(j.items),
      )
      .sort((a, b) =>
        (b.createdAt ?? '').localeCompare(a.createdAt ?? ''),
      )[0] ?? null
  );
}
