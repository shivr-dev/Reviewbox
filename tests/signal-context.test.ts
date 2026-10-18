import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, attempt } from './study-plan-fixtures';
import {
  createSignalContext,
  metadataQuality,
  assessmentInformation,
  examImpact,
  fatigueState,
  completionEstimate,
  verifiedHypothesis,
} from '../lib/learning-signals';
import { policyFor } from '../lib/policy-config';

test('one decision-local signal context reuses observation indexes with identical signal results', () => {
  const now = new Date('2026-10-17T04:00:00Z').getTime(),
    data = fixture();
  data.events = Array.from({ length: 12 }, (_, i) =>
    attempt(data, i % 3, now - (i + 1) * 86400000, {
      score: i % 2,
      outcome: i % 2 ? 'correct' : 'wrong',
    }),
  );
  const policy = policyFor(data),
    context = createSignalContext(data, now, policy);
  const observations = context.observations,
    independent = context.independent,
    questionRows = context.byQuestion.get(data.questions[0].id);
  for (const q of data.questions)
    assert.deepEqual(
      metadataQuality(data, q, now, policy, context),
      metadataQuality(data, q, now, policy),
    );
  assert.deepEqual(
    assessmentInformation(data, 'all', now, policy, context),
    assessmentInformation(data, 'all', now, policy),
  );
  assert.deepEqual(
    examImpact(data, 'math', data.nodes[0].id, now, policy, context),
    examImpact(data, 'math', data.nodes[0].id, now, policy),
  );
  assert.deepEqual(
    fatigueState(data, now, policy, context),
    fatigueState(data, now, policy),
  );
  assert.deepEqual(
    completionEstimate(data, 'practice', 5, now, policy, context),
    completionEstimate(data, 'practice', 5, now, policy),
  );
  assert.deepEqual(
    verifiedHypothesis(data, { type: 'concept' }, now, policy, context),
    verifiedHypothesis(data, { type: 'concept' }, now, policy),
  );
  assert.equal(context.observations, observations);
  assert.equal(context.independent, independent);
  assert.equal(context.byQuestion.get(data.questions[0].id), questionRows);
});

test('fresh signal context observes new evidence and changed data/time never use an older decision snapshot', () => {
  const now = new Date('2026-10-17T04:00:00Z').getTime(),
    data = fixture(),
    policy = policyFor(data);
  const old = createSignalContext(data, now, policy);
  data.events.push(attempt(data, 0, now - 1000));
  const current = createSignalContext(data, now, policy);
  assert.equal(old.observations.length, 0);
  assert.equal(current.observations.length, 1);
  assert.equal(
    metadataQuality(data, data.questions[0], now, policy, current).samples,
    1,
  );
  assert.equal(
    metadataQuality({ ...data }, data.questions[0], now, policy, old).samples,
    1,
  );
  assert.equal(
    metadataQuality(data, data.questions[0], now + 1, policy, old).samples,
    1,
  );
  assert.equal(
    metadataQuality(
      data,
      data.questions[0],
      now,
      { ...policy, id: 'test-policy' },
      old,
    ).samples,
    1,
  );
});
