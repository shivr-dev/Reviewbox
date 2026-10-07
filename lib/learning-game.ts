import type { AnswerEvent, StudyData } from './model';
import { localDay } from './model';

export const GAME_SHOP = [
  {
    id: 'streak-freeze',
    name: '连胜冻结',
    cost: 100,
    description: '漏学一天时自动使用。商店补给上限 3 枚，赠送可额外储备。',
    type: 'freeze',
  },
  {
    id: 'skin-sky',
    name: '晴空伙伴',
    cost: 180,
    description: '企鹅与晴空蓝学习背景。',
    type: 'skin',
  },
  {
    id: 'skin-sunset',
    name: '落日伙伴',
    cost: 240,
    description: '企鹅与暖橙落日学习背景。',
    type: 'skin',
  },
  {
    id: 'skin-mint',
    name: '薄荷书桌',
    cost: 120,
    description: '清新的薄荷色伙伴背景。',
    type: 'skin',
  },
  {
    id: 'skin-candy',
    name: '樱花时光',
    cost: 220,
    description: '柔和樱花粉，陪伴每天的学习。',
    type: 'skin',
  },
  {
    id: 'skin-violet',
    name: '紫罗兰笔记',
    cost: 260,
    description: '淡紫色的安静阅读角。',
    type: 'skin',
  },
  {
    id: 'skin-space',
    name: '星空旅人',
    cost: 320,
    description: '深蓝星光背景，开启新的旅程。',
    type: 'skin',
  },
  {
    id: 'skin-gold',
    name: '金色里程碑',
    cost: 400,
    description: '亮金色伙伴背景，纪念持续努力。',
    type: 'skin',
  },
  {
    id: 'skin-explorer',
    name: '探险家企鹅',
    cost: 280,
    description: '蓝围巾与小挎包，准备探索知识。',
    type: 'skin',
  },
  {
    id: 'skin-graduate',
    name: '毕业礼企鹅',
    cost: 360,
    description: '学士帽与披肩，给成长一份仪式感。',
    type: 'skin',
  },
  {
    id: 'skin-raincoat',
    name: '雨中漫步',
    cost: 260,
    description: '黄色雨衣与小伞，专属转伞甩水动作。',
    type: 'skin',
  },
  {
    id: 'skin-astronaut',
    name: '太空探险',
    cost: 420,
    description: '宇航服与头盔，专属失重翻身动作。',
    type: 'skin',
  },
  {
    id: 'skin-scientist',
    name: '实验室伙伴',
    cost: 320,
    description: '实验服与护目镜，专属实验庆祝动作。',
    type: 'skin',
  },
  {
    id: 'heart-refill',
    name: '生命值补给',
    cost: 50,
    description: '恢复至当前上限：普通 5 颗、SuperReview 10 颗。',
    type: 'hearts',
  },
] as const;
export type GameItem = (typeof GAME_SHOP)[number]['id'];
export type GamePurchase = {
  id: string;
  kind: 'game-purchase';
  item: GameItem;
  at: string;
  day: string;
  version: 1;
};
export type GameReward = {
  xp: number;
  coins: number;
  combo: number;
  counted: boolean;
  correct: boolean;
};
export const gameGoal = (data: StudyData) =>
  Math.max(5, Math.min(30, Math.round(data.settings.dailyQuestionGoal ?? 10)));
const DAY = 86400000,
  REGEN = 30 * 60000;
const validDay = (day: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(day) &&
  Number.isFinite(Date.parse(day + 'T12:00:00Z')) &&
  new Date(day + 'T12:00:00Z').toISOString().slice(0, 10) === day;
export const nextGameDay = (day: string, n = 1) =>
  new Date(Date.parse(day + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const duration = (e: AnswerEvent) =>
  e.activeThinkMs ?? Date.parse(e.revealedAt) - Date.parse(e.displayedAt);
export type GameGrant = {
  id: string;
  kind: 'game-grant';
  at: string;
  day: string;
  version: 1;
  source: string;
  rewards: {
    coins?: number;
    freezes?: number;
    skin?: string | null;
    superUntil?: string;
    refill?: boolean;
  };
};
export type GameChest = {
  id: string;
  kind: 'game-chest';
  sessionId: string;
  stage: number;
  at: string;
  day: string;
  version: 1;
  reward: { coins: number; freezes: number };
};
export function gameGrants(data: StudyData, now = Date.now()) {
  const seen = new Set<string>();
  return (data.jobs ?? [])
    .flatMap((j): GameGrant[] => {
      if (j.kind === 'game-grant' && j.version === 1 && j.rewards)
        return [j as GameGrant];
      if (
        j.kind === 'game-chest' &&
        j.version === 1 &&
        j.stage === 3 &&
        j.reward &&
        data.events.some(
          (e) =>
            !e.voidedBy &&
            e.sessionId === j.sessionId &&
            e.source !== 'test' &&
            !e.learningEvidence?.gameRecovery &&
            duration(e) >= 1500,
        )
      )
        return [
          {
            id: j.id,
            kind: 'game-grant',
            at: j.at,
            day: j.day,
            version: 1,
            source: 'chest',
            rewards: j.reward,
          },
        ];
      return [];
    })
    .filter((g) => {
      if (
        seen.has(g.id) ||
        !validDay(g.day) ||
        !Number.isFinite(Date.parse(g.at)) ||
        Date.parse(g.at) > now ||
        g.day > localDay(new Date(now))
      )
        return false;
      seen.add(g.id);
      return true;
    });
}
export function superMembership(data: StudyData, now = Date.now()) {
  const until = Math.max(
    0,
    ...gameGrants(data, now).map(
      (g) => Date.parse(g.rewards.superUntil ?? '') || 0,
    ),
  );
  return {
    active: until > now,
    until: until ? new Date(until).toISOString() : null,
  };
}
export function gameEvents(data: StudyData, now = Date.now()) {
  const ids = new Set<string>();
  return data.events
    .filter(
      (e) =>
        !e.voidedBy &&
        validDay(e.localDay) &&
        e.localDay <= localDay(new Date(now)) &&
        Number.isFinite(Date.parse(e.occurredAt)) &&
        Date.parse(e.occurredAt) <= now &&
        Number.isFinite(e.score) &&
        e.score >= 0 &&
        e.score <= 1 &&
        duration(e) >= 0,
    )
    .sort(
      (a, b) =>
        a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
    )
    .filter((e) => {
      if (ids.has(e.id)) return false;
      ids.add(e.id);
      return true;
    });
}
export function learningGame(data: StudyData, now = Date.now()) {
  const grants = gameGrants(data, now),
    superPlan = superMembership(data, now);
  const maxAt = (at: number) =>
    grants.some(
      (g) =>
        Date.parse(g.at) <= at && Date.parse(g.rewards.superUntil ?? '') > at,
    )
      ? 10
      : 5;
  let MAX_HEARTS = 5;
  const today = localDay(new Date(now)),
    events = gameEvents(data, now),
    seen = new Set<string>(),
    combos = new Map<string, number>(),
    rewards = new Map<string, GameReward>();
  const days = new Map<
    string,
    { xp: number; coins: number; count: number; correct: number }
  >();
  let totalXP = 0,
    bestCombo = 0;
  for (const e of events) {
    const identity = e.localDay + ':' + e.questionId,
      counted = !seen.has(identity) && duration(e) >= 1500;
    if (counted) seen.add(identity);
    const correct =
      e.score >= 0.85 &&
      !e.learningEvidence?.suspect &&
      e.predictedConfidence !== 'guess';
    const combo =
      counted && correct ? (combos.get(e.sessionId ?? '') ?? 0) + 1 : 0;
    combos.set(e.sessionId ?? '', combo);
    bestCombo = Math.max(bestCombo, combo);
    const xp = counted
        ? correct
          ? (e.usedHint ? 8 : 12) + Math.min(9, Math.floor(combo / 3) * 3)
          : e.score >= 0.4
            ? 6
            : 4
        : 0,
      coins = counted ? 3 : 0;
    rewards.set(e.id, { xp, coins, combo, counted, correct });
    totalXP += xp;
    const d = days.get(e.localDay) ?? { xp: 0, coins: 0, count: 0, correct: 0 };
    d.xp += xp;
    d.coins += coins;
    d.count += Number(counted);
    d.correct += Number(counted && correct);
    days.set(e.localDay, d);
  }
  const purchases = (data.jobs ?? [])
    .filter(
      (j): j is GamePurchase =>
        j.kind === 'game-purchase' &&
        j.version === 1 &&
        GAME_SHOP.some((p) => p.id === j.item) &&
        validDay(j.day) &&
        Number.isFinite(Date.parse(j.at)) &&
        Date.parse(j.at) <= now &&
        j.day <= today,
    )
    .sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
  // Replay earned points and purchases in time order. Imported costs and duplicate jobs cannot mint points.
  const purchaseIds = new Set<string>(),
    accepted = new Set<string>(),
    owned = new Set<string>(['default']);
  const frozenDays: string[] = [];
  let coins = 0,
    freezes = 0,
    streak = 0,
    bestStreak = 0,
    hearts = MAX_HEARTS,
    heartAt = 0,
    recovery = 0,
    heartDay = '';
  const start =
    events
      .filter((e) => rewards.get(e.id)?.counted)
      .map((e) => e.localDay)
      .concat(purchases.map((p) => p.day))
      .concat(grants.map((g) => g.day))
      .sort()[0] ?? today;
  const timeItems = [
    ...events.map((e) => ({
      at: e.occurredAt,
      id: e.id,
      day: e.localDay,
      event: e,
    })),
    ...purchases.map((p) => ({ at: p.at, id: p.id, day: p.day, purchase: p })),
    ...grants.map((g) => ({ at: g.at, id: g.id, day: g.day, grant: g })),
  ].sort(
    (a, b) =>
      Date.parse(a.at) - Date.parse(b.at) ||
      Number('purchase' in a) - Number('purchase' in b) ||
      a.id.localeCompare(b.id),
  );
  const replenish = (at: number) => {
    if (heartAt && at > heartAt) {
      const gained = Math.floor((at - heartAt) / REGEN);
      if (gained) {
        hearts = Math.min(MAX_HEARTS, hearts + gained);
        heartAt += gained * REGEN;
      }
    }
  };
  const byDay = new Map<string, typeof timeItems>();
  for (const i of timeItems) {
    const list = byDay.get(i.day) ?? [];
    list.push(i);
    byDay.set(i.day, list);
  }
  for (
    let day = start, guard = 0;
    day <= today && guard < 40000;
    day = nextGameDay(day), guard++
  ) {
    for (const i of byDay.get(day) ?? []) {
      const at = Date.parse(i.at);
      MAX_HEARTS = maxAt(at);
      hearts = Math.min(hearts, MAX_HEARTS);
      if (heartDay !== day) {
        hearts = MAX_HEARTS;
        heartAt = at;
        heartDay = day;
        recovery = 0;
      }
      replenish(at);
      if ('event' in i && i.event) {
        const e = i.event;
        coins += rewards.get(e.id)?.coins ?? 0;
        if (e.source === 'test' || e.learningEvidence?.pressure) continue;
        if (e.learningEvidence?.gameRecovery) {
          if (rewards.get(e.id)?.correct && duration(e) >= 1500) {
            recovery++;
            if (recovery % 3 === 0) hearts = Math.min(MAX_HEARTS, hearts + 1);
          }
          continue;
        }
        if (e.outcome === 'wrong') {
          hearts = Math.max(0, hearts - 1);
          heartAt = at;
        }
      } else if ('grant' in i && i.grant) {
        const r = i.grant.rewards;
        coins += Number.isFinite(r.coins)
          ? Math.max(0, Math.min(100000, Math.floor(r.coins!)))
          : 0;
        freezes += Number.isFinite(r.freezes)
          ? Math.max(0, Math.min(1000, Math.floor(r.freezes!)))
          : 0;
        if (
          r.skin &&
          GAME_SHOP.some((item) => item.type === 'skin' && item.id === r.skin)
        )
          owned.add(r.skin);
        if (r.refill) {
          hearts = MAX_HEARTS;
          heartAt = at;
        }
      } else if ('purchase' in i && i.purchase) {
        const p = i.purchase;
        if (purchaseIds.has(p.id)) continue;
        purchaseIds.add(p.id);
        const item = GAME_SHOP.find((x) => x.id === p.item)!;
        if (
          coins < item.cost ||
          (item.type === 'skin' && owned.has(item.id)) ||
          (item.type === 'freeze' && freezes >= 3) ||
          (item.type === 'hearts' && hearts === MAX_HEARTS)
        )
          continue;
        coins -= item.cost;
        accepted.add(p.id);
        if (item.type === 'skin') owned.add(item.id);
        if (item.type === 'freeze') freezes++;
        if (item.type === 'hearts') {
          hearts = MAX_HEARTS;
          heartAt = at;
        }
      }
    }
    if ((days.get(day)?.count ?? 0) > 0) {
      streak++;
      bestStreak = Math.max(bestStreak, streak);
    } else if (day < today) {
      if (streak && freezes) {
        freezes--;
        frozenDays.push(day);
        streak++;
        bestStreak = Math.max(bestStreak, streak);
      } else streak = 0;
    }
  }
  MAX_HEARTS = maxAt(now);
  hearts = Math.min(hearts, MAX_HEARTS);
  if (superPlan.active) owned.add('skin-super');
  if (heartDay !== today) hearts = MAX_HEARTS;
  else replenish(now);
  const daily = days.get(today) ?? { xp: 0, coins: 0, count: 0, correct: 0 };
  let level = 1,
    remaining = totalXP,
    span = 100;
  while (remaining >= span) {
    remaining -= span;
    level++;
    span = 100 + (level - 1) * 40;
  }
  const skin = owned.has(data.settings.gameSkin ?? 'default')
    ? (data.settings.gameSkin ?? 'default')
    : 'default';
  const subjects = new Set(
    events.filter((e) => rewards.get(e.id)?.counted).map((e) => e.subject),
  );
  const badges = [
    {
      id: 'first',
      title: '第一步',
      description: '完成第一道有效练习',
      earned: totalXP > 0,
    },
    {
      id: 'streak',
      title: '坚持一周',
      description: '连续学习达到 7 天',
      earned: bestStreak >= 7,
    },
    {
      id: 'combo',
      title: '连击达人',
      description: '同一练习内连续答对 5 题',
      earned: bestCombo >= 5,
    },
    {
      id: 'explorer',
      title: '知识探险家',
      description: '练习过至少 4 门学科',
      earned: subjects.size >= 4,
    },
    {
      id: 'transfer',
      title: '触类旁通',
      description: '独立完成一次变式验证',
      earned: events.some(
        (e) =>
          rewards.get(e.id)?.correct &&
          !e.usedHint &&
          (e.learningEvidence?.verificationOf ||
            e.learningEvidence?.remediationPhase === 'verify'),
      ),
    },
    {
      id: 'steady',
      title: '千分里程碑',
      description: '累计获得 1000 XP',
      earned: totalXP >= 1000,
    },
  ];
  const week = Array.from({ length: 7 }, (_, i) => {
    const day = nextGameDay(today, i - 6);
    return {
      day,
      ...(days.get(day) ?? { xp: 0, coins: 0, count: 0, correct: 0 }),
      frozen: frozenDays.includes(day),
    };
  });
  return {
    today,
    totalXP,
    level,
    levelXP: remaining,
    levelTarget: span,
    coins,
    freezes,
    streak,
    bestStreak,
    hearts,
    maxHearts: MAX_HEARTS,
    superPlan,
    nextHeartAt: hearts < MAX_HEARTS ? heartAt + REGEN : null,
    recovery: recovery % 3,
    skin,
    owned,
    accepted,
    frozenDays,
    rewards,
    days,
    daily,
    goal: gameGoal(data),
    goalDone: daily.count >= gameGoal(data),
    week,
    badges,
    bestCombo,
  };
}
