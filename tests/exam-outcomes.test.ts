import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_GPA,
  examGpa,
  examFeedback,
  gradePoint,
  pendingExamScores,
  validResult,
  validateGpaConfig,
} from '../lib/exam-outcomes';
import {
  saveExamScore,
  saveGpaConfig,
  saveDailyTime,
  deferExamScore,
} from '../lib/exam-outcome-client';
import { currentNamespace, loadData, put, switchAccount } from '../lib/store';
import { dailyStudyPlan, assistantSettings } from '../lib/study-assistant';
import { localDay, type Exam, type StudyData } from '../lib/model';
const now = new Date(2026, 9, 12, 12).getTime();
function exam(id = 'exam', extra: Partial<Exam> = {}): Exam {
  return {
    id,
    title: '数学月考',
    subject: 'math',
    date: '2026-10-10',
    scope: [],
    target: 80,
    dailyMinutes: 20,
    ...extra,
  };
}
function result(score = 80, maxScore = 100, credits = 1) {
  return {
    score,
    maxScore,
    credits,
    recordedAt: new Date(now - 3600000).toISOString(),
  };
}
function data(exams: Exam[] = []): StudyData {
  return {
    nodes: [],
    questions: [],
    events: [],
    exams,
    tests: [],
    notes: [],
    materials: [],
    packs: [],
    settings: { dailyMinutes: 20, name: '测试', surprise: false },
  };
}

test('real-exam GPA handles weighted credits, raw-score denominators, zero and empty data', () => {
  assert.equal(examGpa(data(), now).value, null);
  assert.ok(validResult(result(0)));
  assert.equal(
    examGpa(data([exam('zero', { result: result(0) })]), now).value,
    0,
  );
  const d = data([
    exam('a', { result: result(80, 100, 2) }),
    exam('b', { result: result(135, 150, 1) }),
  ]);
  assert.ok(Math.abs(examGpa(d, now).value! - 10 / 3) < 1e-12);
  d.settings.examGpa = { ...DEFAULT_GPA, weighted: false };
  assert.ok(Math.abs(examGpa(d, now).value! - 3.4) < 1e-12);
  const snapshot = JSON.stringify(d.exams);
  d.settings.examGpa = {
    scale: 5,
    formula: 'min(scale, max(0, floor((percent - 50) / 10)))',
    weighted: false,
  };
  assert.equal(examGpa(d, now).value, 3.5);
  assert.equal(JSON.stringify(d.exams), snapshot);
  d.settings.examGpa = { ...DEFAULT_GPA, from: '2026-10-11' };
  assert.equal(examGpa(d, now).value, null);
});

test('restricted GPA expressions preserve precedence and reject code, invalid dates and non-finite results', () => {
  assert.equal(gradePoint('-2^2', {}), -4);
  assert.equal(gradePoint('2^-2', {}), 0.25);
  assert.equal(gradePoint('2^3^2', {}), 512);
  assert.equal(gradePoint('round(max(0, 1.555) * 100) / 100', {}), 1.56);
  for (const s of [
    'globalThis.fetch(1)',
    'Math.random()',
    'constructor',
    'ratio;alert(1)',
    '1/0',
    '2^1024',
    'min(1)',
    '(1',
    '('.repeat(21) + '1' + ')'.repeat(21),
  ])
    assert.throws(() => gradePoint(s, { ratio: 0.8 }));
  assert.throws(() =>
    validateGpaConfig({ ...DEFAULT_GPA, formula: '1 / (percent - 73)' }),
  );
  assert.throws(() =>
    validateGpaConfig({ ...DEFAULT_GPA, from: '2026-02-31' }),
  );
  assert.throws(() =>
    validateGpaConfig({ ...DEFAULT_GPA, from: '2026-10-12', to: '2026-10-10' }),
  );
  assert.throws(() => validateGpaConfig({ ...DEFAULT_GPA, scale: 0 }));
});

test('score reminders exclude future exams, today before completion, snoozes and malformed records', () => {
  const a = exam('a'),
    d = data([
      a,
      exam('today', { date: '2026-10-12' }),
      exam('future', { date: '2026-10-20', result: result() }),
      exam('invalid', { date: '2026-02-31' }),
      exam('sleep', { scoreReminderAfter: new Date(now + 1000).toISOString() }),
      exam('done', { result: result() }),
    ]);
  assert.deepEqual(
    pendingExamScores(d, now).map((e) => e.id),
    ['a'],
  );
  d.exams.push(
    exam('future-result', {
      result: { ...result(), recordedAt: new Date(now + 1000).toISOString() },
    }),
  );
  d.exams.push(exam('bad-score', { result: result(101) }));
  d.exams.push(d.exams.find((e) => e.id === 'done')!);
  assert.equal(examGpa(d, now).rows.length, 1);
});

test('reported school scores reprioritize scoped verification without changing answer or mastery evidence', () => {
  const d = data();
  d.nodes = ['a', 'b'].map((id) => ({
    id,
    subject: 'math',
    title: id,
    course: '数学',
    unit: '',
    chapter: '',
    description: '',
    prerequisites: [],
    relatedNodes: [],
    importance: 0.5,
    examWeight: 0.5,
    skills: [{ id: 's', title: '计算', difficulty: 2 }],
    source: 'manual',
    version: '1',
  }));
  d.questions = d.nodes.map((n) => ({
    schemaVersion: 1,
    id: n.id + '-q',
    nodeId: n.id,
    subject: 'math',
    skillId: 's',
    type: 'choice',
    prompt: '2×3?',
    options: ['3', '6', '9', '12'],
    answer: '6',
    explanation: '2×3=6',
    expectedSeconds: 60,
    difficulty: 2,
    variant: n.id,
    tags: [],
    source: 'manual',
    version: '1',
    verified: true,
  }));
  const before = dailyStudyPlan(d, now);
  const events = JSON.stringify(d.events);
  d.exams = [exam('weak', { scope: ['b'], result: result(40) })];
  const after = dailyStudyPlan(d, now);
  assert.equal(after.queue[0].question.nodeId, 'b');
  assert.deepEqual(after.skills, before.skills);
  assert.equal(JSON.stringify(d.events), events);
  assert.equal(examFeedback(d, 'math', 'a', now), null);
  assert.ok(examFeedback(d, 'math', 'b', now)!.boost > 0);
  assert.equal(examFeedback(d, 'math', 'b', now + 91 * 86400000), null);
  d.exams.push(exam('improved', { date: '2026-10-11', result: result(95) }));
  assert.equal(examFeedback(d, 'math', 'b', now)!.boost, 0);
});

test('saving scores is idempotent, syncable and namespace-bound; time and formula updates preserve settings', async () => {
  await switchAccount('exam-results-check');
  try {
    const ns = currentNamespace(),
      d = await loadData();
    await put(
      'setting',
      {
        ...d.settings,
        assistant: { version: 1, weights: { math: 5 }, dailyMinutes: 20 },
        gameSound: true,
      },
      'settings',
    );
    const today = localDay(new Date()),
      e = exam('client', { date: today });
    await put('exam', e);
    const r = { ...result(75), recordedAt: new Date().toISOString() };
    await saveExamScore(e.id, r);
    await saveExamScore(e.id, r);
    let fresh = await loadData();
    assert.equal(fresh.exams.filter((x) => x.id === e.id).length, 1);
    assert.equal(fresh.exams.find((x) => x.id === e.id)!.result!.score, 75);
    assert.equal(examGpa(fresh).value, 3);
    await assert.rejects(saveExamScore(e.id, { ...r, score: 200 }));
    await assert.rejects(saveExamScore('missing', r));
    await put('exam', exam('future-client', { date: '2099-01-01' }));
    await assert.rejects(saveExamScore('future-client', r));
    await saveDailyTime(45);
    await saveGpaConfig({ ...DEFAULT_GPA, scale: 5 });
    fresh = await loadData();
    assert.equal(fresh.settings.dailyMinutes, 45);
    assert.equal(assistantSettings(fresh).dailyMinutes, 45);
    assert.equal(fresh.settings.assistant?.weights.math, 5);
    assert.equal(fresh.settings.gameSound, true);
    assert.equal(examGpa(fresh).value, 3.75);
    await deferExamScore(e.id);
    assert.ok(
      Date.parse(
        (await loadData()).exams.find((x) => x.id === e.id)!
          .scoreReminderAfter!,
      ) > Date.now(),
    );
    await switchAccount('exam-results-other');
    await assert.rejects(saveExamScore(e.id, r, ns));
    await assert.rejects(saveGpaConfig(DEFAULT_GPA, ns));
    await assert.rejects(saveDailyTime(30, ns));
    assert.equal((await loadData()).exams.length, 0);
  } finally {
    await switchAccount(null);
  }
});
