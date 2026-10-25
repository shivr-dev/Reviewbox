import { assertWritable, currentNamespace, database } from './store';
import { uid, type Exam, type LocalRecord, type Node } from './model';
import { validateExamDetails, type ExamDetails } from './exam-schedule';

function check(ns: string) {
  assertWritable(ns);
  if (ns !== currentNamespace())
    throw new Error('学习账户已切换，请重新打开考试安排');
}
async function transaction<T>(
  ns: string,
  work: (tx: any, write: (r: LocalRecord) => Promise<void>) => Promise<T>,
) {
  check(ns);
  const db = await database();
  check(ns);
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const write = async (r: LocalRecord) => {
    check(ns);
    const row = { ...r, key: ns + '/' + r.id, namespace: ns };
    await tx.objectStore('records').put(row);
    await tx.objectStore('queue').put(row);
  };
  try {
    const result = await work(tx, write);
    check(ns);
    await tx.done;
    return result;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
}
async function currentExam(tx: any, id: string, ns: string) {
  const row = await tx.objectStore('records').get(ns + '/' + id);
  if (!row || row.kind !== 'exam' || row.deleted)
    throw new Error('考试记录已变更或删除，请刷新后重试');
  return row as LocalRecord;
}
export async function saveExamDetails(
  input: ExamDetails,
  id?: string,
  ns = currentNamespace(),
) {
  return transaction(ns, async (tx, write) => {
    const prior = id ? await currentExam(tx, id, ns) : undefined;
    const nodes = (await tx.objectStore('records').getAll())
      .filter((r: any) => r.namespace === ns && r.kind === 'node' && !r.deleted)
      .map((r: any) => r.payload) as Node[];
    const details = validateExamDetails(input, nodes, prior?.payload);
    const exam: Exam = { ...prior?.payload, ...details, id: id ?? uid() };
    await write({
      id: exam.id,
      kind: 'exam',
      payload: exam,
      deleted: false,
      updated_at: new Date().toISOString(),
    });
    return exam;
  });
}
export async function setExamScheduled(
  id: string,
  active: boolean,
  ns = currentNamespace(),
) {
  return transaction(ns, async (tx, write) => {
    const row = await currentExam(tx, id, ns),
      at = new Date().toISOString();
    await write({
      ...row,
      payload: {
        ...row.payload,
        scheduleStatus: active ? 'active' : 'cancelled',
        scheduleUpdatedAt: at,
      },
      updated_at: at,
    });
  });
}
/** Field-specific callers always transform the latest version, never a stale form snapshot. */
export async function updateExamRecord(
  id: string,
  transform: (exam: Exam) => Exam,
  ns = currentNamespace(),
) {
  return transaction(ns, async (tx, write) => {
    const row = await currentExam(tx, id, ns),
      exam = transform(row.payload);
    if (exam.id !== id) throw new Error('考试标识不能修改');
    await write({
      ...row,
      payload: exam,
      updated_at: new Date().toISOString(),
    });
  });
}
/** Tombstone + durable undo receipt commit together, including the original grade. */
export async function deleteExamRecord(id: string, ns = currentNamespace()) {
  return transaction(ns, async (tx, write) => {
    const row = await currentExam(tx, id, ns),
      at = new Date().toISOString();
    const receipt = {
      id: 'exam-deletion:' + uid(),
      kind: 'exam-deletion',
      examId: id,
      title: row.payload.title,
      status: 'deleted',
      at,
    };
    await write({
      ...row,
      payload: { ...row.payload, deletionToken: receipt.id },
      deleted: true,
      updated_at: at,
    });
    await write({
      id: receipt.id,
      kind: 'job',
      payload: receipt,
      deleted: false,
      updated_at: at,
    });
    return receipt;
  });
}
export async function undoExamDeletion(
  receiptId: string,
  ns = currentNamespace(),
) {
  return transaction(ns, async (tx, write) => {
    const receipt = await tx.objectStore('records').get(ns + '/' + receiptId);
    if (
      !receipt ||
      receipt.deleted ||
      receipt.payload.kind !== 'exam-deletion' ||
      receipt.payload.status !== 'deleted'
    )
      throw new Error('此删除已撤销或撤销记录不可用');
    const row = await tx
      .objectStore('records')
      .get(ns + '/' + receipt.payload.examId);
    if (
      !row?.deleted ||
      row.kind !== 'exam' ||
      row.payload.deletionToken !== receiptId
    )
      throw new Error('考试记录已再次变更，未覆盖现有数据');
    const { deletionToken, ...exam } = row.payload,
      at = new Date().toISOString();
    await write({ ...row, payload: exam, deleted: false, updated_at: at });
    await write({
      ...receipt,
      payload: { ...receipt.payload, status: 'undone', undoneAt: at },
      updated_at: at,
    });
  });
}
export async function saveExamScopeTemplate(
  name: string,
  subject: Exam['subject'],
  scope: string[],
  ns = currentNamespace(),
) {
  return transaction(ns, async (tx, write) => {
    if (!name.trim() || name.trim().length > 30 || !scope.length)
      throw new Error('请先选择知识点，并输入 1–30 字模板名称');
    const rows = await tx.objectStore('records').getAll();
    if (
      scope.some(
        (id) =>
          !rows.some(
            (r: any) =>
              r.namespace === ns &&
              r.kind === 'node' &&
              !r.deleted &&
              r.id === id &&
              r.payload.subject === subject,
          ),
      )
    )
      throw new Error('范围中有无效知识点，请重新选择');
    const at = new Date().toISOString(),
      id = 'exam-scope:' + uid();
    await write({
      id,
      kind: 'job',
      deleted: false,
      updated_at: at,
      payload: {
        id,
        kind: 'exam-scope-template',
        name: name.trim(),
        subject,
        scope: [...new Set(scope)],
        at,
      },
    });
  });
}
