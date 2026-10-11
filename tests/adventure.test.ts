import test from 'node:test';
import assert from 'node:assert/strict';
import { learningGame } from '../lib/learning-game';
import {
  newAdventure,
  applyAdventure,
  validLayout,
  homePath,
  cells,
  type AdventureAction,
} from '../lib/adventure';
import { STARTER_LAYOUT, CHEST_TIERS } from '../lib/home-catalog';
import { buyGameItem, advanceChest, chestPrize } from '../lib/game-client';
import { homeCommand, saveHome } from '../lib/home-client';
import { put, loadData, switchAccount, database } from '../lib/store';
import { localDay, type StudyData, type AnswerEvent } from '../lib/model';
const at = Date.parse('2026-10-07T04:00:00Z'),
  DAY = 86400000;
const stamp = (time: number) => ({
  at: new Date(time).toISOString(),
  day: localDay(new Date(time)),
  version: 1 as const,
});
const data = (jobs: any[] = [], events: AnswerEvent[] = []): StudyData => ({
  nodes: [],
  questions: [],
  events,
  jobs,
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { name: '家园测试', dailyMinutes: 20, surprise: true },
});
const grant = (time = at, coins = 1000, freezes = 0) => ({
  id: 'funds',
  kind: 'game-grant',
  source: 'test',
  rewards: { coins, freezes },
  ...stamp(time),
});
const purchase = (item: string, time = at, id = item) => ({
  id,
  kind: 'game-purchase',
  item,
  ...stamp(time),
});
const action = (
  name: AdventureAction['action'],
  time = at,
  patch: Partial<AdventureAction> = {},
): AdventureAction => ({
  id: name,
  kind: 'adventure-action',
  action: name,
  ...stamp(time),
  ...patch,
});
const event = (time = at): AnswerEvent => ({
  id: 'study',
  questionId: 'q',
  nodeId: 'n',
  skillId: 's',
  subject: 'math',
  score: 1,
  outcome: 'correct',
  source: 'self',
  displayedAt: new Date(time - 10000).toISOString(),
  revealedAt: new Date(time).toISOString(),
  occurredAt: new Date(time).toISOString(),
  activeThinkMs: 10000,
  expectedSeconds: 30,
  difficulty: 2,
  variant: 'q',
  usedHint: false,
  reason: '测试',
  sessionId: 'chest-adventure',
  localDay: localDay(new Date(time)),
  version: 1,
});

test('home starts with free furniture; new purchases use real prices and deduplicate ownership', () => {
  const base = learningGame(data(), at);
  assert.equal(base.coins, 0);
  assert.equal(base.adventure.levels['furniture-desk'], 1);
  const p = purchase('furniture-sofa');
  const g = learningGame(
    data([
      grant(),
      p,
      p,
      { ...p, id: 'repeat' },
      purchase('record-rain'),
      purchase('gift-paper'),
      purchase('visitor-ticket'),
    ]),
    at,
  );
  assert.equal(g.coins, 645);
  assert.equal(g.adventure.levels['furniture-sofa'], 1);
  assert.equal(g.adventure.papers, 1);
  assert.equal(g.adventure.invitations, 1);
  assert.ok(g.adventure.records.has('record-rain'));
  assert.equal(g.accepted.size, 4);
});
test('enchanting spends one lower item and its fixed price; duplicates, missing inventory and insufficient points fail', () => {
  const jobs = [
    grant(at, 1000, 1),
    purchase('chest-ticket'),
    action('enchant-freeze', at + 1, { tier: 0 }),
    action('enchant-ticket', at + 2, { tier: 0 }),
    action('enchant-ticket', at + 3, { id: 'ticket-2', tier: 1 }),
  ];
  const g = learningGame(
    data([
      ...jobs,
      jobs[2],
      action('enchant-freeze', at + 4, { id: 'missing', tier: 0 }),
    ]),
    at + 5,
  );
  assert.deepEqual(g.adventure.freezeTiers, [0, 1, 0]);
  assert.deepEqual(g.adventure.tickets, [0, 0, 1]);
  assert.equal(g.coins, 795);
  assert.equal(g.adventure.accepted.size, 3);
  const s = newAdventure();
  s.tickets[0] = 1;
  assert.equal(
    applyAdventure(s, action('enchant-ticket', at, { tier: 0 }), 44),
    null,
  );
  assert.deepEqual(s.tickets, [1, 0, 0]);
});
test('enhanced freeze protects consecutive missed days but stops its remaining protection after study resumes', () => {
  const start = at - 4 * DAY,
    jobs = [
      grant(start, 1000, 1),
      action('enchant-freeze', start + 1, { tier: 0 }),
      action('enchant-freeze', start + 2, { id: 'freeze-2', tier: 1 }),
    ];
  const g = learningGame(data(jobs, [event(start)]), at);
  assert.equal(g.streak, 4);
  assert.equal(g.freezes, 0);
  assert.equal(g.frozenDays.length, 3);
  const resumed = {
    ...event(start + 2 * DAY),
    id: 'resumed',
    questionId: 'q2',
  };
  const ended = learningGame(data(jobs, [event(start), resumed]), at);
  assert.equal(ended.streak, 0);
  assert.equal(ended.protectionDays, 0);
});
test('gift escrow removes owned rewards until their date and returns them once; bad dates and invalid quantities reject', () => {
  const wrap = action('wrap', at + 1, {
    gift: { resource: 'coins', amount: 100, tier: 0 },
    unlockAt: new Date(at + 1000).toISOString(),
    title: '考试后再拆',
  });
  const jobs = [grant(), purchase('gift-paper'), wrap];
  assert.equal(learningGame(data(jobs), at + 2).coins, 885);
  const early = action('open-gift', at + 999, { target: wrap.id });
  assert.equal(learningGame(data([...jobs, early]), at + 999).coins, 885);
  const open = action('open-gift', at + 1000, { target: wrap.id });
  const g = learningGame(
    data([...jobs, open, open, { ...open, id: 'duplicate-open' }]),
    at + 1000,
  );
  assert.equal(g.coins, 985);
  assert.equal(g.adventure.gifts[0].opened, true);
  const s = newAdventure();
  s.papers = 1;
  s.tickets[2] = 1;
  assert.equal(
    applyAdventure(
      s,
      action('wrap', at, {
        gift: { resource: 'ticket', amount: 1, tier: 2 },
        unlockAt: new Date(at + DAY).toISOString(),
      }),
      0,
    ),
    0,
  );
  assert.equal(s.tickets[2], 0);
  assert.equal(
    applyAdventure(s, action('open-gift', at + DAY, { target: 'wrap' }), 0),
    0,
  );
  assert.equal(s.tickets[2], 1);
  const invalid = newAdventure();
  invalid.papers = 1;
  assert.equal(
    applyAdventure(
      invalid,
      action('wrap', at, {
        gift: { resource: 'coins', amount: -100, tier: 0 },
        unlockAt: new Date(at + DAY).toISOString(),
      }),
      1000,
    ),
    null,
  );
  assert.equal(invalid.papers, 1);
});
test('furniture upgrades change level with fixed costs, visitors consume invitations and leave a permanent souvenir', () => {
  const jobs = [
    grant(),
    purchase('visitor-ticket'),
    action('upgrade', at + 1, { item: 'furniture-desk' }),
    action('upgrade', at + 2, { id: 'upgrade2', item: 'furniture-desk' }),
    action('upgrade', at + 3, { id: 'upgrade3', item: 'furniture-desk' }),
    action('visit', at + 4),
  ];
  const g = learningGame(data(jobs), at + 5);
  assert.equal(g.coins, 760);
  assert.equal(g.adventure.levels['furniture-desk'], 3);
  assert.equal(g.adventure.levels['furniture-cat'], 1);
  assert.equal(g.adventure.invitations, 0);
  assert.equal(g.adventure.accepted.size, 3);
});
test('all chest tiers retain 10% freeze odds and exact displayed point boundaries', () => {
  for (let tier = 0; tier < 3; tier++) {
    assert.deepEqual(
      chestPrize(() => 0.09999, tier),
      { coins: 0, freezes: 1 },
    );
    const low = [0.1, 0],
      high = [0.1, 0.999999];
    assert.equal(
      chestPrize(() => low.shift()!, tier).coins,
      CHEST_TIERS[tier].min,
    );
    assert.equal(
      chestPrize(() => high.shift()!, tier).coins,
      CHEST_TIERS[tier].max,
    );
  }
});
test('room validates footprint, rotation, collisions and door; walking path routes around occupied furniture', () => {
  const levels = newAdventure().levels;
  assert.ok(validLayout(STARTER_LAYOUT, levels));
  assert.equal(
    validLayout(
      [
        ...STARTER_LAYOUT,
        { id: 'clone', item: 'furniture-chair', x: 0, y: 0, rotation: 0 },
      ],
      levels,
    ),
    false,
  );
  assert.equal(
    validLayout(
      STARTER_LAYOUT.map((p) =>
        p.item === 'furniture-chair' ? { ...p, x: 6, y: 6 } : p,
      ),
      levels,
    ),
    false,
  );
  assert.equal(
    validLayout(
      STARTER_LAYOUT.map((p) =>
        p.item === 'furniture-chair' ? { ...p, x: 1, y: 1 } : p,
      ),
      levels,
    ),
    false,
  );
  const rotated = { ...STARTER_LAYOUT[0], rotation: 1 as const };
  assert.deepEqual(cells(rotated), [
    { x: 1, y: 1 },
    { x: 1, y: 2 },
  ]);
  const path = homePath({ x: 6, y: 5 }, STARTER_LAYOUT[0], STARTER_LAYOUT);
  assert.ok(path.length > 1);
  for (const p of path)
    assert.ok(
      !STARTER_LAYOUT.flatMap(cells).some((c) => c.x === p.x && c.y === p.y),
    );
  const blocked = Array.from({ length: 7 }, (_, i) => ({
    id: 'wall' + i,
    item: 'furniture-chair',
    x: 4,
    y: i,
    rotation: 0 as const,
  }));
  assert.deepEqual(
    homePath({ x: 6, y: 5 }, STARTER_LAYOUT[0], [
      ...STARTER_LAYOUT,
      ...blocked,
    ]),
    [],
  );
});
test('atomic home operations: concurrent enchants, boosted chest reservation and replay, gift idempotency, layout sync and account isolation', async () => {
  await switchAccount('adventure-db');
  const now = Date.now() - 1000;
  await put('job', grant(now, 2000, 1));
  await buyGameItem('chest-ticket');
  await buyGameItem('chest-ticket');
  const both = await Promise.allSettled([
    homeCommand({ action: 'enchant-freeze', tier: 0 }),
    homeCommand({ action: 'enchant-freeze', tier: 0 }),
  ]);
  assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
  await homeCommand({ action: 'enchant-ticket', tier: 0 });
  await homeCommand({ action: 'enchant-ticket', tier: 1 });
  await put('event', event(now));
  await put(
    'job',
    {
      id: 'chest-adventure',
      kind: 'session',
      status: 'complete',
      mode: 'review',
    },
    'active-session',
  );
  const first = await advanceChest('chest-adventure');
  assert.equal(first.boostTier, 2);
  assert.deepEqual(learningGame(await loadData()).adventure.tickets, [1, 0, 0]);
  const second = await advanceChest('chest-adventure');
  assert.equal(second.openedAt, first.openedAt);
  assert.deepEqual(second.reward, first.reward);
  const third = await advanceChest('chest-adventure');
  const saved = await loadData();
  assert.deepEqual(
    learningGame({ ...saved, jobs: [...saved.jobs!, third, third] }).adventure
      .tickets,
    [1, 0, 0],
  );
  await buyGameItem('gift-paper');
  const wrapped = await homeCommand({
    action: 'wrap',
    gift: { resource: 'ticket', amount: 1, tier: 0 },
    unlockAt: new Date(Date.now() + 1000).toISOString(),
  });
  assert.equal(learningGame(await loadData()).adventure.tickets[0], 0);
  await assert.rejects(
    () => homeCommand({ action: 'open-gift', target: wrapped.id }),
    /尚未/,
  );
  // Move only the fixture's unlock date into the past; no wall-clock sleep or real account data.
  // Retain the purchase-before-wrap ordering.
  await put('job', {
    ...wrapped,
    unlockAt: new Date(Date.parse(wrapped.at) + 1).toISOString(),
  });
  await homeCommand({ action: 'open-gift', target: wrapped.id });
  await homeCommand({ action: 'open-gift', target: wrapped.id });
  assert.equal(learningGame(await loadData()).adventure.tickets[0], 1);
  await saveHome(STARTER_LAYOUT);
  const db = await database();
  assert.ok(
    (await db.getAll('queue')).some(
      (r) => r.id === 'home-layout' && r.namespace === 'adventure-db',
    ),
  );
  await switchAccount('adventure-other');
  await assert.rejects(
    () => saveHome(STARTER_LAYOUT, 'adventure-db'),
    /账户|家具/,
  );
  assert.equal(learningGame(await loadData()).coins, 0);
  assert.equal(learningGame(await loadData()).adventure.tickets[0], 0);
});
