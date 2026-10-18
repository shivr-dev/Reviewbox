import { assertWritable, currentNamespace, database } from './store';

/** Opt-in only. Patch the current account's latest setting in one transaction. */
export async function setAlphaPreview(
  enabled: boolean,
  ns = currentNamespace(),
) {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('学习账户已切换，请重试');
  const db = await database();
  if (ns !== currentNamespace()) throw new Error('学习账户已切换，请重试');
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const previous = await tx.objectStore('records').get(ns + '/settings');
  if (ns !== currentNamespace()) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('学习账户已切换，请重试');
  }
  const record = {
    key: ns + '/settings',
    namespace: ns,
    id: 'settings',
    kind: 'setting',
    payload: {
      ...(previous?.deleted ? {} : previous?.payload),
      alphaPreview: enabled,
    },
    updated_at: new Date().toISOString(),
    deleted: false,
  };
  await tx.objectStore('records').put(record);
  await tx.objectStore('queue').put(record);
  await tx.done;
}
