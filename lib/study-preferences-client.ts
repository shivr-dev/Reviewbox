import { assertWritable, currentNamespace, database } from './store';
export async function saveAutoStartPreference(
  enabled: boolean,
  ns = currentNamespace(),
) {
  const check = () => {
    assertWritable(ns);
    if (ns !== currentNamespace())
      throw Error('学习账户已切换，请重新打开设置');
  };
  check();
  const db = await database();
  check();
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  try {
    const previous = await tx.objectStore('records').get(ns + '/settings');
    check();
    const row = {
      key: ns + '/settings',
      namespace: ns,
      id: 'settings',
      kind: 'setting',
      deleted: false,
      updated_at: new Date().toISOString(),
      payload: {
        ...(previous?.deleted ? {} : previous?.payload),
        studyAutoStart: { enabled, acknowledgedAt: new Date().toISOString() },
      },
    };
    await tx.objectStore('records').put(row);
    await tx.objectStore('queue').put(row);
    check();
    await tx.done;
  } catch (e) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw e;
  }
}
