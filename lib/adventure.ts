import {
  FURNITURE,
  HOME_SHOP,
  CHEST_TIERS,
  FREEZE_TIERS,
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
