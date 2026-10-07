import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {
  cognitiveDiagnosis,
  guessingSignals,
  memoryFingerprint,
  policyEvolution,
  policyAssignment,
  flowDifficulty,
  transferCandidates,
  transferTarget,
  verificationCandidate,
  pressureQuestions,
  pressureReport,
  cleanEvents,
} from '../lib/learning-intelligence';
import {
  applyAnswer,
  buildQueue,
  computeMastery,
  initial,
} from '../lib/engine';
import {
  type AnswerEvent,
  type Node,
  type Question,
  type StudyData,
  localDay,
} from '../lib/model';
import { validatePack } from '../lib/importer';
import { put, switchAccount, loadData } from '../lib/store';
import { IMPORT_SKILL, parseImportText } from '../lib/import-skill';
const DAY = 86400000,
  now = Date.parse('2026-10-06T04:00:00Z');
const node: Node = {
  id: 'n',
  subject: 'math',
  course: '数学',
  unit: '代数',
  chapter: '比例',
  title: '比例关系',
  description: '比例运算',
  prerequisites: [],
  relatedNodes: [],
  importance: 0.8,
  examWeight: 0.8,
  skills: [{ id: 's', title: '应用计算', difficulty: 2 }],
  source: '手动测试',
  version: '1',
};
function question(id = 'q', attrs = ['calculation']): Question {
  return {
    schemaVersion: 1,
    id,
    nodeId: 'n',
    skillId: 's',
    subject: 'math',
    type: 'choice',
    prompt: id + ': 2×3 = ?',
    answer: '6',
    explanation: '2×3=6',
    difficulty: 2,
    expectedSeconds: 40,
    variant: id,
    options: ['3', '5', '6', '8'],
    source: '手动测试',
    tags: [],
    verified: true,
    version: '1',
    cognitiveAttributes: attrs,
    conceptIds: ['proportion'],
    contextId: 'math:' + id,
    memoryFamily: 'formula',
  };
}
function event(
  q: Question,
  id: string,
  day = 0,
  score = 1,
  extra: Partial<AnswerEvent> = {},
): AnswerEvent {
  const at = new Date(now + (day - 30) * DAY).toISOString();
  return {
    id,
    questionId: q.id,
    nodeId: q.nodeId,
    skillId: q.skillId,
    subject: q.subject,
    outcome: score >= 0.85 ? 'correct' : score >= 0.4 ? 'unsure' : 'wrong',
    score,
    source: 'test',
    answer: score ? '6' : '3',
    occurredAt: at,
    displayedAt: at,
    revealedAt: at,
    activeThinkMs: 20000,
    expectedSeconds: 40,
    difficulty: q.difficulty,
    variant: q.variant,
    usedHint: false,
    reason: '手动测试',
    sessionId: 'session',
    localDay: localDay(new Date(at)),
    version: 1,
    learningEvidence: { version: 1, assessment: 'objective' },
    ...extra,
  };
}
function data(
  qs: Question[] = [question()],
  es: AnswerEvent[] = [],
): StudyData {
  return {
    nodes: [node],
    questions: qs,
    events: es,
    exams: [],
    notes: [],
    materials: [],
    tests: [],
    packs: [],
    settings: { name: 'test', dailyMinutes: 20, surprise: false },
  };
}

test('cognitive model separates symbolic errors from successful calculation and abstains on confounded attributes', () => {
  const qs = [
    question('symbol1', ['symbolic']),
    question('symbol2', ['symbolic']),
    question('symbol3', ['symbolic']),
    question('calc1'),
    question('calc2'),
    question('calc3'),
    question('both', ['symbolic', 'calculation']),
  ];
  const es = Array.from({ length: 4 }, (_, d) =>
    qs.map((q, i) =>
      event(
        q,
        d + ':' + i,
        d,
        q.cognitiveAttributes!.includes('symbolic') ? 0 : 1,
      ),
    ),
  ).flat();
  const result = cognitiveDiagnosis(data(qs, es), undefined, now);
  const sym = result.find((x) => x.attribute === 'symbolic')!,
    calc = result.find((x) => x.attribute === 'calculation')!;
  assert.ok(sym.identifiable && sym.deficit > 0.85);
  assert.ok(calc.deficit < 0.25);
  assert.ok(sym.errorShare > 0.8);
  const only = [
    question('a', ['symbolic', 'calculation']),
    question('b', ['symbolic', 'calculation']),
    question('c', ['symbolic', 'calculation']),
  ];
  const ambiguous = cognitiveDiagnosis(
    data(
      only,
      only.flatMap((q, i) =>
        Array.from({ length: 4 }, (_, d) => event(q, i + ':' + d, d, 0)),
      ),
    ),
    undefined,
    now,
  );
  assert.ok(ambiguous.every((x) => !x.identifiable));
  assert.ok(
    cognitiveDiagnosis(data(qs, [es[0]]), undefined, now).every(
      (x) => !x.identifiable,
    ),
  );
  assert.deepEqual(
    cognitiveDiagnosis(data(qs, [...es, ...es]), undefined, now),
    result,
  );
});
test('guessing requires objective evidence, fast time and low confidence; it cannot advance a spacing checkpoint', () => {
  const q = question(),
    e = event(q, 'suspect', 4, 1, {
      predictedConfidence: 'guess',
      activeThinkMs: 900,
    });
  assert.equal(guessingSignals(q, e, []).length, 3);
  assert.equal(
    guessingSignals(q, { ...e, predictedConfidence: 'sure' }, []).length,
    0,
  );
  assert.equal(guessingSignals({ ...q, type: 'pinyin' }, e, []).length, 0);
  assert.equal(
    guessingSignals(q, { ...e, activeThinkMs: 24000 }, []).length,
    0,
  );
  const tagged = {
    ...e,
    evidenceWeight: 0.3,
    learningEvidence: {
      version: 1 as const,
      assessment: 'objective' as const,
      suspect: true,
    },
  };
  const base = applyAnswer(initial('n', 's'), event(q, 'base', 0));
  const updated = applyAnswer(base, tagged);
  assert.equal(updated.stage, 0);
  assert.equal(updated.checkpoint, base.checkpoint);
  const normal = applyAnswer(base, {
    ...e,
    activeThinkMs: 25000,
    predictedConfidence: 'sure',
  });
  assert.ok(updated.mastery < normal.mastery);
  const replay = computeMastery([node], [tagged, tagged]);
  assert.equal(replay['n::s'].attemptCount, 1);
});
test('one verified different variant is queued and consumed once, with no recursive cross-check', () => {
  const q = question(),
    v = question('variant'),
    e = event(q, 'suspect', 29, 1, {
      learningEvidence: { version: 1, assessment: 'objective', suspect: true },
    });
  const d = data([q, v], [e]);
  assert.equal(verificationCandidate(d, e)?.id, v.id);
  const queue = buildQueue(d, { now, practice: true });
  assert.equal(queue.filter((x) => x.verificationOf === e.id).length, 1);
  assert.equal(
    verificationCandidate(
      {
        ...d,
        events: [
          e,
          event(v, 'check', 30, 1, {
            learningEvidence: {
              version: 1,
              assessment: 'objective',
              verificationOf: e.id,
            },
          }),
        ],
      },
      e,
    ),
    undefined,
  );
  assert.equal(
    verificationCandidate(
      { ...d, questions: [q, { ...v, verified: false }] },
      e,
    ),
    undefined,
  );
  assert.equal(
    guessingSignals(
      v,
      event(v, 'check', 30, 1, {
        activeThinkMs: 500,
        predictedConfidence: 'guess',
        learningEvidence: {
          version: 1,
          assessment: 'objective',
          verificationOf: e.id,
        },
      }),
      [],
    ).length,
    0,
  );
});
test('memory fingerprint learns only spaced comparable recall, sparse samples stay at default and content families diverge', () => {
  const qs: Question[] = [],
    es: AnswerEvent[] = [];
  for (const family of ['formula', 'vocabulary'] as const)
    for (let i = 0; i < 8; i++) {
      const q = {
        ...question(family + i),
        nodeId: family + i,
        memoryFamily: family,
      };
      qs.push(q);
      const gap = [1, 3, 7, 14][i % 4];
      es.push(
        event(q, family + i + 'a', i, 1),
        event(q, family + i + 'b', i + gap, family === 'formula' ? 0 : 1),
      );
    }
  const fs = memoryFingerprint(data(qs, es), now),
    formula = fs.find((f) => f.family === 'formula')!,
    words = fs.find((f) => f.family === 'vocabulary')!;
  assert.ok(formula.ready && words.ready);
  assert.ok(formula.factor < words.factor);
  assert.deepEqual(memoryFingerprint(data(qs, [...es, ...es]), now), fs);
  assert.equal(
    memoryFingerprint(
      data(
        [question()],
        [event(question(), 'a'), event(question(), 'b', 0.01)],
      ),
      now,
    )[0].trials,
    0,
  );
  assert.equal(memoryFingerprint(data(qs, [es[0], es[1]]), now)[0].factor, 1);
  assert.equal(
    memoryFingerprint(
      data(
        qs,
        es.map((e) => ({ ...e, usedHint: true })),
      ),
      now,
    )[0].trials,
    0,
  );
});
test('policy trials use preceding assigned strategy, stay conservative with few data, and can select a clearly superior arm', () => {
  const qs: Question[] = [],
    es: AnswerEvent[] = [];
  for (const policy of ['cautious', 'balanced', 'expansive'] as const)
    for (let i = 0; i < 100; i++) {
      const q = { ...question(policy + i), nodeId: policy + i };
      qs.push(q);
      es.push(
        event(q, policy + i + 'a', i % 10, 1, {
          learningEvidence: { version: 1, assessment: 'objective', policy },
        }),
      );
      es.push(
        event(q, policy + i + 'b', (i % 10) + 3, policy === 'balanced' ? 1 : 0),
      );
    }
  const d = data(qs, es);
  assert.equal(policyEvolution(d, now).winner, 'balanced');
  assert.equal(
    policyEvolution(data(qs, es.slice(0, 10)), now).winner,
    undefined,
  );
  assert.equal(
    policyEvolution(
      data(
        qs,
        es.map((e) => ({ ...e, learningEvidence: undefined })),
      ),
      now,
    ).trials,
    0,
  );
  assert.equal(
    policyAssignment('node', 'skill'),
    policyAssignment('node', 'skill'),
  );
});
test('flow moves challenge according to history and has monotone calibrated difficulty estimates', () => {
  const q = { ...question(), difficulty: 4 };
  const success = flowDifficulty(
    data(
      [q],
      Array.from({ length: 24 }, (_, i) => event(q, 'right' + i, i, 1)),
    ),
    'n',
    's',
    0.7,
    now,
  );
  const failure = flowDifficulty(
    data(
      [q],
      Array.from({ length: 24 }, (_, i) => event(q, 'wrong' + i, i, 0)),
    ),
    'n',
    's',
    0.7,
    now,
  );
  assert.ok(success.difficulty > failure.difficulty);
  assert.ok(
    success.levels.every(
      (l, i, ls) => i === 0 || l.probability <= ls[i - 1].probability,
    ),
  );
});
test('cross-subject transfer requires a shared concept and different context, excludes exam-only and stale questions', () => {
  const source = question(),
    target = {
      ...question('physics'),
      nodeId: 'physics',
      subject: 'physics' as const,
      contextId: 'physics:density',
    };
  const physics = {
    ...node,
    id: 'physics',
    subject: 'physics' as const,
    title: '密度与比例',
  };
  const d = {
    ...data([source, target], [event(source, 'done', 27)]),
    nodes: [node, physics],
  };
  assert.equal(transferCandidates(d, 'physics', now)[0]?.target.id, target.id);
  assert.equal(transferTarget(d, source)?.node.id, physics.id);
  assert.equal(
    transferCandidates(
      { ...d, questions: [source, { ...target, conceptIds: ['unrelated'] }] },
      undefined,
      now,
    ).length,
    0,
  );
  assert.equal(
    transferCandidates(
      { ...d, questions: [source, { ...target, tags: ['exam-only'] }] },
      undefined,
      now,
    ).length,
    0,
  );
  assert.equal(
    transferCandidates(
      {
        ...d,
        questions: [
          source,
          { ...target, expiresAt: new Date(now - DAY).toISOString() },
        ],
      },
      undefined,
      now,
    ).length,
    0,
  );
});
test('pressure diagnosis compares prior other-item baselines, never attributes a single ungrounded error', () => {
  const qs = Array.from({ length: 4 }, (_, i) => question('p' + i));
  const es = [
    event(qs[0], 'a', 22),
    event(qs[1], 'b', 25),
    event(qs[0], 'c', 27),
  ];
  const tested = [
    event(qs[2], 'p', 30, 0, {
      learningEvidence: { version: 1, assessment: 'objective', pressure: true },
    }),
  ];
  assert.equal(pressureReport(data(qs, es), tested)[0].status, '压力敏感信号');
  assert.equal(pressureReport(data(qs, [es[0]]), tested)[0].status, '证据不足');
  assert.equal(
    pressureReport(
      data(
        qs,
        es.map((e) => ({ ...e, score: 0 })),
      ),
      tested,
    )[0].status,
    '基础能力优先',
  );
  const pool = pressureQuestions(
    data([
      ...qs,
      { ...question('pinyin'), type: 'pinyin' },
      { ...question('exam'), tags: ['exam-only'] },
    ]),
    {},
    undefined,
    [],
    now,
  );
  assert.ok(
    pool.every((q) => q.type !== 'pinyin' && !q.tags.includes('exam-only')),
  );
  assert.equal(pool.length, 2);
});
test('manual import preserves optional diagnostic metadata, old schema is compatible, and Skill documents all new fields', () => {
  const pack = {
    schemaVersion: 1,
    manifest: {
      id: 'diagnostic',
      title: '诊断包',
      version: '1',
      subject: 'math',
    },
    knowledge: [node],
    questions: [question()],
  };
  const parsed = validatePack(pack);
  assert.deepEqual(parsed.questions[0].cognitiveAttributes, ['calculation']);
  assert.equal(parsed.questions[0].verified, false);
  assert.equal(parseImportText(JSON.stringify(pack)).questions.length, 1);
  const old = {
    ...question(),
    cognitiveAttributes: undefined,
    conceptIds: undefined,
    contextId: undefined,
    memoryFamily: undefined,
  };
  assert.doesNotThrow(() => validatePack({ ...pack, questions: [old] }));
  assert.match(IMPORT_SKILL, /Q-matrix/);
  assert.match(IMPORT_SKILL, /physics:density-lab/);
});
test('new evidence and pressure recovery remain local-first, immutable and isolated across accounts', async () => {
  await switchAccount('intelligence-A');
  const q = question(),
    e = event(q, 'private-evidence', 0, 1, {
      learningEvidence: {
        version: 1,
        assessment: 'objective',
        suspect: true,
        policy: 'cautious',
        verificationOf: 'source',
      },
    });
  await put('event', e, e.id);
  await put('event', { ...e, score: 0 }, e.id);
  await put(
    'job',
    {
      id: 'run',
      kind: 'pressure',
      status: 'active',
      subject: 'math',
      deadline: now,
      answers: { q: '6' },
    },
    'pressure:active:math',
  );
  const a = await loadData();
  assert.equal(a.events.find((x) => x.id === e.id)?.score, 1);
  assert.ok(a.jobs?.some((j) => j.kind === 'pressure'));
  await switchAccount('intelligence-B');
  const b = await loadData();
  assert.ok(!b.events.some((x) => x.id === e.id));
  assert.ok(!b.jobs?.some((j) => j.kind === 'pressure'));
  await switchAccount('intelligence-A');
  assert.equal(
    (await loadData()).events.find((x) => x.id === e.id)?.learningEvidence
      ?.policy,
    'cautious',
  );
});
test('invalid/future events cannot contaminate the personal models', () => {
  const q = question(),
    ok = event(q, 'ok'),
    future = event(q, 'future', 40);
  assert.deepEqual(
    cleanEvents([ok, future, { ...ok, id: 'bad', score: NaN }], now),
    [ok],
  );
});
