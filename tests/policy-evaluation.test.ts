import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calibrationReport,
  evaluatePolicyHistory,
  evaluationInput,
  historicalPrefix,
  type EvaluationOptions,
} from '../lib/policy-evaluation';
import { fixture, attempt, schoolExam } from './study-plan-fixtures';
import {
  legacyStudyAgenda,
  legacyDailyStudyPlan,
  legacyComputeMastery,
} from '../scripts/baselines/study-policy-v1.mjs';

const DAY = 86400000;
const now = Date.parse('2026-10-17T12:00:00Z');
const iso = (time: number) => new Date(time).toISOString();
const baseline = {
  legacyAgenda: legacyStudyAgenda,
  legacyDailyPlan: legacyDailyStudyPlan,
  legacyComputeMastery,
} as unknown as Pick<
  EvaluationOptions,
  'legacyAgenda' | 'legacyDailyPlan' | 'legacyComputeMastery'
>;
const options = {
  ...baseline,
  now,
  everyEvents: 1,
  maxCheckpoints: 6,
  policyIds: ['learning-v2-balanced'],
};

void test('prefixes exclude future evidence, result entry, mutable jobs, and keep distinct course retries', () => {
  const d = fixture(),
    cutoff = now - 2 * DAY;
  const first = attempt(d, 0, cutoff - DAY, { attemptNumber: 1 });
  d.events = [
    first,
    { ...first, id: 'duplicate-import' },
    { ...first, id: 'retry', attemptNumber: 2 },
    attempt(d, 1, now),
  ];
  d.exams = [
    {
      ...schoolExam(d, now, -4),
      result: { score: 90, maxScore: 100, credits: 1, recordedAt: iso(now) },
    },
  ];
  d.tests = [
    {
      id: 'future-test',
      title: '',
      subject: 'math',
      sessionId: 'future',
      eventIds: [],
      scope: [],
      at: iso(now),
    },
  ];
  d.jobs = [
    { id: 'future', kind: 'session', at: iso(now) },
    {
      id: 'updated-later',
      kind: 'session',
      createdAt: iso(cutoff - DAY),
      updatedAt: iso(now),
      status: 'completed',
    },
    {
      id: 'nested-future',
      kind: 'course',
      createdAt: iso(cutoff - DAY),
      sections: [{ completedAt: iso(now), passed: true }],
    },
    { id: 'unknown-date', kind: 'session', status: 'completed' },
    { id: 'past', kind: 'session', at: iso(cutoff - DAY) },
  ];
  const original = structuredClone(d),
    prefix = historicalPrefix(d, cutoff);
  assert.deepEqual(
    prefix.events.map((e) => e.id),
    [first.id, 'retry'].sort(),
  );
  assert.equal(prefix.exams[0].result, undefined);
  assert.deepEqual(prefix.tests, []);
  assert.deepEqual(
    prefix.jobs!.map((j) => j.id),
    ['past'],
  );
  prefix.events[0].score = 0.123;
  prefix.questions[0].prompt = 'changed';
  assert.deepEqual(d, original);
});

void test('both policies see identical past prefixes; replay cannot mutate its input or expose future scores', () => {
  const d = fixture();
  d.events = [
    attempt(d, 0, now - 3 * DAY),
    attempt(d, 1, now - DAY),
    attempt(d, 2, now + DAY),
  ];
  d.exams = [
    {
      ...schoolExam(d, now, -5),
      result: {
        score: 75,
        maxScore: 100,
        credits: 1,
        recordedAt: iso(now + DAY),
      },
    },
  ];
  const original = structuredClone(d),
    seen: number[] = [];
  const report = evaluatePolicyHistory(d, {
    ...options,
    legacyAgenda(prefix, cutoff) {
      assert.ok(prefix.events.every((e) => Date.parse(e.occurredAt) <= cutoff));
      assert.equal(prefix.exams[0].result, undefined);
      seen.push(prefix.events.length);
      const result = baseline.legacyAgenda(prefix, cutoff);
      // Deliberately mutate the injected legacy policy's inputs.
      prefix.events.length = 0;
      prefix.nodes[0].title = 'legacy side effect';
      return result;
    },
    legacyComputeMastery(nodes, events) {
      assert.notEqual(nodes[0].title, 'legacy side effect');
      return baseline.legacyComputeMastery(nodes, events);
    },
  });
  assert.equal(report.eventCount, 2);
  assert.deepEqual(
    seen,
    report.variants[0].checkpoints.map((c) => c.prefixEvents),
  );
  assert.equal(report.observedExamOutcomes.gpa, null);
  assert.equal(report.observedExamOutcomes.rows.length, 0);
  assert.ok(report.variants[0].checkpoints[0].dailyInitial.current);
  assert.ok(report.variants[0].checkpoints[0].dailyInitial.legacy);
  assert.ok(
    report.variants[0].checkpoints.every(
      (c) =>
        c.estimatedLearningBenefit === null &&
        c.counterfactualExamBenefit === null,
    ),
  );
  assert.deepEqual(d, original);
});

void test('future independent retention excludes hints, same questions, duplicates, and brief clicks', () => {
  const d = fixture(),
    start = now - 5 * DAY;
  d.events = [
    attempt(d, 0, start),
    attempt(d, 1, start + 2 * DAY, { id: 'independent', score: 0.7 }),
    attempt(d, 0, start + 2 * DAY, { id: 'same-question' }),
    attempt(d, 2, start + 2 * DAY, { id: 'hinted', usedHint: true }),
    attempt(d, 3, start + 2 * DAY, { id: 'click', activeThinkMs: 100 }),
    attempt(d, 4, start + 2 * DAY, {
      id: 'guessed',
      predictedConfidence: 'guess',
    }),
  ];
  d.events.push({ ...d.events[1], id: 'duplicate' });
  const report = evaluatePolicyHistory(d, {
    ...options,
    legacyAgenda: () => ({
      primary: {
        id: 'practice',
        kind: 'practice',
        subject: 'math',
        scope: [d.nodes[0].id],
      },
    }),
  });
  const checkpoint = report.variants[0].checkpoints.find(
    (c) => Date.parse(c.at) === start,
  )!;
  assert.equal(checkpoint.legacyObservedLaterRetention.count, 1);
  assert.equal(checkpoint.legacyObservedLaterRetention.meanObservedScore, 0.7);
  // Either duplicate ID may survive the deterministic input deduplication; only one observation is counted.
  assert.equal(checkpoint.legacyObservedLaterRetention.eventIds.length, 1);
});

void test('completion calibration deduplicates linked sessions and right censors unfinished recent sessions', () => {
  const d = fixture();
  const add = (suffix: string, started: number, completed?: number) => {
    const traceId = 'trace-' + suffix,
      sessionId = 'session-' + suffix;
    d.jobs!.push(
      {
        id: traceId,
        kind: 'study-recommendation',
        policyId: 'learning-v2-balanced',
        at: iso(started - 1000),
        candidates: [{ id: 'practice', completionProbability: 0.8 }],
      },
      {
        id: 'start-' + suffix,
        kind: 'study-recommendation-outcome',
        traceId,
        actionId: 'practice',
        policyId: 'learning-v2-balanced',
        choice: 'started',
        sessionId,
        at: iso(started),
      },
    );
    if (completed !== undefined)
      d.jobs!.push({
        id: 'done-' + suffix,
        kind: 'study-completion',
        sessionId,
        completedAt: iso(completed),
      });
  };
  add('finished', now - DAY, now - DAY + 5000);
  add('mature', now - 10 * DAY);
  add('recent', now - DAY);
  add('future-done', now - DAY, now + DAY);
  add('late-done', now - 10 * DAY, now - DAY);
  d.jobs!.push(
    { ...d.jobs![1], id: 'duplicate-start' },
    structuredClone(d.jobs![0]),
  );
  d.jobs!.push({
    id: 'unlinked',
    kind: 'study-recommendation-outcome',
    traceId: 'missing',
    actionId: 'practice',
    policyId: 'learning-v2-balanced',
    choice: 'started',
    sessionId: 'unlinked',
    at: iso(now - DAY),
  });
  const c = calibrationReport(d, now).policies[0];
  assert.equal(c.recommendations, 5);
  assert.equal(c.started, 5);
  assert.equal(c.completedWithinWindow, 1);
  assert.equal(c.completionEvaluated, 3);
  assert.equal(c.rightCensored, 2);
  assert.ok(
    Math.abs(c.completionBrierScore! - (0.04 + 0.64 + 0.64) / 3) < 1e-12,
  );
  assert.equal(calibrationReport(d, now).autoUpdate, false);
});

void test('only actual valid exam results enter GPA; duplicate exams do not create grades', () => {
  const d = fixture(),
    e = {
      ...schoolExam(d, now, -3),
      result: {
        score: 80,
        maxScore: 100,
        credits: 2,
        recordedAt: iso(now - DAY),
      },
    };
  d.exams = [
    e,
    structuredClone(e),
    {
      ...e,
      id: 'future-score',
      result: { ...e.result, recordedAt: iso(now + DAY) },
    },
  ];
  const report = evaluatePolicyHistory(d, options);
  assert.equal(report.observedExamOutcomes.gpa, 3.2);
  assert.equal(report.observedExamOutcomes.rows.length, 1);
  assert.equal(
    report.variants[0].checkpoints[0].counterfactualExamBenefit,
    null,
  );
});

void test('backup input projects quality exclusions, honors deleted latest records, and rejects mixed accounts', () => {
  const d = fixture(),
    event = attempt(d, 0, now - DAY);
  const record = (
    kind: string,
    payload: object,
    updated_at = iso(now - DAY),
  ) => ({
    id: 'id' in payload ? payload.id : 'settings',
    kind,
    payload,
    updated_at,
    namespace: 'one',
  });
  const records = [
    ...d.nodes.map((n) => record('node', n)),
    ...d.questions.map((q) => record('question', q)),
    record('event', event),
    record('setting', d.settings),
    record('job', {
      id: 'review',
      kind: 'question-review',
      action: 'pause',
      questionId: event.questionId,
      at: iso(now),
      excludedEventIds: [],
      reason: 'bad item',
    }),
    record('note', { id: 'gone', nodeId: d.nodes[0].id, body: 'deleted' }),
    { ...record('note', { id: 'gone' }, iso(now)), deleted: true },
  ];
  const input = { schemaVersion: 1, records },
    before = structuredClone(input);
  const data = evaluationInput(input);
  assert.equal(data.events[0].voidedBy?.id, 'review');
  assert.equal(data.questions[0].reviewStatus, 'paused');
  assert.equal(data.notes.length, 0);
  assert.deepEqual(input, before);
  assert.throws(
    () =>
      evaluationInput({
        ...input,
        records: [...records, { ...records[0], namespace: 'two' }],
      }),
    /multiple namespaces/,
  );
  assert.throws(
    () => evaluationInput({ schemaVersion: 2, records }),
    /schemaVersion/,
  );
  assert.throws(
    () =>
      evaluatePolicyHistory(fixture(), { ...options, policyIds: ['unknown'] }),
    /known study policy/,
  );
});
