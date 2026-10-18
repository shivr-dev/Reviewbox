import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, attempt, schoolExam } from './study-plan-fixtures';
import {
  assessmentInformation,
  completionEstimate,
  examImpact,
  fatigueState,
  metadataQuality,
  signalObservations,
  verifiedHypothesis,
} from '../lib/learning-signals';
import { DEFAULT_POLICY } from '../lib/policy-config';
const DAY = 86400000,
  now = new Date(2026, 9, 17, 12).getTime();

test('learning signals stay unknown without evidence and exclude contested, duplicate and future evidence', () => {
  const d = fixture();
  assert.equal(fatigueState(d, now).known, false);
  assert.equal(assessmentInformation(d, 'math', now).test, 0);
  assert.equal(assessmentInformation(d, 'math', now).pressure, 0);
  assert.equal(completionEstimate(d, 'practice', 8, now).known, false);
  const e = attempt(d, 0, now - 1000);
  d.events = [
    e,
    { ...e, id: 'duplicate' },
    attempt(d, 1, now + 1000),
    attempt(d, 2, now - 2000, {
      voidedBy: { id: 'dispute', reason: 'answer conflict' },
    }),
    attempt(d, 3, now - 3000, { score: NaN }),
  ];
  assert.equal(signalObservations(d, now).length, 1);
  assert.equal(assessmentInformation(d, 'math', now).known, false);
});

test('test information varies continuously across seven and eight observations and diminishes with sufficient evidence', () => {
  const d = fixture();
  d.events = Array.from({ length: 7 }, (_, i) =>
    attempt(d, i, now - (i + 1) * 60000),
  );
  const seven = assessmentInformation(d, 'math', now);
  d.events.push(attempt(d, 7, now - 1000));
  const eight = assessmentInformation(d, 'math', now);
  assert.ok(seven.test > 0);
  assert.ok(eight.test > 0);
  assert.ok(Math.abs(eight.test - seven.test) < 0.1);
  d.events = Array.from({ length: 48 }, (_, i) =>
    attempt(d, i % 24, now - (i + 1) * 60000),
  );
  const sufficient = assessmentInformation(d, 'math', now);
  assert.equal(sufficient.sufficientEvidence, true);
  assert.equal(sufficient.test, 0);
  d.events.forEach((e) => {
    e.usedHint = true;
  });
  assert.equal(assessmentInformation(d, 'math', now).known, false);
});

test('pressure information requires independent cross-day baseline and learns from matched timed evidence', () => {
  const d = fixture();
  d.events = Array.from({ length: 8 }, (_, i) =>
    attempt(d, i, now - (i + 1) * 60000),
  );
  assert.equal(assessmentInformation(d, 'math', now).pressure, 0);
  d.events.push(attempt(d, 0, now - 2 * DAY));
  const unknown = assessmentInformation(d, 'math', now);
  assert.ok(unknown.pressure > 0);
  assert.equal(unknown.pressureSamples, 0);
  d.events.push(
    ...Array.from({ length: 16 }, (_, i) =>
      attempt(d, i % 8, now - (i + 1) * 1000, {
        source: 'test',
        learningEvidence: {
          version: 1,
          assessment: 'objective',
          pressure: true,
        },
      }),
    ),
  );
  const demonstrated = assessmentInformation(d, 'math', now);
  assert.ok(demonstrated.pressure < unknown.pressure);
  assert.equal(demonstrated.pressureSamples, 16);
});

test('slow thinking alone never implies fatigue and idle time does not inflate effective learning', () => {
  const d = fixture();
  d.events = Array.from({ length: 12 }, (_, i) =>
    attempt(d, i, now - (12 - i) * 60000, {
      activeThinkMs: i < 6 ? 30000 : 120000,
      difficulty: 4,
    }),
  );
  const slow = fatigueState(d, now);
  assert.equal(slow.known, true);
  assert.equal(slow.value, 0);
  const e = d.events[0];
  Object.assign(e, { wallTimeMs: 60000, idleMs: 50000, activeThinkMs: 60000 });
  assert.ok(fatigueState(d, now).effectiveMinutes < slow.effectiveMinutes);
});

test('completion estimate uses observed session completion and remains bounded without penalizing manual mode', () => {
  const d = fixture();
  d.events = Array.from({ length: 8 }, (_, i) =>
    attempt(d, i, now - (i + 1) * 60000),
  );
  const lower = completionEstimate(d, 'practice', 8, now);
  d.jobs = d.events.map((e) => ({
    id: 'done-' + e.sessionId,
    kind: 'study-completion',
    sessionId: e.sessionId,
    completedAt: e.occurredAt,
  }));
  const complete = completionEstimate(d, 'practice', 8, now);
  assert.ok(complete.value > lower.value);
  assert.ok(complete.value <= 1);
  assert.equal(complete.samples, 8);
  d.settings.studyMode = 'manual';
  assert.equal(completionEstimate(d, 'practice', 8, now).value, complete.value);
});

test('metadata is suspect only after repeated cross-day conflicts or invalid references', () => {
  const d = fixture(),
    q = d.questions[0];
  d.events = [attempt(d, 0, now - DAY, { activeThinkMs: 180000 })];
  assert.equal(metadataQuality(d, q, now).suspect, false);
  d.events = Array.from({ length: 6 }, (_, i) =>
    attempt(d, 0, now - (i + 1) * DAY, { activeThinkMs: 180000 }),
  );
  const quality = metadataQuality(d, q, now);
  assert.equal(quality.suspect, true);
  assert.equal(
    quality.confidence.expectedSeconds,
    DEFAULT_POLICY.signals.metadataSuspectConfidence,
  );
  assert.match(quality.explanation, /持续偏离/);
  assert.equal(
    metadataQuality(d, { ...q, skillId: 'missing' }, now).confidence.skill,
    0,
  );
  assert.equal(
    metadataQuality(d, { ...q, expectedSeconds: NaN }, now).confidence
      .expectedSeconds,
    0,
  );
});

test('GPA marginal impact respects configured formula and never fabricates real scores', () => {
  const d = fixture();
  d.exams = [
    schoolExam(d, now, 4),
    {
      ...schoolExam(d, now, -4),
      id: 'past',
      result: {
        score: 65,
        maxScore: 100,
        credits: 3,
        recordedAt: new Date(now - DAY).toISOString(),
      },
    },
  ];
  const ordinary = examImpact(d, 'math', undefined, now);
  assert.equal(ordinary.known, true);
  assert.ok(ordinary.gpaMarginal > 0);
  assert.ok(ordinary.value > 0);
  d.settings.examGpa = { scale: 4, formula: '4', weighted: true };
  assert.equal(examImpact(d, 'math', undefined, now).gpaMarginal, 0);
  d.exams = d.exams.slice(0, 1);
  const missing = examImpact(d, 'math', undefined, now);
  assert.equal(missing.known, false);
  assert.equal(missing.estimatedCredits, true);
  assert.equal(examImpact(d, 'physics', undefined, now).value, 0);
});

test('AI hypotheses cannot become a strategy without independent corroboration and never mutate learning data', () => {
  const d = fixture();
  d.events = [attempt(d, 0, now - 1000, { score: 0, outcome: 'wrong' })];
  const snapshot = JSON.stringify(d);
  for (const type of ['speed', 'retention', 'concept', 'fatigue'] as const) {
    const verdict = verifiedHypothesis(
      d,
      { type, claim: '模型认为存在问题' },
      now,
    );
    assert.equal(verdict.supported, false);
    assert.equal(verdict.strategy, undefined);
  }
  assert.equal(JSON.stringify(d), snapshot);
});
