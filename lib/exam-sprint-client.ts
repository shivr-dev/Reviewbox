import type { IDBPObjectStore } from 'idb';
import { sprintTimeLeft, type ExamSprint, type SprintGoal, planExamSprint } from './exam-sprint';
import { uid, type LocalRecord } from './model';
import { projectRecords } from './record-projection';
import { assertWritable, currentNamespace, database } from './store';

type Row = LocalRecord & { key: string; namespace: string };
async function mutate<T>(ns: string, run: (
  records: IDBPObjectStore<unknown, string[], 'records', 'readwrite'>,
  write: (id: string, kind: LocalRecord['kind'], payload: unknown) => Promise<void>,
) => Promise<T>) {
  const check = () => {
    assertWritable(ns);
    if (ns !== currentNamespace()) throw new Error('account');
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records','queue'], 'readwrite');
  const store = tx.objectStore('records');
  try {
    const result = await run(store, async (id, kind, payload) => {
      check();
      const row: Row = { id, kind, payload, key: ns + '/' + id, namespace: ns, deleted: false, updated_at: new Date().toISOString() };
      await store.put(row);
      await tx.objectStore('queue').put(row);
    });
    check();
    await tx.done;
    return result;
  } catch (error) {
    try { tx.abort(); } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
export async function startExamSprint(examId: string, minutes: number, goal: SprintGoal,
  scope: string[] | undefined, ns = currentNamespace()) {
  const id = 'exam-sprint:' + uid();
  return mutate(ns, async (records, write) => {
    const rows = (await records.getAll()).filter(r=>r.namespace===ns);
    const active = rows.find(r=>!r.deleted && r.payload?.kind === 'exam-sprint' && r.payload.status !== 'complete');
    if (active) return active.payload as ExamSprint;
    const data = projectRecords(rows);
    const exam = data.exams.find(e=>e.id===examId);
    const plan = exam && planExamSprint(data, exam, minutes, goal, scope);
    if (!plan) throw new Error('empty');
    const sprint: ExamSprint = {...plan, kind:'exam-sprint', id, status:'paused', startedAt:new Date().toISOString(), phase:0, budgetUsedMs:0};
    await write(id, 'job', sprint);
    // Patch the existing settings row instead of replacing an onboarding draft.
    const saved = rows.find(r=>r.id==='settings' && !r.deleted);
    await write('settings', 'setting', {...saved?.payload,sprintPreferences:{minutes,goal}});
    return sprint;
  });
}
export type SprintCommand = 'resume' | 'tick' | 'pause' | 'next' | 'finish';
export async function updateExamSprint(id: string, owner: string, command: SprintCommand,
  expectedPhase: number, ns = currentNamespace(), now = Date.now()): Promise<ExamSprint> {
  return mutate(ns, async (records, write) => {
    const row = await records.get(ns+'/'+id);
    if (!row || row.deleted || row.kind!=='job' || row.payload?.kind!=='exam-sprint') throw new Error('missing');
    const current = row.payload as ExamSprint;
    if (current.status === 'complete' || (command==='next' && current.phase!==expectedPhase)) return current;
    const live = current.status === 'running' && current.lastTick !== undefined && now - current.lastTick < 9000;
    if (live && current.timerOwner !== owner) {
      if (command === 'tick' || command === 'pause') return current;
      throw new Error('active');
    }
    if ((command === 'tick' || command === 'pause') &&
        (current.status !== 'running' || current.timerOwner !== owner)) return current;
    const left = sprintTimeLeft(current, now);
    const budgetUsedMs = current.minutes * 60_000 - left;
    const phase = current.phase + Number(command === 'next');
    const end = command === 'finish' || !left || phase >= current.phases.length;
    const running = !end && (command === 'resume' || command === 'tick' ||
      (command === 'next' && current.status === 'running'));
    const next: ExamSprint = {
      ...current, phase: Math.min(phase,current.phases.length),
      status: end ? 'complete' : running ? 'running' : 'paused',
      budgetUsedMs, lastTick: running ? now : undefined, timerOwner: running ? owner : undefined,
      endedAt: end ? new Date(now).toISOString() : undefined,
    };
    await write(id, 'job', next);
    return next;
  });
}
