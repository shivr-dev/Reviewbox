import { assertWritable, currentNamespace, database, loadData } from './store';
import {
  equipmentState,
  type EquipmentAction,
  type EquipmentCommand,
} from './equipment';
import { learningGame } from './learning-game';
import { projectQuality } from './question-quality';
import { assertEquipmentWrite } from './learning-integrity-guard';

/** One serializable transaction per operation: costs, preview and inventory cannot diverge. */
export async function equipmentCommand(
  command: EquipmentCommand,
  ns = currentNamespace(),
  requestId?: string,
) {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('学习账户已切换');
  const base = await loadData(ns),
    db = await database();
  if (ns !== currentNamespace()) throw new Error('学习账户已切换');
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  try {
    const rows = (await tx.objectStore('records').getAll()).filter(
      (r) => r.namespace === ns && !r.deleted,
    );
    if (ns !== currentNamespace()) throw new Error('学习账户已切换');
    const snapshot = projectQuality({
      ...base,
      events: rows.filter((r) => r.kind === 'event').map((r) => r.payload),
      jobs: rows.filter((r) => r.kind === 'job').map((r) => r.payload),
    });
    const id =
      command.action === 'starter'
        ? 'equipment-starter:v1'
        : command.action === 'loot'
          ? 'equipment-loot:' + command.sessionId
          : (requestId ?? 'equipment-action:' + crypto.randomUUID());
    const previous = rows.find((r) => r.id === id);
    const latest = Math.max(
      0,
      ...snapshot
        .jobs!.filter((j) => j.kind === 'equipment-action')
        .map((j) => Date.parse(j.at))
        .filter((n) => Number.isFinite(n) && n <= Date.now() + 1000),
    );
    const now = Math.max(Date.now(), latest + 1),
      at = new Date(now).toISOString();
    const purchases = learningGame(snapshot, now).accepted;
    if (previous) {
      if (
        previous.kind !== 'job' ||
        previous.payload.kind !== 'equipment-action'
      )
        throw new Error('装备操作标识冲突');
      const state = equipmentState(snapshot, purchases, now);
      if (!state.accepted.has(id))
        throw new Error('此装备操作未生效，请刷新后重试');
      await tx.done;
      return { state, action: previous.payload as EquipmentAction };
    }
    const action = {
      ...command,
      id,
      kind: 'equipment-action' as const,
      version: 1 as const,
      at,
    };
    const state = equipmentState(
      { ...snapshot, jobs: [...(snapshot.jobs ?? []), action] },
      purchases,
      now,
    );
    if (!state.accepted.has(id))
      throw new Error(
        state.rejected.find((r) => r.id === id)?.reason ?? '装备操作未生效',
      );
    assertWritable(ns);
    if (ns !== currentNamespace()) throw new Error('学习账户已切换');
    const record = {
      id,
      key: ns + '/' + id,
      namespace: ns,
      kind: 'job',
      payload: action,
      updated_at: at,
      deleted: false,
    };
    assertEquipmentWrite(record);
    await tx.objectStore('records').put(record);
    await tx.objectStore('queue').put(record);
    await tx.done;
    return { state, action };
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => {});
    throw error;
  }
}
