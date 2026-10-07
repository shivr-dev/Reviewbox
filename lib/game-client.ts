import {
  allRecords,
  assertWritable,
  currentNamespace,
  database,
  loadData,
} from './store';
import { localDay, uid } from './model';
import {
  GAME_SHOP,
  learningGame,
  type GameItem,
  type GamePurchase,
} from './learning-game';
import { projectQuality } from './question-quality';
import type { GameChest } from './learning-game';
export function chestPrize(
  random: () => number = () =>
    crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296,
) {
  return random() < 0.1
    ? { coins: 0, freezes: 1 }
    : {
        coins:
          50 + Math.floor(Math.min(0.999999999, Math.max(0, random())) * 51),
        freezes: 0,
      };
}
export async function advanceChest(
  sessionId: string,
  ns = currentNamespace(),
): Promise<GameChest> {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换');
  const db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite'),
    records = tx.objectStore('records'),
    id = 'game-chest:' + sessionId;
  const rows = (await records.getAll()).filter(
    (r) => r.namespace === ns && !r.deleted,
  );
  const session = rows.find(
    (r) => r.kind === 'job' && r.payload?.id === sessionId,
  )?.payload;
  const previous = (await records.get(ns + '/' + id))?.payload as
    | GameChest
    | undefined;
  const eligible =
    (previous ||
      (session?.kind === 'session' &&
        session.status === 'complete' &&
        session.mode !== 'test')) &&
    rows.some(
      (r) =>
        r.kind === 'event' &&
        !r.payload.voidedBy &&
        r.payload.sessionId === sessionId &&
        r.payload.source !== 'test' &&
        !r.payload.learningEvidence?.gameRecovery &&
        (r.payload.activeThinkMs ??
          Date.parse(r.payload.revealedAt) -
            Date.parse(r.payload.displayedAt)) >= 1500,
    );
  if (!eligible || ns !== currentNamespace()) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('完成有效练习后才能开启宝箱');
  }
  const at = new Date().toISOString(),
    chest: GameChest =
      previous?.stage === 3
        ? previous
        : {
            id,
            kind: 'game-chest',
            sessionId,
            stage: Math.min(3, (previous?.stage ?? 0) + 1),
            reward: previous?.reward ?? chestPrize(),
            at,
            day: localDay(),
            version: 1,
          };
  const row = {
    key: ns + '/' + id,
    namespace: ns,
    id,
    kind: 'job',
    payload: chest,
    updated_at: at,
    deleted: false,
  };
  assertWritable(ns);
  await records.put(row);
  await tx.objectStore('queue').put(row);
  await tx.done;
  return chest;
}
export async function buyGameItem(itemId: GameItem, ns = currentNamespace()) {
  assertWritable(ns);
  if (ns !== currentNamespace()) throw new Error('账户已切换，请重新打开商店');
  const base = await loadData(ns),
    db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const rows = (await tx.objectStore('records').getAll()).filter(
    (r) => r.namespace === ns && !r.deleted,
  );
  const data = projectQuality({
    ...base,
    events: rows.filter((r) => r.kind === 'event').map((r) => r.payload),
    jobs: rows.filter((r) => r.kind === 'job').map((r) => r.payload),
    settings: rows
      .filter((r) => r.kind === 'setting')
      .reduce((a, r) => ({ ...a, ...r.payload }), base.settings),
  });
  const item = GAME_SHOP.find((i) => i.id === itemId),
    state = learningGame(data);
  let error = '';
  if (!item) error = '商品不存在';
  else if (state.coins < item.cost) error = '点数不足，继续练习即可获得';
  else if (item.type === 'skin' && state.owned.has(item.id))
    error = '已经拥有这款皮肤';
  else if (item.type === 'freeze' && state.freezes >= 3)
    error = '连胜冻结库存已满';
  else if (item.type === 'hearts' && state.hearts === state.maxHearts)
    error = '生命值已经充足';
  else if (currentNamespace() !== ns) error = '账户已切换';
  if (error) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error(error);
  }
  assertWritable(ns);
  const at = new Date().toISOString(),
    p: GamePurchase = {
      id: 'game-purchase:' + uid(),
      kind: 'game-purchase',
      item: itemId,
      at,
      day: localDay(),
      version: 1,
    },
    row = {
      key: ns + '/' + p.id,
      namespace: ns,
      id: p.id,
      kind: 'job',
      payload: p,
      updated_at: at,
      deleted: false,
    };
  await tx.objectStore('records').put(row);
  await tx.objectStore('queue').put(row);
  await tx.done;
  return p;
}
let audio: AudioContext | undefined;
export function rewardSound(correct: boolean) {
  try {
    audio ??= new AudioContext();
    void audio.resume().catch(() => {});
    const now = audio.currentTime;
    (correct ? [660, 880, 1100] : [330, 294]).forEach((frequency, i) => {
      const o = audio!.createOscillator(),
        g = audio!.createGain();
      o.type = 'sine';
      o.frequency.value = frequency;
      g.gain.setValueAtTime(0.0001, now + i * 0.09);
      g.gain.exponentialRampToValueAtTime(0.04, now + i * 0.09 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.15);
      o.connect(g);
      g.connect(audio!.destination);
      o.start(now + i * 0.09);
      o.stop(now + i * 0.09 + 0.16);
    });
  } catch {
    /* Sound is optional when the browser has no audio context. */
  }
}
