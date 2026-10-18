import test from 'node:test';
import assert from 'node:assert/strict';
import { equipmentCommand } from '../lib/equipment-client';
import { equipmentState, eligibleEquipmentSessions } from '../lib/equipment';
import { assertEquipmentWrite } from '../lib/learning-integrity-guard';
import {
  allRecords,
  currentNamespace,
  loadData,
  put,
  switchAccount,
} from '../lib/store';
import { learningGame } from '../lib/learning-game';
import { buyGameItem } from '../lib/game-client';
import { fixture, attempt } from './study-plan-fixtures';
import { localDay } from '../lib/model';
const read = async () => {
  const d = await loadData();
  return equipmentState(d, learningGame(d).accepted, Date.now() + 1000);
};
test('equipment starter, book codex, upgrades and loadouts persist without touching learning or GPA', async () => {
  await switchAccount('equipment-persistence');
  try {
    const d = fixture();
    await put(
      'exam',
      {
        id: 'kept-exam',
        title: '真实成绩',
        subject: 'math',
        date: '2026-10-01',
        scope: [],
        target: 85,
        dailyMinutes: 20,
        result: {
          score: 90,
          maxScore: 100,
          credits: 1,
          recordedAt: new Date().toISOString(),
        },
      },
      'kept-exam',
    );
    const before = (await allRecords()).filter((r) => r.kind !== 'job');
    const a = await equipmentCommand({ action: 'starter' });
    await equipmentCommand({ action: 'starter' });
    assert.equal((await read()).items.length, 4);
    let item = a.state.items.find((i) => i.templateId === 'ink-quill')!;
    let r = await equipmentCommand({
      action: 'enchant',
      itemId: item.id,
      expectedVersion: item.version,
      bookId: 'book-spark',
      tier: 1,
    });
    assert.deepEqual(r.state.materials, a.state.materials);
    assert.ok(r.state.books.includes('book-spark'));
    item = r.state.items.find((i) => i.id === item.id)!;
    r = await equipmentCommand({
      action: 'remove-enchant',
      itemId: item.id,
      expectedVersion: item.version,
      bookId: 'book-spark',
    });
    assert.ok(r.state.books.includes('book-spark'));
    assert.equal(
      r.state.items.find((i) => i.id === item.id)!.enchantments['book-spark'],
      undefined,
    );
    r = await equipmentCommand({
      action: 'upgrade-book',
      bookId: 'book-spark',
      tier: 2,
    });
    assert.equal(r.state.bookLevels['book-spark'], 2);
    item = r.state.items.find((i) => i.id === item.id)!;
    r = await equipmentCommand({
      action: 'enchant',
      itemId: item.id,
      expectedVersion: item.version,
      bookId: 'book-spark',
      tier: 2,
    });
    await equipmentCommand({
      action: 'save-build',
      buildId: 1,
      name: '星光搭配',
    });
    await equipmentCommand({ action: 'unequip', slot: 'penblade' });
    assert.equal((await read()).equipped.penblade, undefined);
    await equipmentCommand({ action: 'load-build', buildId: 1 });
    assert.equal((await read()).equipped.penblade, item.id);
    assert.deepEqual(
      (await allRecords()).filter((r) => r.kind !== 'job'),
      before,
    );
    const ns = currentNamespace();
    await switchAccount('equipment-other-account');
    assert.equal((await read()).started, false);
    await assert.rejects(
      equipmentCommand({ action: 'starter' }, ns),
      /账户已切换/,
    );
  } finally {
    await switchAccount(null);
  }
});
test('concurrent reforge charges once; pending result survives reload and locks keep the exact old affix', async () => {
  await switchAccount('equipment-reforge');
  try {
    const first = (await equipmentCommand({ action: 'starter' })).state,
      item = first.items.find((i) => i.templateId === 'ink-quill')!;
    const c = {
      action: 'reforge' as const,
      itemId: item.id,
      expectedVersion: item.version,
      lockedAffixes: [item.affixes[0].id],
    };
    const results = await Promise.allSettled([
      equipmentCommand(c),
      equipmentCommand(c),
    ]);
    assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    let state = await read();
    assert.equal(state.pendingReforges.length, 1);
    const p = state.pendingReforges[0];
    assert.deepEqual(
      p.affixes.find((f) => f.id === item.affixes[0].id),
      item.affixes[0],
    );
    assert.equal(state.materials.ore, first.materials.ore - p.cost.ore);
    assert.deepEqual((await read()).pendingReforges[0], p);
    await assert.rejects(
      equipmentCommand({
        action: 'upgrade',
        itemId: item.id,
        expectedVersion: 1,
      }),
      /重铸/,
    );
    await equipmentCommand({
      action: 'resolve-reforge',
      itemId: item.id,
      expectedVersion: 1,
      previewId: p.actionId,
      accept: false,
    });
    state = await read();
    assert.equal(state.pendingReforges.length, 0);
    assert.deepEqual(
      state.items.find((i) => i.id === item.id)!.affixes,
      item.affixes,
    );
    assert.equal(state.materials.ore, first.materials.ore - p.cost.ore);
    await assert.rejects(
      equipmentCommand({
        action: 'resolve-reforge',
        itemId: item.id,
        expectedVersion: 1,
        previewId: p.actionId,
        accept: true,
      }),
      /更新/,
    );
  } finally {
    await switchAccount(null);
  }
});
test('qualified wrong answers grant capped, deduplicated loot, and paid supplies credit real materials once', async () => {
  await switchAccount('equipment-loot');
  try {
    const d = fixture(),
      now = Date.now();
    for (const n of d.nodes) await put('node', n, n.id);
    for (const q of d.questions) await put('question', q, q.id);
    for (let s = 0; s < 5; s++) {
      const sessionId = 'loot-session-' + s;
      for (let j = 0; j < 3; j++) {
        const e = attempt(d, s * 3 + j, now - 300000 + s * 30000 + j * 1000, {
          sessionId,
          score: 0,
          outcome: 'wrong',
        });
        await put('event', e, e.id);
      }
      await put(
        'job',
        {
          id: 'done:' + s,
          kind: 'study-completion',
          sessionId,
          completedAt: new Date(now - 295000 + s * 30000).toISOString(),
        },
        'done:' + s,
      );
    }
    assert.equal(eligibleEquipmentSessions(await loadData()).length, 3);
    await equipmentCommand({ action: 'starter' });
    const before = await read();
    const eligible = eligibleEquipmentSessions(await loadData());
    await Promise.all([
      equipmentCommand({ action: 'loot', sessionId: eligible[0].sessionId }),
      equipmentCommand({ action: 'loot', sessionId: eligible[0].sessionId }),
    ]);
    assert.equal((await read()).loot.length, 1);
    assert.ok((await read()).materials.ore > before.materials.ore);
    await assert.rejects(
      equipmentCommand({ action: 'loot', sessionId: 'loot-session-4' }),
      /掉落/,
    );
    await put(
      'job',
      {
        id: 'material-test-grant',
        kind: 'game-grant',
        version: 1,
        at: new Date(now - 1000).toISOString(),
        day: localDay(new Date(now)),
        source: 'redeem',
        rewards: { coins: 100 },
      },
      'material-test-grant',
    );
    const coins = learningGame(await loadData()).coins;
    const oldOre = (await read()).materials.ore;
    await buyGameItem('forge-ore-pack');
    assert.equal(learningGame(await loadData()).coins, coins - 80);
    assert.equal((await read()).materials.ore, oldOre + 12);
    assert.equal((await read()).materials.ore, oldOre + 12);
  } finally {
    await switchAccount(null);
  }
});
test('integrity guard refuses game writes to learning records or score fields', () => {
  assert.throws(
    () =>
      assertEquipmentWrite({
        kind: 'event',
        payload: { kind: 'equipment-action' },
      }),
    /学习完整性/,
  );
  assert.throws(
    () =>
      assertEquipmentWrite({
        kind: 'job',
        payload: { kind: 'equipment-action', mastery: 1 },
      }),
    /学习完整性/,
  );
  assert.doesNotThrow(() =>
    assertEquipmentWrite({
      kind: 'job',
      payload: {
        kind: 'equipment-action',
        action: 'starter',
        id: 'x',
        at: 'x',
        version: 1,
      },
    }),
  );
});
