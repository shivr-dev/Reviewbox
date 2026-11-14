import {
  clearedExamRunId,
  clearedExamRuns,
  simulationRunId,
  type ExamCleanupScope,
} from './exam-run-cleanup';
import { assertWritable, currentNamespace, database } from './store';
import type { LocalRecord } from './model';

export async function clearSimulationRuns(
  scope: ExamCleanupScope,
  expectedIds: readonly string[],
  ns = currentNamespace(),
) {
  const check = () => {
    assertWritable(ns);
    if (ns !== currentNamespace()) throw new Error('account-changed');
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const records = tx.objectStore('records');
  const queue = tx.objectStore('queue');
  try {
    const rows = (await records.getAll()).filter((row) => row.namespace === ns);
    check();
    const cleared = clearedExamRuns(rows);
    const confirmed = new Set(expectedIds);
    const runs = rows.filter(
      (row) =>
        !row.deleted &&
        row.kind === 'job' &&
        row.payload?.kind === 'exam-run' &&
        !cleared.has(row.id) &&
        (scope === 'all' || row.payload.status !== 'complete'),
    );
    if (runs.some((row) => !confirmed.has(row.id)))
      throw new Error('exam-runs-changed');
    const runIds = new Set(runs.map((row) => row.id));
    const at = new Date().toISOString();
    async function write(row: LocalRecord) {
      const value = { ...row, key: ns + '/' + row.id, namespace: ns };
      await records.put(value);
      await queue.put(value);
    }
    // Keep a separate durable marker so an old tab or a later cloud sync cannot
    // expose a cleared run. Events remain immutable and the projection hides them.
    for (const run of runs) {
      const id = clearedExamRunId(run.id);
      await write({
        id,
        kind: 'job',
        deleted: false,
        updated_at: at,
        payload: { id, kind: 'exam-run-cleared', runId: run.id },
      });
    }
    for (const row of rows) {
      const runId = simulationRunId(row);
      if (row.deleted || row.kind === 'event' || !runId || !runIds.has(runId))
        continue;
      await write({
        id: row.id,
        kind: row.kind,
        deleted: true,
        payload: { id: row.id },
        updated_at: new Date(
          Math.max(Date.parse(at), (Date.parse(row.updated_at) || 0) + 1),
        ).toISOString(),
      });
    }
    check();
    await tx.done;
    return runs.length;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
