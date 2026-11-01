import { assertWritable, currentNamespace, database, loadData } from './store';
import { localDay, uid } from './model';
import { learningGame } from './learning-game';
import { type AdventureAction } from './adventure';
import { projectQuality } from './question-quality';

export async function homeCommand(
  command: Omit<AdventureAction, 'id' | 'kind' | 'version' | 'at' | 'day'>,
  ns = currentNamespace(),
) {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换');
  const base = await loadData(ns),
    db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const records = tx.objectStore('records'),
    rows = (await records.getAll()).filter(
      (r) => r.namespace === ns && !r.deleted,
    );
  const id =
    command.action === 'open-gift'
      ? 'adventure-open:' + command.target
      : 'adventure-action:' + uid();
  const previous = await records.get(ns + '/' + id);
  if (previous && !previous.deleted) {
    await tx.done;
    return previous.payload as AdventureAction;
  }
  const at = new Date().toISOString(),
    action: AdventureAction = {
      ...command,
      id,
      kind: 'adventure-action',
      version: 1,
      at,
      day: localDay(),
    };
  const data = projectQuality({
    ...base,
    events: rows.filter((r) => r.kind === 'event').map((r) => r.payload),
    jobs: [
      ...rows.filter((r) => r.kind === 'job').map((r) => r.payload),
      action,
    ],
  });
  if (
    !learningGame(data).adventure.accepted.has(id) ||
    ns !== currentNamespace()
  ) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(
      command.action === 'open-gift'
        ? '礼物尚未到开启日期'
        : '库存或点数不足，或此操作已经完成',
    );
  }
  assertWritable(ns);
  const row = {
    key: ns + '/' + id,
    namespace: ns,
    id,
    kind: 'job' as const,
    payload: action,
    updated_at: at,
    deleted: false,
  };
  await records.put(row);
  await tx.objectStore('queue').put(row);
  await tx.done;
  return action;
}

