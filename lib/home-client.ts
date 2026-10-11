import { assertWritable, currentNamespace, database, loadData } from './store';
import { localDay, uid } from './model';
import { learningGame } from './learning-game';
import { validLayout, type AdventureAction } from './adventure';
import { type HomePlacement } from './home-catalog';
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

export async function saveHome(
  layout: HomePlacement[],
  ns = currentNamespace(),
) {
  assertWritable(ns);
  const base = await loadData(ns),
    db = await database(),
    tx = db.transaction(['records', 'queue'], 'readwrite');
  const rows = (await tx.objectStore('records').getAll()).filter(
    (r) => r.namespace === ns && !r.deleted,
  );
  const game = learningGame({
    ...base,
    events: rows.filter((r) => r.kind === 'event').map((r) => r.payload),
    jobs: rows.filter((r) => r.kind === 'job').map((r) => r.payload),
  });
  if (
    ns !== currentNamespace() ||
    !validLayout(layout, game.adventure.levels)
  ) {
    tx.abort();
    await tx.done.catch(() => {});
    throw new Error('家具不能重叠或超出房间，请保留门口通道');
  }
  const at = new Date().toISOString(),
    id = 'home-layout',
    row = {
      key: ns + '/' + id,
      namespace: ns,
      id,
      kind: 'job' as const,
      payload: { id, kind: 'home-layout', version: 1, placements: layout },
      updated_at: at,
      deleted: false,
    };
  assertWritable(ns);
  await tx.objectStore('records').put(row);
  await tx.objectStore('queue').put(row);
  await tx.done;
}

export const RECORDS = [
  {
    id: 'record-meadow',
    name: '晴日散步',
    color: '#f6c64f',
    notes: [60, 64, 67, 72, 71, 67, 64, 62],
    tempo: 420,
  },
  {
    id: 'record-rain',
    name: '雨天爵士',
    color: '#6ab0ce',
    notes: [60, 63, 67, 70, 67, 65, 63, 58],
    tempo: 520,
  },
  {
    id: 'record-night',
    name: '星光夜航',
    color: '#9684cc',
    notes: [57, 64, 69, 71, 72, 69, 64, 60],
    tempo: 680,
  },
];
/** Original local instrumental loops: no remote music requests, no autoplay. */
export function playRecord(id: string) {
  const record = RECORDS.find((r) => r.id === id) ?? RECORDS[0],
    audio = new AudioContext();
  void audio.resume().catch(() => {});
  let n = 0;
  function note() {
    const time = audio.currentTime,
      o = audio.createOscillator(),
      g = audio.createGain(),
      pitch = record.notes[n++ % record.notes.length];
    o.type = 'sine';
    o.frequency.value = 440 * 2 ** ((pitch - 69) / 12);
    g.gain.setValueAtTime(0, time);
    g.gain.linearRampToValueAtTime(0.07, time + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, time + 0.7);
    o.connect(g);
    g.connect(audio.destination);
    o.start(time);
    o.stop(time + 0.8);
    if (n % 2 === 0) {
      const bass = audio.createOscillator(),
        gain = audio.createGain();
      bass.type = 'triangle';
      bass.frequency.value = 440 * 2 ** ((pitch - 81) / 12);
      gain.gain.setValueAtTime(0.025, time);
      gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.9);
      bass.connect(gain);
      gain.connect(audio.destination);
      bass.start();
      bass.stop(time + 1);
    }
  }
  note();
  const timer = setInterval(note, record.tempo);
  return () => {
    clearInterval(timer);
    void audio.close().catch(() => {});
  };
}
