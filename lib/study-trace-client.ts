import {
  currentNamespace,
  database,
  assertWritable,
  loadData,
  put,
} from './store';
import type { DecisionTrace } from './study-utility';
import { validPolicyId } from './policy-config';
export async function persistDecisionTrace(
  trace: DecisionTrace,
  ns = currentNamespace(),
) {
  if (ns !== currentNamespace()) return;
  assertWritable(ns);
  const db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const key = ns + '/' + trace.id;
  if (!(await tx.objectStore('records').get(key))) {
    const record = {
      key,
      id: trace.id,
      namespace: ns,
      kind: 'job',
      payload: { ...trace, kind: 'study-recommendation' },
      updated_at: trace.at,
      deleted: false,
    };
    await tx.objectStore('records').put(record);
    await tx.objectStore('queue').put(record);
  }
  await tx.done;
}
export async function recordRecommendationOutcome(
  trace: DecisionTrace,
  actionId: string,
  choice: 'selected' | 'deferred' | 'started' | 'viewed',
  sessionId?: string,
  ns = currentNamespace(),
) {
  if (ns !== currentNamespace()) throw new Error('账户已切换');
  await persistDecisionTrace(trace, ns);
  const id = 'study-outcome:' + trace.id + ':' + actionId + ':' + choice;
  const data = await loadData(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换');
  if (data.jobs?.some((j) => j.id === id)) return;
  await put(
    'job',
    {
      id,
      kind: 'study-recommendation-outcome',
      traceId: trace.id,
      actionId,
      choice,
      at: new Date().toISOString(),
      sessionId,
      policyId: trace.policyId,
      baselineEventIds: data.events.filter((e) => !e.voidedBy).map((e) => e.id),
    },
    id,
    false,
    ns,
  );
}
export async function changeStudyPolicy(id: string, ns = currentNamespace()) {
  if (!validPolicyId(id)) throw new Error('未知的学习策略版本');
  const d = await loadData(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换');
  const at = new Date().toISOString();
  await put(
    'setting',
    {
      ...d.settings,
      studyPolicy: {
        id,
        previousId: d.settings.studyPolicy?.id ?? 'learning-v2-balanced',
        changedAt: at,
      },
    },
    'settings',
    false,
    ns,
  );
  await put(
    'job',
    {
      id: 'study-policy-change:' + crypto.randomUUID(),
      kind: 'study-policy-change',
      from: d.settings.studyPolicy?.id ?? 'learning-v2-balanced',
      to: id,
      at,
    },
    undefined,
    false,
    ns,
  );
}
