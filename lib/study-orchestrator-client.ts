import {
  assertWritable,
  currentNamespace,
  database,
  loadData,
  put,
} from './store';
import {
  studyAgenda,
  type StudyAction,
  type StudyDecision,
} from './study-orchestrator';
import { paperReady, createRun, type ExamPaper } from './exam-model';
import { createMapRun } from './map-model';
export async function postponeStudyAction(
  action: StudyAction,
  choice: 'seen' | 'defer' = 'defer',
  ns = currentNamespace(),
) {
  if (ns !== currentNamespace())
    throw new Error('账户已切换，请重新进入学习计划');
  const hours = choice === 'seen' ? 7 * 24 : action.kind === 'score' ? 24 : 6;
  const value: StudyDecision = {
    id: 'study-decision:' + action.id,
    kind: 'study-decision',
    actionId: action.id,
    choice,
    at: new Date().toISOString(),
    until: new Date(Date.now() + hours * 3600000).toISOString(),
  };
  await put('job', value, value.id, false, ns);
}
export async function beginPlannedSimulation(
  action: StudyAction,
  ns = currentNamespace(),
) {
  const data = await loadData(ns);
  if (ns !== currentNamespace())
    throw new Error('账户已切换，请重新进入学习计划');
  const p = data.jobs?.find(
    (j): j is ExamPaper => j.kind === 'exam-paper' && j.id === action.paperId,
  );
  if (!p || p.origin !== 'imported' || !paperReady(p, data.questions))
    throw new Error('导入试卷尚未完整就绪，请先补全试题');
  const db = await database();
  assertWritable(ns);
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const records = await tx.objectStore('records').getAll();
  if (ns !== currentNamespace()) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('账户已切换');
  }
  const saved = records.find(
    (r) =>
      r.namespace === ns &&
      !r.deleted &&
      r.kind === 'job' &&
      r.payload.kind === 'exam-run' &&
      r.payload.paperId === p.id &&
      r.payload.status !== 'complete' &&
      !r.payload.map?.practice,
  )?.payload;
  const run =
    saved ??
    (p.exam === 'MAP' ? createMapRun(p, data.questions, false) : createRun(p));
  if (!saved) {
    const record = {
      id: run.id,
      key: ns + '/' + run.id,
      namespace: ns,
      kind: 'job',
      payload: run,
      updated_at: new Date().toISOString(),
      deleted: false,
    };
    await tx.objectStore('records').put(record);
    await tx.objectStore('queue').put(record);
  }
  await tx.done;
  return run;
}
/** Recheck eligibility against fresh account data before using a previously displayed suggestion. */
export async function freshStudyAction(id: string, ns = currentNamespace()) {
  const data = await loadData(ns);
  if (ns !== currentNamespace())
    throw new Error('账户已切换，请重新进入学习计划');
  const agenda = studyAgenda(data),
    action = agenda.actions.find((a) => a.id === id);
  if (!action) throw new Error('学习安排已更新，请查看当前建议');
  return { data, agenda, action, ns };
}
