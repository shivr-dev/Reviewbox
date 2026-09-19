import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  switchAccount,
  put,
  allRecords,
  installPack,
  restoreBackup,
  syncCloud,
  pendingCount,
  uploadLocalToAccount,
  syncBatches,
  loadData,
} from '../lib/store';
import { generateVerified } from '../lib/ai-client';
import {
  initial,
  applyAnswer,
  computeMastery,
  buildQueue,
  priority,
  DAY,
} from '../lib/engine';
import { seedNodes, seedQuestions, corePack } from '../lib/seed';
import { validatePack, smartParse } from '../lib/importer';
import { evaluateExpression } from '../components/diagram';
import { localDay, type AnswerEvent, type StudyData } from '../lib/model';
const time = Date.parse('2026-09-05T04:00:00Z');
test('new spaces keep examples optional, explicit installation survives first cloud login', async () => {
  const fresh = await switchAccount('fresh-empty');
  assert.equal(fresh.questions.length, 0);
  assert.equal(fresh.nodes.length, seedNodes.length);
  await switchAccount(null);
  await installPack(corePack);
  await uploadLocalToAccount('first-cloud');
  const cloud = await switchAccount('first-cloud');
  assert.equal(cloud.questions.length, corePack.questions.length);
});
test('cloud batches respect UTF-8 size and record limits', () => {
  const rows = Array.from({ length: 7 }, (_, i) => ({
    id: 'large-' + i,
    kind: 'material' as const,
    payload: { text: '中'.repeat(350000) },
    updated_at: new Date().toISOString(),
    deleted: false,
  }));
  const batches = syncBatches(rows);
  assert.equal(batches.flat().length, rows.length);
  assert.equal(batches.length, 3);
  for (const records of batches)
    assert.ok(
      new TextEncoder().encode(JSON.stringify({ records })).length < 3500000,
    );
});
test('in-flight AI job stays in its original account after an account switch', async () => {
  await switchAccount('generation-origin');
  const oldFetch = globalThis.fetch;
  const q = {
    ...seedQuestions.find((q) => q.subject === 'math')!,
    id: 'generated-namespace-check',
  };
  const node = seedNodes.find((n) => n.id === q.nodeId)!;
  let solverCalls = 0;
  globalThis.fetch = async (_url, init) => {
    const b = JSON.parse(String(init?.body));
    if (b.action === 'generate') {
      await switchAccount('generation-other');
      return Response.json({ question: q });
    }
    if (b.action === 'solve') {
      solverCalls++;
      return Response.json({
        solver: {
          answer: q.answer,
          steps: ['calculated'],
          wellPosed: true,
          unique: true,
          ambiguities: [],
        },
      });
    }
    return Response.json({ pass: true, reason: 'checked' });
  };
  try {
    await generateVerified(
      node,
      node.skills.find((s) => s.id === q.skillId)!,
      2,
      'test',
      [],
      () => {},
    );
    assert.equal(solverCalls, 3);
    assert.ok(!(await allRecords()).some((r) => r.id === q.id));
    await switchAccount('generation-origin');
    assert.ok(
      (await loadData()).questions.some((x) => x.id === q.id && x.verified),
    );
  } finally {
    globalThis.fetch = oldFetch;
  }
});
function event(overrides: Partial<AnswerEvent> = {}): AnswerEvent {
  return {
    id: crypto.randomUUID(),
    nodeId: 'n',
    skillId: 's',
    questionId: 'q',
    subject: 'math',
    outcome: 'correct',
    score: 1,
    source: 'self',
    occurredAt: new Date(time).toISOString(),
    displayedAt: new Date(time - 20000).toISOString(),
    revealedAt: new Date(time).toISOString(),
    activeThinkMs: 20000,
    expectedSeconds: 20,
    difficulty: 3,
    variant: 'a',
    usedHint: false,
    reason: 'test',
    sessionId: 'session',
    localDay: localDay(new Date(time)),
    version: 1,
    ...overrides,
  };
}
const base: StudyData = {
  nodes: seedNodes,
  questions: seedQuestions,
  events: [],
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { dailyMinutes: 20, name: 'test', surprise: true },
};
test('same-day repetition cannot create long-term mastery', () => {
  let s = initial('n', 's');
  for (let i = 0; i < 50; i++)
    s = applyAnswer(
      s,
      event({
        occurredAt: new Date(time + i * 60000).toISOString(),
        variant: String(i),
      }),
    );
  assert.ok(s.mastery <= 0.430001);
  assert.equal(s.stage, 0);
  assert.equal(s.stability, 1);
});
test('instant reveals have low weight; slower recall has shorter interval', () => {
  const s = initial('n', 's'),
    fast = applyAnswer(s, event({ activeThinkMs: 500 })),
    normal = applyAnswer(s, event()),
    slow = applyAnswer(s, event({ activeThinkMs: 40000 }));
  assert.ok(fast.mastery < normal.mastery);
  assert.equal(fast.checkpoint, null);
  assert.ok(Date.parse(slow.nextReview!) < Date.parse(normal.nextReview!));
});
test('midnight alone does not count as spaced verification', () => {
  const e = event({ occurredAt: '2026-09-05T15:59:00Z' });
  const a = applyAnswer(initial('n', 's'), e);
  const b = applyAnswer(
    a,
    event({
      occurredAt: '2026-09-05T16:01:00Z',
      localDay: '2026-09-06',
      variant: 'b',
    }),
  );
  assert.equal(b.stage, 0);
});
test('1, 3, 7 day varied verification grows stability', () => {
  let s = applyAnswer(initial('n', 's'), event());
  let t = time;
  for (const [i, gap] of [1, 3, 7].entries()) {
    t += gap * DAY;
    s = applyAnswer(
      s,
      event({
        occurredAt: new Date(t).toISOString(),
        localDay: localDay(new Date(t)),
        variant: 'variant-' + i,
      }),
    );
    assert.equal(s.stage, i + 1);
  }
  assert.ok(s.stability >= 20);
});
test('false mastery drops immediately after surprise failure', () => {
  const s = { ...initial('n', 's'), mastery: 0.95, stage: 3, stability: 30 };
  const result = applyAnswer(s, event({ score: 0, outcome: 'wrong' }));
  assert.ok(result.mastery < 0.75);
  assert.equal(result.stage, 0);
  assert.ok(Date.parse(result.nextReview!) <= time + DAY);
});
test('replay is idempotent and order-independent', () => {
  const a = event(),
    b = event({
      occurredAt: new Date(time + 2 * DAY).toISOString(),
      localDay: '2026-09-07',
      variant: 'b',
    });
  assert.deepEqual(computeMastery([], [a, b, a]), computeMastery([], [b, a]));
});
test('new daily plan avoids repeated IDs, adjacent nodes and repeated skills', () => {
  const q = buildQueue(base, { now: time });
  assert.ok(q.length >= 7);
  assert.equal(new Set(q.map((x) => x.question.id)).size, q.length);
  for (let i = 1; i < q.length; i++)
    assert.notEqual(q[i].question.nodeId, q[i - 1].question.nodeId);
  for (let i = 0; i < q.length; i++)
    for (let j = Math.max(0, i - 3); j < i; j++)
      assert.notEqual(
        q[i].question.nodeId + '::' + q[i].question.skillId,
        q[j].question.nodeId + '::' + q[j].question.skillId,
      );
});
test('exam scope only raises targeted node priority', () => {
  const n = seedNodes.find((n) => n.subject === 'math')!,
    s = initial(n.id, n.skills[0].id);
  const plan = {
    id: 'exam',
    title: 'test',
    subject: n.subject,
    date: '2026-09-08',
    scope: [n.id],
    target: 85,
    dailyMinutes: 20,
  };
  const scoped = priority(n, s, [], [plan], time),
    other = priority(n, s, [], [{ ...plan, scope: ['another'] }], time);
  assert.ok(scoped > other);
});
test('pack is valid and content references are consistent', () => {
  const p = validatePack(corePack);
  assert.equal(new Set(p.knowledge.map((n) => n.subject)).size, 8);
  assert.equal(new Set(p.knowledge.map((n) => n.id)).size, p.knowledge.length);
  for (const q of p.questions) {
    const n = p.knowledge.find((n) => n.id === q.nodeId)!;
    assert.ok(n.skills.some((s) => s.id === q.skillId));
  }
  assert.throws(() => validatePack({ ...corePack, schemaVersion: 2 }));
  assert.throws(() =>
    validatePack({
      ...corePack,
      questions: [{ ...seedQuestions[0], nodeId: 'missing' }],
    }),
  );
});
test('pinyin smart import creates hanzi recall, not reverse memorization', () => {
  const v = smartParse('沮丧 jǔ sàng\n狼藉 láng jí\n蹒跚 pán shān');
  assert.equal(v.nodes.length, 3);
  assert.equal(v.questions[0].answer, '沮丧');
  assert.match(v.questions[0].prompt, /jǔ sàng/);
});
test('graph expression parser calculates correct precedence and rejects code', () => {
  assert.equal(evaluateExpression('2*x^2-4*x-6', 1), -8);
  assert.equal(evaluateExpression('-x^2', 2), -4);
  assert.equal(evaluateExpression('2^3^2', 0), 512);
  assert.equal(evaluateExpression('2^-2', 0), 0.25);
  assert.throws(() => evaluateExpression('globalThis.alert(1)', 0));
  assert.throws(() => evaluateExpression('2**1000', 0));
});
test('rubric dimensions update their own skills with normalized evidence', () => {
  const e = event({
    targets: [
      { skillId: 'thesis', score: 1, weight: 0.5 },
      { skillId: 'analysis', score: 0, weight: 0.5 },
    ],
  });
  const map = computeMastery([], [e]);
  assert.ok(map['n::thesis'].mastery > 0.35);
  assert.ok(map['n::analysis'].mastery < 0.35);
  assert.equal(map['n::s'], undefined);
});
test('local account namespaces and content updates preserve personal events', async () => {
  await switchAccount('account-a');
  await put('event', event({ id: 'personal-event' }));
  await switchAccount('account-b');
  assert.ok(!(await allRecords()).some((r) => r.id === 'personal-event'));
  await switchAccount('account-a');
  await installPack(corePack);
  assert.ok((await allRecords()).some((r) => r.id === 'personal-event'));
});
test('backup merge never overwrites an existing immutable event', async () => {
  await switchAccount('account-a');
  const original = (await allRecords()).find((r) => r.id === 'personal-event')!;
  await restoreBackup({
    schemaVersion: 1,
    records: [
      {
        ...original,
        updated_at: new Date(Date.now() + 1000).toISOString(),
        payload: { ...original.payload, score: 0 },
      },
    ],
  });
  assert.equal(
    (await allRecords()).find((r) => r.id === original.id)?.payload.score,
    original.payload.score,
  );
});
test('sync rejects account mismatch before uploading private data', async () => {
  await switchAccount('account-a');
  Object.defineProperty(navigator, 'onLine', {
    value: true,
    configurable: true,
  });
  const oldFetch = globalThis.fetch;
  let writes = 0;
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'POST') writes++;
    return Response.json({ user: { id: 'account-b' } });
  };
  try {
    await assert.rejects(syncCloud(), /账户已变化/);
    assert.equal(writes, 0);
    assert.ok((await pendingCount()) > 0);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
