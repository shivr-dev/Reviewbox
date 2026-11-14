import test from 'node:test';
import assert from 'node:assert/strict';
import { createRun } from '../lib/exam-model';
import { clearSimulationRuns } from '../lib/exam-run-cleanup-client';
import { clearedExamRunId } from '../lib/exam-run-cleanup';
import {
  allRecords,
  currentNamespace,
  loadData,
  pendingCount,
  put,
  switchAccount,
} from '../lib/store';
import { projectRecords } from '../lib/record-projection';
import {
  fixture,
  importedPaper,
  schoolExam,
  attempt,
} from './study-plan-fixtures';

test('cleanup frees a stuck simulation, preserves papers and school scores, and ignores stale snapshots', async () => {
  await switchAccount('qa-simulation-cleanup');
  const ns = currentNamespace();
  const data = fixture('ce'),
    paper = importedPaper(data);
  await put('job', paper);
  const school = {
    ...schoolExam(data, Date.now(), -1),
    result: {
      score: 88,
      maxScore: 100,
      credits: 1,
      recordedAt: new Date().toISOString(),
    },
  };
  await put('exam', school);
  const stuck = createRun(paper);
  const report = { ...createRun(paper), status: 'complete' as const };
  await put('job', stuck);
  await put('job', report);
  const event = attempt(data, 0, Date.now(), { sessionId: report.id });
  await put('event', event);
  await put('event', {
    ...event,
    id: 'regular-event',
    sessionId: 'ordinary-review',
  });
  await put('test', { id: 'report', sessionId: report.id });
  const recording = 'exam-recording:' + stuck.id + ':speaking';
  await put('job', {
    id: recording,
    kind: 'exam-asset',
    parts: [recording + ':0'],
  });
  await put('job', {
    id: recording + ':0',
    kind: 'exam-asset-chunk',
    data: 'test',
  });
  await assert.rejects(
    clearSimulationRuns('unfinished', [], ns),
    /exam-runs-changed/,
  );
  assert.ok((await loadData()).jobs?.some((job) => job.id === stuck.id));
  assert.equal(await clearSimulationRuns('unfinished', [stuck.id], ns), 1);
  await put('job', { ...stuck, index: 5 });
  const rows = await allRecords();
  assert.ok(rows.find((row) => row.id === stuck.id)?.deleted);
  assert.ok(rows.some((row) => row.id === clearedExamRunId(stuck.id)));
  assert.ok(rows.find((row) => row.id === recording + ':0')?.deleted);
  assert.ok((await pendingCount()) > 0);
  assert.ok(!(await loadData()).jobs?.some((job) => job.id === stuck.id));
  assert.ok((await loadData()).jobs?.some((job) => job.id === report.id));
  assert.equal(
    projectRecords(
      rows.map((row) =>
        row.id === stuck.id ? { ...row, deleted: false, payload: stuck } : row,
      ),
    ).jobs?.some((job) => job.id === stuck.id),
    false,
  );
  assert.equal(await clearSimulationRuns('all', [report.id], ns), 1);
  const cleared = await loadData();
  assert.equal(cleared.exams[0].result?.score, 88);
  assert.equal(cleared.tests.length, 0);
  assert.deepEqual(
    cleared.events.map((row) => row.id),
    ['regular-event'],
  );
  assert.ok(cleared.jobs?.some((job) => job.id === paper.id));
  assert.ok(
    (await allRecords()).some((row) => row.id === event.id && !row.deleted),
  );
  const newRun = createRun(paper);
  await put('job', newRun);
  assert.ok((await loadData()).jobs?.some((job) => job.id === newRun.id));
  await switchAccount('qa-simulation-other');
  await assert.rejects(
    clearSimulationRuns('all', [newRun.id], ns),
    /account-changed/,
  );
  assert.equal((await loadData()).jobs?.length, 0);
});
