import {
  FURNITURE,
  HOME_SHOP,
  CHEST_TIERS,
  FREEZE_TIERS,
  type HomePlacement,
} from './home-catalog';
export type GiftContent = {
  resource: 'coins' | 'freeze' | 'ticket';
  amount: number;
  tier: number;
};
export type AdventureAction = {
  id: string;
  kind: 'adventure-action';
  version: 1;
  at: string;
  day: string;
  action:
    | 'enchant-freeze'
    | 'enchant-ticket'
    | 'upgrade'
    | 'wrap'
    | 'open-gift'
    | 'visit';
  item?: string;
  tier?: number;
  gift?: GiftContent;
  unlockAt?: string;
  title?: string;
  target?: string;
};
export type WrappedGift = {
  id: string;
  gift: GiftContent;
  unlockAt: string;
  title: string;
  opened: boolean;
};
export function newAdventure() {
  return {
    levels: {
      'furniture-desk': 1,
      'furniture-chair': 1,
      'furniture-plant': 1,
    } as Record<string, number>,
    freezeTiers: [0, 0, 0],
    tickets: [0, 0, 0],
    papers: 0,
    invitations: 0,
    records: new Set(['record-meadow']),
    gifts: [] as WrappedGift[],
    accepted: new Set<string>(),
  };
}
export type AdventureState = ReturnType<typeof newAdventure>;
export function adventurePurchase(state: AdventureState, item: string) {
  const product = HOME_SHOP.find((p) => p.id === item);
  if (!product) return false;
  if (product.type === 'furniture') {
    if (state.levels[item]) return false;
    state.levels[item] = 1;
  } else if (product.type === 'record') {
    if (state.records.has(item)) return false;
    state.records.add(item);
  } else if (product.type === 'ticket') state.tickets[0]++;
  else if (product.type === 'paper') state.papers++;
  else if (product.type === 'invitation') state.invitations++;
  else return false;
  return true;
}
export function upgradeCost(item: string, level: number) {
  return Math.round(
    (HOME_SHOP.find((p) => p.id === item)?.cost ?? 0) *
      (level === 1 ? 0.6 : 0.9),
  );
}
export function applyAdventure(
  state: AdventureState,
  a: AdventureAction,
  coins: number,
): number | null {
  if (state.accepted.has(a.id)) return null;
  let delta = 0;
  if (a.action === 'enchant-freeze' || a.action === 'enchant-ticket') {
    const tier = a.tier;
    if (tier !== 0 && tier !== 1) return null;
    const pool =
      a.action === 'enchant-freeze' ? state.freezeTiers : state.tickets;
    const cost = (a.action === 'enchant-freeze' ? FREEZE_TIERS : CHEST_TIERS)[
      tier + 1
    ].cost;
    if (pool[tier] < 1 || coins < cost) return null;
    pool[tier]--;
    pool[tier + 1]++;
    delta = -cost;
  } else if (a.action === 'upgrade') {
    const item = a.item ?? '',
      level = state.levels[item] ?? 0,
      cost = upgradeCost(item, level);
    if (
      !FURNITURE[item] ||
      item === 'furniture-cat' ||
      level < 1 ||
      level >= 3 ||
      coins < cost
    )
      return null;
    state.levels[item]++;
    delta = -cost;
  } else if (a.action === 'wrap') {
    const gift = a.gift,
      unlock = Date.parse(a.unlockAt ?? ''),
      at = Date.parse(a.at);
    if (
      !gift ||
      !state.papers ||
      !Number.isFinite(unlock) ||
      unlock <= at ||
      unlock - at > 90 * 86400000
    )
      return null;
    if (gift.resource === 'coins') {
      if (![50, 100, 200].includes(gift.amount) || coins < gift.amount)
        return null;
      delta = -gift.amount;
    } else {
      if (
        !['freeze', 'ticket'].includes(gift.resource) ||
        gift.amount !== 1 ||
        ![0, 1, 2].includes(gift.tier)
      )
        return null;
      const pool =
        gift.resource === 'freeze' ? state.freezeTiers : state.tickets;
      if (pool[gift.tier] < 1) return null;
      pool[gift.tier]--;
    }
    state.papers--;
    state.gifts.push({
      id: a.id,
      gift: { ...gift },
      unlockAt: a.unlockAt!,
      title: (a.title ?? '给未来的自己').slice(0, 40),
      opened: false,
    });
  } else if (a.action === 'open-gift') {
    const gift = state.gifts.find((g) => g.id === a.target);
    if (!gift || gift.opened || Date.parse(a.at) < Date.parse(gift.unlockAt))
      return null;
    gift.opened = true;
    if (gift.gift.resource === 'coins') delta = gift.gift.amount;
    else
      (gift.gift.resource === 'freeze' ? state.freezeTiers : state.tickets)[
        gift.gift.tier
      ]++;
  } else if (a.action === 'visit') {
    if (state.invitations < 1) return null;
    state.invitations--;
    state.levels['furniture-cat'] = 1;
  } else return null;
  state.accepted.add(a.id);
  return delta;
}
export function cells(p: HomePlacement) {
  const f = FURNITURE[p.item];
  if (!f) return [];
  const w = p.rotation ? f.d : f.w,
    d = p.rotation ? f.w : f.d;
  return Array.from({ length: w * d }, (_, i) => ({
    x: p.x + (i % w),
    y: p.y + Math.floor(i / w),
  }));
}
export function validLayout(
  placements: HomePlacement[],
  levels: Record<string, number>,
) {
  const occupied = new Set<string>(),
    items = new Set<string>(),
    ids = new Set<string>();
  if (placements.length > 20) return false;
  for (const p of placements) {
    if (
      !FURNITURE[p.item] ||
      !levels[p.item] ||
      items.has(p.item) ||
      ids.has(p.id) ||
      !p.id ||
      ![0, 1].includes(p.rotation) ||
      !Number.isInteger(p.x) ||
      !Number.isInteger(p.y)
    )
      return false;
    ids.add(p.id);
    items.add(p.item);
    for (const c of cells(p)) {
      if (c.x < 0 || c.y < 0 || c.x >= 7 || c.y >= 7) return false;
      if (p.item === 'furniture-rug') continue;
      const key = c.x + ',' + c.y;
      if (occupied.has(key)) return false;
      occupied.add(key);
    }
  }
  // Keep the front door and the first walking square free.
  return !occupied.has('6,6') && !occupied.has('6,5');
}
export function homePath(
  from: { x: number; y: number },
  target: HomePlacement,
  layout: HomePlacement[],
) {
  const blocked = new Set(
    layout
      .filter((p) => p.item !== 'furniture-rug')
      .flatMap((p) => cells(p).map((c) => c.x + ',' + c.y)),
  );
  const targets = new Set(
    cells(target)
      .flatMap((c) => [
        { x: c.x - 1, y: c.y },
        { x: c.x + 1, y: c.y },
        { x: c.x, y: c.y - 1 },
        { x: c.x, y: c.y + 1 },
      ])
      .filter(
        (c) =>
          c.x >= 0 &&
          c.y >= 0 &&
          c.x < 7 &&
          c.y < 7 &&
          !blocked.has(c.x + ',' + c.y),
      )
      .map((c) => c.x + ',' + c.y),
  );
  const queue = [{ point: from, path: [from] }],
    seen = new Set([from.x + ',' + from.y]);
  while (queue.length) {
    const step = queue.shift()!;
    if (targets.has(step.point.x + ',' + step.point.y)) return step.path;
    for (const d of [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ]) {
      const point = { x: step.point.x + d.x, y: step.point.y + d.y },
        key = point.x + ',' + point.y;
      if (
        point.x < 0 ||
        point.y < 0 ||
        point.x >= 7 ||
        point.y >= 7 ||
        blocked.has(key) ||
        seen.has(key)
      )
        continue;
      seen.add(key);
      queue.push({ point, path: [...step.path, point] });
    }
  }
  return [];
}
