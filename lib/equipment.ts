import type { AnswerEvent, StudyData } from './model';
import { localDay } from './model';
import { effectiveAnswerTime } from './learning-evidence';
import {
  EQUIPMENT_AFFIXES,
  EQUIPMENT_BOOKS,
  EQUIPMENT_SLOTS,
  EQUIPMENT_SUPPLIES,
  EQUIPMENT_SYNERGIES,
  EQUIPMENT_TEMPLATES,
  STARTER_BOOKS,
  STARTER_EQUIPMENT,
  STARTER_MATERIALS,
  type EquipmentAffix,
  type EquipmentMaterials,
  type EquipmentSlot,
  type EquipmentTemplate,
} from './equipment-catalog';

export type EquipmentMemory = {
  sessionId: string;
  day: string;
  eventIds: string[];
  summary: string;
};
export type EquipmentItem = {
  id: string;
  templateId: string;
  level: number;
  version: number;
  affixes: EquipmentAffix[];
  enchantments: Record<string, number>;
  awakening: number;
  memories: EquipmentMemory[];
  createdAt: string;
};
export type EquipmentBuild = {
  id: 1 | 2 | 3;
  name: string;
  equipped: Partial<Record<EquipmentSlot, string>>;
  enchantments?: Record<string, Record<string, number>>;
};
export type EquipmentCommand =
  | { action: 'starter' }
  | { action: 'equip'; itemId: string }
  | { action: 'unequip'; slot: EquipmentSlot }
  | {
      action: 'upgrade' | 'dismantle' | 'awaken';
      itemId: string;
      expectedVersion: number;
    }
  | {
      action: 'enchant';
      itemId: string;
      expectedVersion: number;
      bookId: string;
      tier: 1 | 2 | 3;
    }
  | {
      action: 'reforge';
      itemId: string;
      expectedVersion: number;
      lockedAffixes?: string[];
    }
  | {
      action: 'resolve-reforge';
      itemId: string;
      expectedVersion: number;
      previewId: string;
      accept: boolean;
    }
  | { action: 'save-build'; buildId: 1 | 2 | 3; name: string }
  | { action: 'load-build'; buildId: 1 | 2 | 3 }
  | { action: 'loot'; sessionId: string }
  | { action: 'upgrade-book'; bookId: string; tier: 2 | 3 }
  | {
      action: 'remove-enchant';
      itemId: string;
      expectedVersion: number;
      bookId: string;
    };
export type EquipmentAction = EquipmentCommand & {
  id: string;
  kind: 'equipment-action';
  version: 1;
  at: string;
};
export type EquipmentLoot = {
  id: string;
  sessionId: string;
  at: string;
  day: string;
  templateId: string;
  bookId?: string;
  materials: EquipmentMaterials;
  convertedToInk: number;
  itemId?: string;
};
export type EquipmentPreview = {
  itemId: string;
  actionId: string;
  version: number;
  affixes: EquipmentAffix[];
  cost: EquipmentMaterials;
};
export type EquipmentState = {
  started: boolean;
  items: EquipmentItem[];
  materials: EquipmentMaterials;
  books: string[];
  bookLevels: Record<string, number>;
  equipped: Partial<Record<EquipmentSlot, string>>;
  builds: EquipmentBuild[];
  pendingReforges: EquipmentPreview[];
  loot: EquipmentLoot[];
  accepted: Set<string>;
  rejected: { id: string; reason: string }[];
  equipmentHistory: {
    at: string;
    equipped: Partial<Record<EquipmentSlot, string>>;
  }[];
};
const valid = (x: unknown): x is number =>
  Number.isFinite(x) && Number.isInteger(x) && Number(x) >= 0;
const template = (item: EquipmentItem) =>
  EQUIPMENT_TEMPLATES.find((t) => t.id === item.templateId)!;
function hash(input: string) {
  let h = 2166136261;
  for (const c of input) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
function pick<T>(rows: readonly T[], seed: string): T {
  return rows[hash(seed) % rows.length];
}
export function equipmentItemName(item: EquipmentItem) {
  return template(item)?.name ?? '未知装备';
}
export function equipmentCost(
  command: EquipmentCommand,
  item?: EquipmentItem,
): EquipmentMaterials {
  const none = { ore: 0, ink: 0, thread: 0 };
  if (command.action === 'upgrade-book')
    return {
      ore: command.tier * 2,
      ink: command.tier * 3,
      thread: command.tier,
    };
  if (!item) return none;
  if (command.action === 'upgrade')
    return {
      ore: 3 + item.level * 3,
      ink: 0,
      thread:
        template(item).slot === 'cloak' || template(item).slot === 'charm'
          ? 2 + item.level
          : 0,
    };
  if (command.action === 'enchant') return none;
  if (command.action === 'reforge') {
    const locks = command.lockedAffixes?.length ?? 0;
    return { ore: 4 + locks * 2, ink: 3 + locks * 2, thread: 0 };
  }
  if (command.action === 'awaken')
    return {
      ore: 8 * (item.awakening + 1),
      ink: 4 * (item.awakening + 1),
      thread: 4 * (item.awakening + 1),
    };
  return none;
}
export function equipmentEffects(state: EquipmentState) {
  const effects = new Set<string>();
  let oreBonus = 0,
    threadBonus = 0;
  const sets: Record<string, number> = {};
  for (const id of Object.values(state.equipped)) {
    const item = state.items.find((i) => i.id === id);
    if (!item) continue;
    const t = template(item);
    if (t.set) sets[t.set] = (sets[t.set] ?? 0) + 1;
    const affixes = [
      ...item.affixes,
      ...Object.entries(item.enchantments).flatMap(([bookId, tier]) => {
        const b = EQUIPMENT_BOOKS.find((b) => b.id === bookId);
        return b ? [{ id: b.affix, tier }] : [];
      }),
    ];
    for (const affix of affixes) {
      effects.add(affix.id);
      if (affix.id === 'artisan') oreBonus += affix.tier;
      if (affix.id === 'weaver') threadBonus += affix.tier;
    }
    if (item.awakening) effects.add('awakening-' + Math.min(3, item.awakening));
  }
  const synergies = EQUIPMENT_SYNERGIES.filter(
    (s) => (sets[s.id] ?? 0) >= s.pieces,
  );
  return {
    effects: [...effects],
    synergies,
    oreBonus: Math.min(2, oreBonus),
    threadBonus: Math.min(2, threadBonus),
  };
}
const blank = (): EquipmentState => ({
  started: false,
  items: [],
  materials: { ore: 0, ink: 0, thread: 0 },
  books: [],
  bookLevels: {},
  equipped: {},
  builds: [],
  pendingReforges: [],
  loot: [],
  accepted: new Set(),
  rejected: [],
  equipmentHistory: [],
});
function spend(state: EquipmentState, cost: EquipmentMaterials) {
  if (
    !Object.entries(cost).every(
      ([k, n]) =>
        valid(n) && state.materials[k as keyof EquipmentMaterials] >= n,
    )
  )
    return false;
  for (const k of ['ore', 'ink', 'thread'] as const)
    state.materials[k] -= cost[k];
  return true;
}
function addMaterials(state: EquipmentState, amount: EquipmentMaterials) {
  for (const k of ['ore', 'ink', 'thread'] as const)
    state.materials[k] += amount[k];
}
function grantItem(
  state: EquipmentState,
  t: EquipmentTemplate,
  id: string,
  at: string,
) {
  const item: EquipmentItem = {
    id,
    templateId: t.id,
    level: 0,
    version: 1,
    affixes: t.affixes.map((a) => ({ ...a })),
    enchantments: {},
    awakening: 0,
    memories: [],
    createdAt: at,
  };
  state.items.push(item);
  return item;
}

/** Qualification rewards deliberate participation including wrong/unsure answers, never just correct scores. */
export function eligibleEquipmentSessions(data: StudyData, now = Date.now()) {
  const events = data.events.filter(
    (e) =>
      !e.voidedBy &&
      Number.isFinite(Date.parse(e.occurredAt)) &&
      Date.parse(e.occurredAt) <= now &&
      effectiveAnswerTime(e) >= 1500 &&
      !e.learningEvidence?.gameRecovery,
  );
  const jobs = data.jobs ?? [];
  const completed = new Map<string, { id: string; at: string }>();
  for (const job of jobs) {
    const id =
      job.kind === 'study-completion'
        ? job.sessionId
        : job.kind === 'session' && job.status === 'complete'
          ? job.id
          : job.kind === 'pressure-run' && job.status === 'complete'
            ? job.id
            : undefined;
    const at = job.completedAt ?? job.finishedAt ?? job.at;
    if (
      typeof id === 'string' &&
      typeof at === 'string' &&
      Number.isFinite(Date.parse(at)) &&
      Date.parse(at) <= now
    )
      completed.set(id, { id, at });
  }
  for (const t of data.tests ?? [])
    if (
      t.sessionId &&
      Number.isFinite(Date.parse(t.at)) &&
      Date.parse(t.at) <= now
    )
      completed.set(t.sessionId, { id: t.sessionId, at: t.at });
  const used = new Set<string>(),
    perDay = new Map<string, number>(),
    result: {
      sessionId: string;
      at: string;
      day: string;
      events: AnswerEvent[];
    }[] = [];
  for (const session of [...completed.values()].sort(
    (a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id),
  )) {
    const day = localDay(new Date(session.at));
    if ((perDay.get(day) ?? 0) >= 3) continue;
    const seen = new Set<string>();
    const qualified = events
      .filter(
        (e) =>
          e.sessionId === session.id &&
          Date.parse(e.occurredAt) <= Date.parse(session.at),
      )
      .sort(
        (a, b) =>
          a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
      )
      .filter((e) => {
        const k = localDay(new Date(e.occurredAt)) + '|' + e.questionId;
        if (used.has(k) || seen.has(k)) return false;
        seen.add(k);
        return true;
      });
    if (qualified.length < 3) continue;
    qualified.forEach((e) =>
      used.add(localDay(new Date(e.occurredAt)) + '|' + e.questionId),
    );
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    result.push({
      sessionId: session.id,
      at: session.at,
      day,
      events: qualified,
    });
  }
  return result;
}
function lootTemplate(seed: string) {
  const roll = (hash(seed + ':rarity') % 10000) / 10000,
    rarity =
      roll < 0.6
        ? 'common'
        : roll < 0.88
          ? 'rare'
          : roll < 0.98
            ? 'epic'
            : 'unique';
  return pick(
    EQUIPMENT_TEMPLATES.filter((t) => t.rarity === rarity),
    seed + ':template',
  );
}
export function equipmentReforgePreview(
  item: EquipmentItem,
  actionId: string,
  lockedAffixes: string[] = [],
) {
  const t = template(item),
    locked = item.affixes
      .filter((a) => lockedAffixes.includes(a.id))
      .map((a) => ({ ...a }));
  const pool = EQUIPMENT_AFFIXES.filter(
    (a) =>
      (a.slots as readonly string[]).includes(t.slot) &&
      !locked.some((l) => l.id === a.id),
  );
  const count = Math.min(3, Math.max(item.affixes.length, t.affixes.length));
  const ranked = [...pool].sort(
    (a, b) => hash(actionId + ':' + a.id) - hash(actionId + ':' + b.id),
  );
  return [
    ...locked,
    ...ranked.slice(0, Math.max(0, count - locked.length)).map((a) => ({
      id: a.id,
      tier: (1 + (hash(actionId + ':tier:' + a.id) % 3)) as 1 | 2 | 3,
    })),
  ];
}
/** Replay validates every command against resources and item revision at that point. Invalid jobs never mint assets. */
export function equipmentState(
  data: StudyData,
  acceptedPurchases: Set<string> = new Set(),
  now = Date.now(),
): EquipmentState {
  const state = blank(),
    seen = new Set<string>(),
    qualified = eligibleEquipmentSessions(data, now);
  const rows = (data.jobs ?? [])
    .filter((j) => j.kind === 'equipment-action' || j.kind === 'game-purchase')
    .filter(
      (j) =>
        typeof j.id === 'string' &&
        typeof j.at === 'string' &&
        Number.isFinite(Date.parse(j.at)) &&
        Date.parse(j.at) <= now,
    )
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  const history = (at: string) =>
    state.equipmentHistory.push({ at, equipped: { ...state.equipped } });
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.kind === 'game-purchase') {
      const supply = EQUIPMENT_SUPPLIES.find((p) => p.id === row.item);
      if (supply && acceptedPurchases.has(row.id))
        addMaterials(state, supply.materials);
      continue;
    }
    const a = row as EquipmentAction;
    let error = '';
    const fail = (reason: string) => {
      error = reason;
    };
    const item =
      'itemId' in a ? state.items.find((i) => i.id === a.itemId) : undefined;
    const pending = item
      ? state.pendingReforges.find((p) => p.itemId === item.id)
      : undefined;
    if (a.version !== 1) {
      fail('装备记录版本不支持');
    } else if (a.action === 'starter') {
      if (state.started) fail('启程礼只可领取一次');
      else if (a.id !== 'equipment-starter:v1') fail('启程礼标识无效');
      else {
        state.started = true;
        addMaterials(state, STARTER_MATERIALS);
        state.books = [...STARTER_BOOKS];
        for (const id of state.books) state.bookLevels[id] = 1;
        for (const id of STARTER_EQUIPMENT) {
          const t = EQUIPMENT_TEMPLATES.find((t) => t.id === id)!;
          const gear = grantItem(state, t, 'starter:' + id, a.at);
          state.equipped[t.slot] = gear.id;
        }
        history(a.at);
      }
    } else if (!state.started) fail('请先领取启程装备');
    else if (a.action === 'loot') {
      const session = qualified.find(
        (s) =>
          s.sessionId === a.sessionId && Date.parse(s.at) <= Date.parse(a.at),
      );
      if (
        a.id !== 'equipment-loot:' + a.sessionId ||
        state.loot.some((l) => l.sessionId === a.sessionId) ||
        !session
      )
        fail('尚无可领取的有效练习掉落');
      else {
        const t = lootTemplate(a.sessionId),
          effect = equipmentEffects(state),
          materials = {
            ore: 3 + effect.oreBonus,
            ink: 2,
            thread: 2 + effect.threadBonus,
          };
        let convertedToInk = 0,
          itemId: string | undefined;
        if (state.items.some((i) => i.templateId === t.id)) {
          convertedToInk = { common: 3, rare: 6, epic: 10, unique: 16 }[
            t.rarity
          ];
          materials.ink += convertedToInk;
        } else itemId = grantItem(state, t, 'loot:' + a.sessionId, a.at).id;
        const book = pick(EQUIPMENT_BOOKS, a.sessionId + ':book');
        if (!state.books.includes(book.id)) {
          state.books.push(book.id);
          state.bookLevels[book.id] = 1;
        } else materials.ink += 2;
        addMaterials(state, materials);
        state.loot.push({
          id: a.id,
          sessionId: a.sessionId,
          at: a.at,
          day: session.day,
          templateId: t.id,
          bookId: book.id,
          materials,
          convertedToInk,
          itemId,
        });
        for (const gear of state.items) {
          const times = session.events.map((e) => Date.parse(e.occurredAt));
          const first = Math.min(...times),
            last = Math.max(...times);
          const snap = state.equipmentHistory
            .filter((h) => Date.parse(h.at) <= first)
            .at(-1);
          const swapped = state.equipmentHistory.some(
            (h) =>
              Date.parse(h.at) > first &&
              Date.parse(h.at) <= last &&
              !Object.values(h.equipped).includes(gear.id),
          );
          if (
            snap &&
            Object.values(snap.equipped).includes(gear.id) &&
            !swapped &&
            !gear.memories.some((m) => m.sessionId === a.sessionId)
          )
            gear.memories.push({
              sessionId: a.sessionId,
              day: session.day,
              eventIds: session.events.map((e) => e.id),
              summary: `共同完成 ${session.events.length} 道认真作答`,
            });
        }
      }
    } else if (a.action === 'upgrade-book') {
      const current = state.bookLevels[a.bookId] ?? 0;
      if (
        !state.books.includes(a.bookId) ||
        ![2, 3].includes(a.tier) ||
        a.tier !== current + 1
      )
        fail('附魔书需按 I、II、III 顺序升级');
      else if (
        state.pendingReforges.some(
          (p) =>
            state.items.find((i) => i.id === p.itemId)?.enchantments[a.bookId],
        )
      )
        fail('请先处理已附魔装备的重铸结果');
      else if (!spend(state, equipmentCost(a))) fail('升级附魔书的材料不足');
      else {
        state.bookLevels[a.bookId] = a.tier;
        for (const gear of state.items)
          if (gear.enchantments[a.bookId]) {
            gear.enchantments[a.bookId] = a.tier;
            gear.version++;
          }
      }
    } else if (a.action === 'save-build') {
      if (
        ![1, 2, 3].includes(a.buildId) ||
        typeof a.name !== 'string' ||
        !a.name.trim()
      )
        fail('方案名称或位置无效');
      else {
        state.builds = state.builds.filter((b) => b.id !== a.buildId);
        state.builds.push({
          id: a.buildId,
          name: a.name.trim().slice(0, 30),
          equipped: { ...state.equipped },
          enchantments: Object.fromEntries(
            Object.values(state.equipped).flatMap((id) => {
              const gear = state.items.find((i) => i.id === id);
              return gear ? [[id, { ...gear.enchantments }]] : [];
            }),
          ),
        });
        state.builds.sort((x, y) => x.id - y.id);
      }
    } else if (a.action === 'load-build') {
      const build = state.builds.find((b) => b.id === a.buildId);
      if (!build) fail('方案尚未保存');
      else if (state.pendingReforges.length)
        fail('请先处理重铸结果，再切换搭配');
      else {
        state.equipped = {};
        for (const slot of EQUIPMENT_SLOTS) {
          const id = build.equipped[slot];
          const gear = state.items.find(
            (i) => i.id === id && template(i).slot === slot,
          );
          if (gear) {
            state.equipped[slot] = id;
            const saved = build.enchantments?.[id!];
            if (saved) {
              gear.enchantments = Object.fromEntries(
                Object.keys(saved)
                  .filter(
                    (bookId) =>
                      state.books.includes(bookId) &&
                      (
                        EQUIPMENT_BOOKS.find((b) => b.id === bookId)?.slots as
                          | readonly string[]
                          | undefined
                      )?.includes(slot),
                  )
                  .slice(
                    0,
                    { common: 1, rare: 2, epic: 2, unique: 3 }[
                      template(gear).rarity
                    ],
                  )
                  .map((bookId) => [bookId, state.bookLevels[bookId] ?? 1]),
              );
              gear.version++;
            }
          }
        }
        history(a.at);
      }
    } else if (a.action === 'unequip') {
      if (!(EQUIPMENT_SLOTS as readonly string[]).includes(a.slot))
        fail('装备位置无效');
      else {
        delete state.equipped[a.slot];
        history(a.at);
      }
    } else if (!item) fail('装备不存在或已经分解');
    else if (a.action === 'equip') {
      state.equipped[template(item).slot] = item.id;
      history(a.at);
    } else if (
      !('expectedVersion' in a) ||
      !valid(a.expectedVersion) ||
      a.expectedVersion !== item.version
    )
      fail('装备已更新，请刷新后重试');
    else if (a.action === 'resolve-reforge') {
      if (
        !pending ||
        pending.actionId !== a.previewId ||
        pending.version !== item.version ||
        typeof a.accept !== 'boolean'
      )
        fail('重铸预览已失效');
      else {
        if (a.accept) item.affixes = pending.affixes.map((x) => ({ ...x }));
        item.version++;
        state.pendingReforges = state.pendingReforges.filter(
          (p) => p.itemId !== item.id,
        );
      }
    } else if (pending) fail('请先保留或接受当前重铸结果');
    else if (a.action === 'upgrade') {
      if (item.level >= 5) fail('装备已经满级');
      else if (!spend(state, equipmentCost(a, item))) fail('强化材料不足');
      else {
        item.level++;
        item.version++;
      }
    } else if (a.action === 'enchant') {
      const book = EQUIPMENT_BOOKS.find((b) => b.id === a.bookId),
        old = item.enchantments[a.bookId] ?? 0;
      if (!book || !state.books.includes(book.id)) fail('请先学习这本附魔书');
      else if (!(book.slots as readonly string[]).includes(template(item).slot))
        fail('此附魔不适用于当前装备位置');
      else if (
        ![1, 2, 3].includes(a.tier) ||
        a.tier !== state.bookLevels[book.id]
      )
        fail('请使用图鉴中已解锁的附魔等级');
      else if (old === a.tier) fail('此附魔已经装配');
      else if (
        Object.keys(item.enchantments).length >=
          { common: 1, rare: 2, epic: 2, unique: 3 }[template(item).rarity] &&
        !old
      )
        fail('附魔槽已满，请先卸下一个附魔');
      else {
        item.enchantments[book.id] = a.tier;
        item.version++;
      }
    } else if (a.action === 'remove-enchant') {
      if (!item.enchantments[a.bookId]) fail('此附魔未装配');
      else {
        delete item.enchantments[a.bookId];
        item.version++;
      }
    } else if (a.action === 'reforge') {
      const locks = a.lockedAffixes ?? [];
      if (
        !Array.isArray(locks) ||
        locks.length > 2 ||
        new Set(locks).size !== locks.length ||
        locks.some((id) => !item.affixes.some((f) => f.id === id))
      )
        fail('最多锁定两条已有词缀');
      else if (locks.length >= item.affixes.length)
        fail('至少保留一条可重铸词条');
      else {
        const cost = equipmentCost(a, item);
        if (!spend(state, cost)) fail('重铸材料不足');
        else
          state.pendingReforges.push({
            itemId: item.id,
            actionId: a.id,
            version: item.version,
            affixes: equipmentReforgePreview(item, a.id, locks),
            cost,
          });
      }
    } else if (a.action === 'dismantle') {
      if (Object.values(state.equipped).includes(item.id))
        fail('请先卸下装备再分解');
      else {
        const rarity = { common: 1, rare: 2, epic: 3, unique: 4 }[
          template(item).rarity
        ];
        addMaterials(state, {
          ore: rarity + item.level,
          ink: rarity * 2,
          thread: rarity,
        });
        state.items = state.items.filter((i) => i.id !== item.id);
      }
    } else if (a.action === 'awaken') {
      const tier = item.awakening + 1;
      if (tier > 3) fail('已经完成全部觉醒');
      else if (
        item.memories.length < tier * 3 ||
        new Set(item.memories.map((m) => m.day)).size < tier
      )
        fail(`需要 ${tier * 3} 段共同学习记忆与 ${tier} 个学习日`);
      else if (!spend(state, equipmentCost(a, item))) fail('觉醒材料不足');
      else {
        item.awakening = tier;
        item.version++;
      }
    } else fail('未知装备操作');
    if (error) state.rejected.push({ id: a.id, reason: error });
    else state.accepted.add(a.id);
  }
  return state;
}
