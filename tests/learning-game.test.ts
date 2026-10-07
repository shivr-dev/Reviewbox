import test from 'node:test';
import assert from 'node:assert/strict';
import { learningGame } from '../lib/learning-game';
import { buyGameItem, advanceChest, chestPrize } from '../lib/game-client';
import { loadData, put, switchAccount } from '../lib/store';
import { localDay, type AnswerEvent, type StudyData } from '../lib/model';
import {
  companionFrame,
  companionMotion,
  COMPANION_COSTUMES,
} from '../lib/companion-motion';
import { existsSync } from 'node:fs';
const at = Date.parse('2026-10-07T04:00:00Z'),
  DAY = 86400000;
const data = (events: AnswerEvent[] = [], jobs: any[] = []): StudyData => ({
  nodes: [],
  questions: [],
  events,
  jobs,
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { name: '测试', dailyMinutes: 20, surprise: true },
});
const event = (
  id: string,
  time = at,
  patch: Partial<AnswerEvent> = {},
): AnswerEvent => ({
  id,
  questionId: id,
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
  variant: id,
  usedHint: false,
  reason: '复习',
  sessionId: 'session',
  localDay: localDay(new Date(time)),
  version: 1,
  ...patch,
});

test('SuperReview uses ten hearts until expiry and immutable grants are awarded once', () => {
  const grant = {
    id: 'membership',
    kind: 'game-grant',
    version: 1,
    at: new Date(at - 60000).toISOString(),
    day: localDay(new Date(at)),
    source: 'redeem',
    rewards: {
      coins: 100,
      freezes: 3,
      superUntil: new Date(at + DAY).toISOString(),
      refill: true,
    },
  };
  const d = data(
    [event('loss', at - 1000, { score: 0, outcome: 'wrong' })],
    [grant, grant],
  );
  d.settings.gameSkin = 'skin-super';
  const g = learningGame(d, at);
  assert.equal(g.maxHearts, 10);
  assert.equal(g.hearts, 9);
  assert.equal(g.freezes, 3);
  assert.equal(g.coins, 103);
  assert.equal(g.skin, 'skin-super');
  const expired = learningGame(d, at + DAY + 1);
  assert.equal(expired.maxHearts, 5);
  assert.equal(expired.skin, 'default');
  assert.equal(expired.superPlan.active, false);
});

test('six SuperReview actions use six real atlases with isolated frames', () => {
  const files = new Set<string>();
  for (const action of [
    'welcome',
    'correct',
    'thinking',
    'combo',
    'chest',
    'levelup',
  ] as const) {
    const m = companionMotion(action, 'skin-super');
    files.add(m.file);
    assert.ok(existsSync('public/' + m.file));
    assert.equal(companionFrame(action, m.duration, 'skin-super').done, true);
  }
  assert.equal(files.size, 6);
});

test('chest odds and point range have exact boundary behavior', () => {
  assert.deepEqual(
    chestPrize(() => 0.099999),
    { coins: 0, freezes: 1 },
  );
  const values = [0.1, 0];
  assert.deepEqual(
    chestPrize(() => values.shift()!),
    { coins: 50, freezes: 0 },
  );
  const max = [0.1, 0.9999999];
  assert.deepEqual(
    chestPrize(() => max.shift()!),
    { coins: 100, freezes: 0 },
  );
});

test('chests preserve their prize through three taps and only grant it once, isolated per account', async () => {
  await switchAccount('chest-test');
  await assert.rejects(() => advanceChest('missing'), /完成有效练习/);
  await put(
    'job',
    { id: 'chest-unit', kind: 'session', status: 'complete', mode: 'review' },
    'active-session',
  );
  await put(
    'event',
    event('chest-event', Date.now() - 100, { sessionId: 'chest-unit' }),
  );
  const first = await advanceChest('chest-unit');
  assert.equal(first.stage, 1);
  assert.equal(learningGame(await loadData()).coins, 3);
  await put(
    'job',
    { id: 'new-unit', kind: 'session', status: 'active', mode: 'review' },
    'active-session',
  );
  const second = await advanceChest('chest-unit');
  assert.equal(second.stage, 2);
  assert.deepEqual(second.reward, first.reward);
  const third = await advanceChest('chest-unit');
  assert.equal(third.stage, 3);
  assert.deepEqual(third.reward, first.reward);
  const fourth = await advanceChest('chest-unit');
  assert.deepEqual(fourth, third);
  const g = learningGame(await loadData());
  assert.equal(g.coins, 3 + first.reward.coins);
  assert.equal(g.freezes, first.reward.freezes);
  await switchAccount('chest-other');
  await assert.rejects(
    () => advanceChest('chest-unit', 'chest-test'),
    /账户已切换/,
  );
  assert.equal(learningGame(await loadData()).coins, 0);
});
test('rewards deduplicate question/day and immutable event IDs; too fast, voided and malformed records cannot farm XP', () => {
  const a = event('a');
  const d = data([
    a,
    a,
    event('b', at, { questionId: 'a' }),
    event('fast', at, { activeThinkMs: 200 }),
    event('void', at, { voidedBy: { id: 'fix', reason: '题目有误' } }),
    event('invalid', at, { localDay: '2026-99-99' }),
  ]);
  const g = learningGame(d, at);
  assert.equal(g.totalXP, 12);
  assert.equal(g.coins, 3);
  assert.equal(g.daily.count, 1);
  const tomorrow = event('next', at + DAY, { questionId: 'a' });
  assert.equal(learningGame(data([a, tomorrow]), at + DAY).daily.count, 1);
});
test('correct combo resets on error or guessed correctness; XP never changes the original mastery evidence', () => {
  const d = data([
    event('a', at - 4000),
    event('b', at - 3000),
    event('c', at - 2000),
    event('wrong', at - 1000, { outcome: 'wrong', score: 0 }),
    event('guess', at, { predictedConfidence: 'guess' }),
  ]);
  const original = JSON.stringify(d.events);
  const g = learningGame(d, at);
  assert.equal(g.rewards.get('c')?.combo, 3);
  assert.equal(g.rewards.get('wrong')?.combo, 0);
  assert.equal(g.rewards.get('guess')?.correct, false);
  assert.equal(g.bestCombo, 3);
  assert.equal(JSON.stringify(d.events), original);
});
test('streak freezes are spent on missed days; an incomplete current day remains protected without consuming a freeze', () => {
  const day0 = at - 3 * DAY,
    events = Array.from({ length: 34 }, (_, i) => event('earn' + i, day0 + i));
  const purchase = {
    id: 'purchase',
    kind: 'game-purchase',
    version: 1,
    item: 'streak-freeze',
    at: new Date(day0 + 1000).toISOString(),
    day: localDay(new Date(day0)),
  };
  const first = learningGame(data(events, [purchase]), day0 + DAY);
  assert.equal(first.streak, 1);
  assert.equal(first.freezes, 1);
  const protectedDay = learningGame(data(events, [purchase]), day0 + 2 * DAY);
  assert.equal(protectedDay.streak, 2);
  assert.equal(protectedDay.freezes, 0);
  assert.deepEqual(protectedDay.frozenDays, [localDay(new Date(day0 + DAY))]);
  const broken = learningGame(data(events, [purchase]), at);
  assert.equal(broken.streak, 0);
});
test('shop replays real prices, duplicate purchases, earned ownership and correction rollbacks', () => {
  const events = Array.from({ length: 65 }, (_, i) =>
    event('earned' + i, at - 1000 + i),
  );
  const purchase = {
    id: 'skin',
    kind: 'game-purchase',
    version: 1,
    item: 'skin-sky',
    cost: 0,
    at: new Date(at).toISOString(),
    day: localDay(new Date(at)),
  };
  const d = data(events, [purchase, purchase]);
  d.settings.gameSkin = 'skin-sky';
  const g = learningGame(d, at);
  assert.equal(g.coins, 15);
  assert.equal(g.accepted.size, 1);
  assert.equal(g.skin, 'skin-sky');
  events
    .slice(0, 10)
    .forEach((e) => (e.voidedBy = { id: 'fix', reason: '答案错误' }));
  const rollback = learningGame(d, at);
  assert.equal(rollback.accepted.size, 0);
  assert.equal(rollback.skin, 'default');
  assert.equal(rollback.coins, 165);
});
test('hearts refill over time; exams never drain hearts; three assisted recovery answers restore one heart without duplicate rewards', () => {
  const wrongs = Array.from({ length: 5 }, (_, i) =>
    event('w' + i, at - 10000 + i, { score: 0, outcome: 'wrong' }),
  );
  let g = learningGame(data(wrongs), at);
  assert.equal(g.hearts, 0);
  assert.equal(learningGame(data(wrongs), at + 30 * 60000).hearts, 1);
  const rec = Array.from({ length: 3 }, (_, i) =>
    event('r' + i, at - 10 + i, {
      questionId: 'w0',
      usedHint: true,
      learningEvidence: { version: 1, assessment: 'self', gameRecovery: true },
    }),
  );
  g = learningGame(data([...wrongs, ...rec]), at);
  assert.equal(g.hearts, 1);
  assert.equal(g.daily.count, 5);
  assert.equal(g.coins, 15);
  const exams = wrongs.map((e) => ({ ...e, source: 'test' as const }));
  assert.equal(learningGame(data(exams), at).hearts, 5);
});
test('personal week board only projects the seven real days, and goals accept existing settings without migration', () => {
  const g = learningGame(data([event('today')]), at);
  assert.equal(g.week.length, 7);
  assert.equal(
    g.week.reduce((n, d) => n + d.count, 0),
    1,
  );
  assert.equal(g.goal, 10);
  assert.equal(g.badges.find((b) => b.id === 'first')?.earned, true);
});
test('companion action timelines select isolated atlas cells and finish deterministically', () => {
  assert.deepEqual(companionFrame('correct', 0), {
    frame: 0,
    x: 0,
    y: 0,
    done: false,
  });
  assert.equal(companionFrame('correct', 560).y, 100);
  assert.equal(companionFrame('combo', 1400).done, true);
  assert.equal(companionFrame('thinking', 999999).frame, 7);
});
test('every outfit retains its own distinct action sheet and all frames stay within the atlas', () => {
  const files = new Set<string>();
  for (const skin of Object.keys(COMPANION_COSTUMES)) {
    const motion = companionMotion('combo', skin);
    assert.ok(existsSync('public/' + motion.file));
    files.add(motion.file);
    for (const action of ['welcome', 'correct', 'thinking', 'combo'] as const) {
      if (skin !== 'skin-super')
        assert.equal(companionMotion(action, skin).file, motion.file);
      for (let time = 0; time < 1800; time += 15) {
        const frame = companionFrame(action, time, skin);
        assert.ok(
          frame.x >= 0 && frame.x <= 100 && frame.y >= 0 && frame.y <= 100,
        );
      }
    }
    assert.equal(companionFrame('combo', 1600, skin).done, true);
  }
  assert.equal(files.size, 6);
});
test('earned reward is available for a purchase stamped in the same millisecond', () => {
  const events = Array.from({ length: 34 }, (_, i) => event('z' + i, at));
  const purchase = {
    id: 'a-purchase',
    kind: 'game-purchase',
    version: 1,
    item: 'streak-freeze',
    at: new Date(at).toISOString(),
    day: localDay(new Date(at)),
  };
  const g = learningGame(data(events, [purchase]), at);
  assert.equal(g.freezes, 1);
  assert.equal(g.coins, 2);
});
test('concurrent purchases are atomic and isolated from a switched learning account', async () => {
  await switchAccount('game-buy-test');
  const now = Date.now();
  for (let i = 0; i < 45; i++)
    await put('event', event('db-earned' + i, now - 60000 + i));
  const both = await Promise.allSettled([
    buyGameItem('streak-freeze'),
    buyGameItem('streak-freeze'),
  ]);
  assert.equal(both.filter((r) => r.status === 'fulfilled').length, 1);
  const g = learningGame(await loadData());
  assert.equal(g.freezes, 1);
  assert.equal(g.coins, 35);
  await switchAccount('other-game-account');
  await assert.rejects(
    () => buyGameItem('streak-freeze', 'game-buy-test'),
    /账户已切换/,
  );
  assert.equal(learningGame(await loadData()).coins, 0);
});
