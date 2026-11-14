import type { LocalRecord, StudyData } from './model';
import type { ExamRun } from './exam-model';

export type ExamCleanupScope = 'unfinished' | 'all';

export function simulationRuns(data: StudyData): ExamRun[] {
  return (data.jobs ?? []).filter((job) => job.kind === 'exam-run');
}

export const clearedExamRunId = (runId: string) => 'exam-run-cleared:' + runId;

export function simulationRunId(record: LocalRecord): string | undefined {
  if (record.kind === 'event' || record.kind === 'test') {
    const sessionId = record.payload?.sessionId;
    if (typeof sessionId === 'string' && sessionId.startsWith('exam-run:'))
      return sessionId;
    return;
  }
  if (record.kind !== 'job') return;
  if (record.payload?.kind === 'exam-run') return record.id;
  if (['exam-asset', 'exam-asset-chunk'].includes(record.payload?.kind)) {
    const match = /^exam-recording:(exam-run:[^:]+):/.exec(record.id);
    return match?.[1];
  }
}

export function clearedExamRuns(records: LocalRecord[]) {
  return new Set(
    records.flatMap((record) => {
      const runId = record.payload?.runId;
      return !record.deleted &&
        record.kind === 'job' &&
        record.payload?.kind === 'exam-run-cleared' &&
        typeof runId === 'string' &&
        record.id === clearedExamRunId(runId)
        ? [runId]
        : [];
    }),
  );
}
