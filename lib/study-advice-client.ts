import {
  adviceOpportunity,
  adviceSummary,
  type StudyAdvice,
} from './study-advice';
import { studyAgenda } from './study-orchestrator';
import { apiFetch } from './runtime';
import { uid } from './model';
import { verifiedHypothesis, type StudyHypothesis } from './learning-signals';
import {
  assertWritable,
  currentNamespace,
  database,
  loadData,
  put,
} from './store';
const inflight = new Map<string, Promise<boolean>>();
export function reviewStudyMilestone(ns = currentNamespace()) {
  if (inflight.has(ns)) return inflight.get(ns)!;
  const promise = analyze(ns).finally(() => inflight.delete(ns));
  inflight.set(ns, promise);
  return promise;
}
async function analyze(ns: string) {
  const data = await loadData(ns);
  if (ns !== currentNamespace()) return false;
  const agenda = studyAgenda(data),
    op = adviceOpportunity(data, agenda.actions);
  if (!op) return false;
  const now = Date.now(),
    db = await database();
  assertWritable(ns);
  const tx = db.transaction(['records', 'queue'], 'readwrite'),
    rows = await tx.objectStore('records').getAll();
  const existing = rows
    .filter(
      (r) =>
        r.namespace === ns &&
        !r.deleted &&
        r.kind === 'job' &&
        r.payload.kind === 'study-advice' &&
        Date.parse(r.payload.at) <= now,
    )
    .map((r) => r.payload as StudyAdvice);
  if (
    ns !== currentNamespace() ||
    existing.some((r) => now - Date.parse(r.at) < 86400000) ||
    existing.filter((r) => now - Date.parse(r.at) < 7 * 86400000).length >= 2
  ) {
    await tx.done;
    return false;
  }
  const job: StudyAdvice = {
    id: 'study-advice:' + uid(),
    kind: 'study-advice',
    milestone: op.milestone,
    status: 'pending',
    at: new Date(now).toISOString(),
    expires: new Date(now + 7 * 86400000).toISOString(),
    actionIds: op.candidates.map((a) => a.id),
  };
  const record = {
    id: job.id,
    key: ns + '/' + job.id,
    namespace: ns,
    kind: 'job',
    payload: job,
    updated_at: job.at,
    deleted: false,
  };
  await tx.objectStore('records').put(record);
  await tx.objectStore('queue').put(record);
  await tx.done;
  try {
    if (ns !== currentNamespace()) return false;
    const response = await apiFetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'study-advice',
        milestone: op.milestone,
        summary: adviceSummary(data, op.candidates, now),
      }),
      signal: AbortSignal.timeout(60000),
    });
    const r = (await response.json()) as {
        advice?: {
          hypothesis: StudyHypothesis;
          explanation: string;
          method: string;
        };
      },
      a = r.advice;
    if (
      !response.ok ||
      !a ||
      !a.hypothesis ||
      !['speed', 'retention', 'concept', 'fatigue'].includes(
        a.hypothesis.type,
      ) ||
      (a.hypothesis.nodeId !== undefined &&
        !data.nodes.some((n) => n.id === a.hypothesis.nodeId)) ||
      typeof a.explanation !== 'string' ||
      a.explanation.length > 600 ||
      typeof a.method !== 'string' ||
      a.method.length > 600
    )
      throw new Error('AI 复核未完成，继续使用本地学习安排');
    if (ns !== currentNamespace()) return false;
    assertWritable(ns);
    await put(
      'job',
      {
        ...job,
        ...{
          hypothesis: a.hypothesis,
          verification: verifiedHypothesis(data, a.hypothesis, now),
          explanation: a.explanation,
          method: a.method,
        },
        status: 'complete',
      },
      job.id,
      false,
      ns,
    );
    return true;
  } catch (e) {
    if (ns === currentNamespace()) {
      assertWritable(ns);
      await put(
        'job',
        {
          ...job,
          status: 'error',
          error: '本次未取得有效建议；本地计划继续生效。',
        },
        job.id,
        false,
        ns,
      );
    }
    return false;
  }
}
