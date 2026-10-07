import {
  allRecords,
  currentNamespace,
  database,
  assertWritable,
  loadData,
} from './store';
import { apiFetch } from './runtime';
import { questionSchema } from './importer';
import { assertQuestionFormat } from './question-tools';
import { uid, type Question } from './model';
import type { QuestionReview } from './question-quality';

export async function reviewQuestion(
  q: Question,
  action: QuestionReview['action'],
  reason: string,
  replacement?: Question,
  exclude = true,
  ns = currentNamespace(),
) {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换，请重新打开题目');
  const rows = await allRecords(ns),
    now = new Date().toISOString();
  const old = rows.find(
    (r) => r.kind === 'question' && r.id === q.id && !r.deleted,
  );
  if (!old) throw new Error('题目已移除，无法修订');
  const { reviewStatus: _a, ...expected } = q;
  const { reviewStatus: _b, ...actual } = old.payload;
  if (JSON.stringify(expected) !== JSON.stringify(actual))
    throw new Error('题目已在其他操作中更新，请重新打开后修订');
  if (!reason.trim() || reason.length > 1200)
    throw new Error('请填写争议或修订原因（最多 1200 字）');
  let next: Question | undefined;
  if (action === 'revise') {
    if (!replacement) throw new Error('请填写修订后的题目');
    next = questionSchema.parse({
      ...replacement,
      id: 'question-revision:' + uid(),
      version: q.version + '.r',
      verified: false,
      verification: undefined,
    }) as Question;
    if (
      next.nodeId !== q.nodeId ||
      next.skillId !== q.skillId ||
      next.subject !== q.subject
    )
      throw new Error('修订应保留原知识点与能力关联');
    assertQuestionFormat(next);
  }
  const review: QuestionReview = {
    id: 'question-review:' + uid(),
    kind: 'question-review',
    questionId: q.id,
    action,
    reason: reason.trim(),
    at: now,
    original: actual,
    replacement: next,
    retainedEventIds:
      action === 'revise' && !exclude
        ? rows
            .filter((r) => r.kind === 'event' && r.payload.questionId === q.id)
            .map((r) => r.payload.id)
        : undefined,
    excludedEventIds:
      action === 'revise' && exclude
        ? rows
            .filter((r) => r.kind === 'event' && r.payload.questionId === q.id)
            .map((r) => r.payload.id)
        : [],
  };
  // Check the question again within the write transaction; retain immutable events.
  const db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const current = await tx.objectStore('records').get(ns + '/' + q.id);
  if (current?.updated_at !== old.updated_at || currentNamespace() !== ns) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('题目或账户已变化，请重新打开后操作');
  }
  assertWritable(ns);
  const write = async (id: string, kind: string, payload: unknown) => {
    const row = {
      key: ns + '/' + id,
      namespace: ns,
      id,
      kind,
      payload,
      updated_at: now,
      deleted: false,
    };
    await tx.objectStore('records').put(row);
    await tx.objectStore('queue').put(row);
  };
  await write(review.id, 'job', review);
  if (next) {
    await write(next.id, 'question', next);
    // Fork reusable exam papers. Existing runs retain their exact original paper.
    for (const row of rows.filter(
      (r) =>
        r.kind === 'job' &&
        r.payload.kind === 'exam-paper' &&
        Object.values(r.payload.questions ?? {}).includes(q.id),
    )) {
      const paper = row.payload,
        id = 'exam-paper:' + uid();
      await write(id, 'job', {
        ...paper,
        id,
        title: paper.title + ' · 修订版',
        createdAt: now,
        questions: Object.fromEntries(
          Object.entries(paper.questions).map(([slot, id]) => [
            slot,
            id === q.id ? next!.id : id,
          ]),
        ),
      });
    }
  }
  await tx.done;
  return review;
}

// Verify the exact edited question. A rejection never generates a replacement.
export async function verifyRevision(
  q: Question,
  ns = currentNamespace(),
): Promise<void> {
  const check = () => {
    assertWritable(ns);
    if (ns !== currentNamespace()) throw new Error('账户已切换，核验已停止');
  };
  check();
  const initial = (await allRecords(ns)).find(
    (r) => r.kind === 'question' && r.id === q.id && !r.deleted,
  );
  if (!initial) throw new Error('修订题已移除');
  const { reviewStatus: _status, ...expected } = q;
  if (JSON.stringify(expected) !== JSON.stringify(initial.payload))
    throw new Error('修订题已更新，请重新打开后核验');
  const call = async (body: unknown) => {
    check();
    const response = await apiFetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(65000),
    });
    const result = (await response.json()) as any;
    if (!response.ok) throw new Error(result.error ?? '核验未完成，可以重试');
    check();
    return result;
  };
  const count = q.subject === 'math' ? 3 : 1;
  const solvers = await Promise.all(
    Array.from({ length: count }, (_, i) =>
      call({ action: 'solve', question: q, slot: i + 1 }).then((v) => v.solver),
    ),
  );
  const verdict = await call({ action: 'judge', question: q, solvers });
  if (!verdict.pass)
    throw new Error(
      '修订题未通过核验：' + (verdict.reason ?? '请继续核对题意与答案'),
    );
  const projected = await loadData(ns);
  if (projected.questions.find((x) => x.id === q.id)?.reviewStatus === 'paused')
    throw new Error('该题已暂停，不能标记核验通过');
  const db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const current = await tx.objectStore('records').get(ns + '/' + q.id);
  if (current?.updated_at !== initial.updated_at || currentNamespace() !== ns) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('题目或账户已变化，核验结果未覆盖新内容');
  }
  check();
  const row = {
    ...current,
    payload: {
      ...current.payload,
      verified: true,
      verification: {
        method:
          count === 3
            ? '3 isolated solvers + judge'
            : 'independent review + judge',
        solverCount: count,
        at: new Date().toISOString(),
      },
    },
    updated_at: new Date().toISOString(),
  };
  await tx.objectStore('records').put(row);
  await tx.objectStore('queue').put(row);
  await tx.done;
}
