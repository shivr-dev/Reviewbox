import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, attempt } from './study-plan-fixtures';
import {
  applyAnswer,
  initial,
  computeMastery,
  buildQueue,
} from '../lib/engine';
import { DEFAULT_POLICY } from '../lib/policy-config';
import {
  answerEvidenceWeight,
  hintEvidenceWeight,
  effectiveAnswerTime,
  errorCauseEstimate,
  masteryStatus,
  adaptiveRecallInterval,
  dependencyLinks,
  aggregateMasteryStatus,
} from '../lib/learning-evidence';
import { createLearningTimer } from '../lib/learning-timer';

const now = Date.parse('2026-10-17T08:00:00Z'),
  DAY = 86400000;
test('stability is bounded on a single loss and on delayed success; replay preserves history', () => {
  const d = fixture(),
    base = {
      ...initial(d.nodes[0].id, 's'),
      mastery: 0.85,
      stability: 30,
      stage: 2,
      evidenceDays: ['2026-10-14', '2026-10-15', '2026-10-16'],
      successDays: ['2026-10-14', '2026-10-15', '2026-10-16'],
    };
  const loss = attempt(d, 0, now, { score: 0, outcome: 'wrong' }),
    result = applyAnswer(base, loss);
  assert.ok(
    result.stability >=
      base.stability * DEFAULT_POLICY.evidence.stabilityDownLimit,
  );
  assert.ok(result.mastery > base.mastery - 0.11);
  assert.equal(result.stage, base.stage);
  const success = applyAnswer(base, attempt(d, 1, now));
  assert.ok(
    success.stability <=
      base.stability * DEFAULT_POLICY.evidence.stabilityUpLimit,
  );
  const es = [loss, attempt(d, 1, now + DAY)];
  assert.deepEqual(
    computeMastery(d.nodes, es),
    computeMastery(d.nodes, [es[1], loss, loss]),
  );
});
test('hint levels contribute progressively, and only unassisted retrieval advances checkpoints', () => {
  const d = fixture(),
    e = attempt(d, 0, now),
    state = initial(e.nodeId, e.skillId);
  const weights = (['light', 'method', 'step', 'answer'] as const).map(
    (hintLevel) => hintEvidenceWeight({ ...e, usedHint: true, hintLevel }),
  );
  assert.ok(weights.every((v, i) => i === 0 || v < weights[i - 1]));
  const light = applyAnswer(state, {
      ...e,
      usedHint: true,
      hintLevel: 'light',
    }),
    answer = applyAnswer(state, { ...e, usedHint: true, hintLevel: 'answer' }),
    independent = applyAnswer(state, e);
  assert.ok(light.mastery > answer.mastery);
  assert.ok(independent.mastery > light.mastery);
  assert.equal(light.checkpoint, null);
  assert.ok(independent.checkpoint);
});
test('active timing is weak once-only evidence; slow work is not less competent', () => {
  const d = fixture(),
    e = attempt(d, 0, now),
    state = initial(e.nodeId, e.skillId);
  const regular = applyAnswer(state, e),
    slow = applyAnswer(state, { ...e, activeThinkMs: 300000 }),
    fast = applyAnswer(state, { ...e, activeThinkMs: 100 });
  assert.equal(regular.mastery, slow.mastery);
  assert.ok(fast.mastery < regular.mastery);
  assert.ok(
    fast.mastery - state.mastery >=
      (regular.mastery - state.mastery) * DEFAULT_POLICY.evidence.timingFloor -
        0.00001,
  );
  assert.equal(
    effectiveAnswerTime({ ...e, wallTimeMs: 60000, idleMs: 55000 }),
    5000,
  );
  assert.ok(
    answerEvidenceWeight({ ...e, activeThinkMs: 100 }) >=
      answerEvidenceWeight(e) * 0.8,
  );
});
test('idle tracking excludes background and idle dwell, and never counts time twice', () => {
  const t = createLearningTimer(0, 30000);
  t.activity(10000);
  t.visibility(false, 20000);
  t.visibility(true, 90000);
  assert.deepEqual(t.snapshot(100000), {
    activeThinkMs: 30000,
    wallTimeMs: 100000,
    idleMs: 70000,
  });
  assert.deepEqual(t.snapshot(100000), t.snapshot(100000));
  const t2 = createLearningTimer(0);
  assert.deepEqual(t2.snapshot(120000), {
    activeThinkMs: 30000,
    wallTimeMs: 120000,
    idleMs: 90000,
  });
});
test('a single error stays ambiguous, explicit causes need corroborating evidence IDs', () => {
  const d = fixture(),
    e = attempt(d, 0, now, { score: 0, outcome: 'wrong' }),
    cause = errorCauseEstimate(e);
  assert.equal(cause.confirmed, false);
  assert.equal(errorCauseEstimate({...e,errorCause:{concept:1,calculation:0,reading:0,careless:0,unknown:0,confirmed:true,evidenceIds:['invented-1','invented-2']}}).confirmed,false);
  assert.ok(cause.unknown >= cause.concept);
  const explicit = errorCauseEstimate({
    ...e,
    errorCause: {
      concept: 1,
      calculation: 0,
      reading: 0,
      careless: 0,
      unknown: 0,
      confirmed: true,
      evidenceIds: [e.id],
    },
  });
  assert.equal(explicit.confirmed, false);
  assert.equal(explicit.concept, 1);
});
test('adaptive memory spacing uses family and personal evidence after cold start', () => {
  const d = fixture(),
    e = attempt(d, 0, now),
    s = {
      ...initial(e.nodeId, e.skillId),
      stability: 20,
      evidenceDays: ['1', '2', '3', '4'],
      successDays: ['1', '2', '3'],
    };
  const formula = adaptiveRecallInterval(s, {
    ...e,
    learningEvidence: {
      version: 1,
      assessment: 'objective',
      memoryFamily: 'formula',
    },
  });
  const vocabulary = adaptiveRecallInterval(s, {
    ...e,
    learningEvidence: {
      version: 1,
      assessment: 'objective',
      memoryFamily: 'vocabulary',
    },
  });
  assert.ok(vocabulary > formula);
  assert.ok(formula > 7);
  assert.equal(adaptiveRecallInterval({ ...s, evidenceDays: [] }, e), 1);
});
test('one new skill supports an acquisition block while retained skills limit repeats', () => {
  const d = fixture();
  d.nodes = d.nodes.slice(0, 1);
  d.questions = d.questions.filter((q) => q.nodeId === d.nodes[0].id);
  const fresh = buildQueue(d, { practice: true, now, limit: 10 });
  assert.ok(fresh.length >= 4 && fresh.length <= 8);
  d.events = [0, 1, 2, 3, 4, 5].map((i) =>
    attempt(d, i, now - (30 - i * 5) * DAY),
  );
  const retained = buildQueue(d, { practice: true, now, limit: 10 });
  assert.ok(retained.length <= DEFAULT_POLICY.evidence.retentionLimit);
});
test('latent mastery labels never imply a calibrated exact probability and dependency weights preserve legacy imports', () => {
  const d = fixture(),
    s = initial('n', 's');
  assert.equal(masteryStatus(s), '未知');
  assert.equal(masteryStatus({ ...s, attemptCount: 1 }), '学习中');
  assert.equal(
    masteryStatus({
      ...s,
      attemptCount: 20,
      stage: 3,
      successDays: ['1', '2', '3', '4'],
    }),
    '已验证',
  );
  const links = dependencyLinks({
    ...d.nodes[0],
    prerequisites: ['old', 'weak'],
    dependencies: [{ nodeId: 'weak', kind: 'helpful', weight: 0.4 }],
  });
  assert.equal(links.find((x) => x.nodeId === 'old')?.weight, 0.8);
  assert.equal(links.find((x) => x.nodeId === 'weak')?.weight, 0.4);
  const verified = {
    ...s,
    attemptCount: 20,
    stage: 3,
    successDays: ['1', '2', '3', '4'],
  };
  assert.equal(aggregateMasteryStatus([verified]), '已验证');
  assert.equal(aggregateMasteryStatus([verified, undefined]), '学习中');
  assert.equal(aggregateMasteryStatus([undefined]), '未知');
});
