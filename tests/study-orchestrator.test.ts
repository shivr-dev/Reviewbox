import test from 'node:test';
import assert from 'node:assert/strict';
import { studyAgenda, studyInsights } from '../lib/study-orchestrator';
import { practiceCheckpoint } from '../lib/study-orchestrator';
import { completeActiveSession } from '../lib/store';
import { adviceOpportunity, cachedStudyAdvice } from '../lib/study-advice';
import { reviewStudyMilestone } from '../lib/study-advice-client';
import {
  postponeStudyAction,
  beginPlannedSimulation,
  freshStudyAction,
} from '../lib/study-orchestrator-client';
import { loadData, put, switchAccount, currentNamespace } from '../lib/store';
import {
  fixture,
  attempt,
  practiced,
  schoolExam,
  importedPaper,
} from './study-plan-fixtures';
const DAY = 86400000,
  now = new Date(2026, 9, 17, 12).getTime();

test('three completed practice blocks summarize state once and reset after reading', () => {
  const d = practiced(fixture(), now);
  d.jobs = d.events
    .slice(0, 3)
    .map((e, i) => ({
      id: 'block-' + i,
      kind: 'study-completion',
      sessionId: e.sessionId,
      completedAt: new Date(Date.parse(e.occurredAt) + 1000).toISOString(),
    }));
  d.jobs.push({
    id: 'chest-copy',
    kind: 'game-chest',
    sessionId: d.events[0].sessionId,
    at: new Date(now - 1000).toISOString(),
  });
  const a = studyAgenda(d, now);
  assert.equal(a.primary.kind, 'report');
  assert.match(a.primary.id, /^checkpoint:/);
  assert.equal(a.checkpoint.blocks.length, 3);
  d.jobs.push({
    id: 'seen',
    kind: 'study-decision',
    actionId: a.primary.id,
    choice: 'seen',
    at: new Date(now).toISOString(),
    until: new Date(now + 7 * DAY).toISOString(),
  });
  assert.equal(practiceCheckpoint(d, now + 1).blocks.length, 0);
  assert.ok(
    !studyAgenda(d, now + 1).actions.some((a) =>
      a.id.startsWith('checkpoint:'),
    ),
  );
  d.events = d.events.map((e) => ({ ...e, score: 0.3, outcome: 'wrong' }));
  assert.ok(
    !studyAgenda(d, now).actions.some((a) => a.kind === 'test'),
    '基础失误较多时先巩固',
  );
});

test('practice completion markers remain unique when a completion callback repeats', async () => {
  await switchAccount('study-completion-check');
  try {
    const d = fixture();
    await put(
      'job',
      {
        id: 'completed-session',
        kind: 'session',
        mode: 'review',
        status: 'active',
        items: [{ question: d.questions[0], priority: 1, reason: '练习' }],
      },
      'active-session',
    );
    await completeActiveSession('completed-session');
    await completeActiveSession('completed-session');
    const markers = (await loadData()).jobs!.filter(
      (j) => j.kind === 'study-completion',
    );
    assert.equal(markers.length, 1);
    assert.equal(markers[0].sessionId, 'completed-session');
  } finally {
    await switchAccount(null);
  }
});

test('repeated test losses recommend a local remediation outline without generating content', () => {
  const d = fixture();
  d.events = [0, 1].map((i) =>
    attempt(d, i, now - 10000 - i * 1000, {
      source: 'test',
      score: 0.2,
      outcome: 'wrong',
      sessionId: 'failed-test',
    }),
  );
  d.tests.push({
    id: 'failed-test',
    title: '阶段验证',
    subject: 'math',
    sessionId: 'failed-test',
    eventIds: d.events.map((e) => e.id),
    at: new Date(now - 1000).toISOString(),
    scope: [],
  });
  const action = studyAgenda(d, now).actions.find((a) => a.kind === 'remedy');
  assert.equal(action?.sourceSessionId, 'failed-test');
  assert.equal(d.jobs!.length, 0);
  d.events[0].voidedBy = { id: 'correction', reason: '题目撤销' };
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'remedy'));
});

test('one entry chooses diagnosis first, then bounded practice; does not invent content or consume AI', () => {
  const d = fixture(),
    snap = JSON.stringify(d);
  assert.equal(studyAgenda(d, now).primary.kind, 'initial');
  assert.equal(JSON.stringify(d), snap);
  d.events = [attempt(d, 0, now - 3600000)];
  const a = studyAgenda(d, now);
  assert.equal(a.primary.kind, 'practice');
  assert.ok(a.practice.length <= 6);
  assert.ok(a.practice.length > 0);
  assert.ok(
    a.practice.reduce((s, i) => s + i.question.expectedSeconds, 0) <= 480,
  );
  const empty = fixture();
  empty.questions = [];
  assert.equal(studyAgenda(empty, now).primary.kind, 'import');
});

test('eight distinct valid exercises across abilities trigger a test, with completed-test cooldown', () => {
  const d = practiced(fixture(), now),
    a = studyAgenda(d, now);
  assert.equal(a.primary.kind, 'test');
  assert.ok(a.primary.items!.length >= 3);
  assert.ok(
    a.primary.items!.some(
      (i) => !d.events.some((e) => e.questionId === i.question.id),
    ),
  );
  const q = a.primary.items![0].question,
    idx = d.questions.findIndex((x) => x.id === q.id);
  const e = attempt(d, idx, now - 10000, { source: 'test' });
  d.events.push(e);
  d.tests.push({
    id: 'test',
    title: '阶段短测',
    subject: 'math',
    at: e.occurredAt,
    eventIds: [e.id],
    scope: [],
    sessionId: e.sessionId,
  });
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'test'));
  const b = fixture();
  b.events = [
    ...d.events.slice(0, 7),
    { ...d.events[7], voidedBy: { id: 'correction', reason: '测试撤销' } },
  ];
  b.events.push({ ...b.events[0], id: 'duplicate' });
  b.events.push(attempt(b, 15, now + DAY));
  b.events.push(attempt(b, 16, now - 1000, { predictedConfidence: 'guess' }));
  assert.ok(!studyAgenda(b, now).actions.some((a) => a.kind === 'test'));
});

test('pressure requires cross-day baseline, uses fresh objective items and avoids the final cramming day', () => {
  const d = fixture();
  d.exams = [schoolExam(d, now, 4)];
  d.events = [
    attempt(d, 0, now - 3 * DAY),
    attempt(d, 1, now - 2 * DAY),
    attempt(d, 8, now - 3 * DAY),
    attempt(d, 9, now - 2 * DAY),
  ];
  const a = studyAgenda(d, now);
  assert.equal(a.primary.kind, 'pressure');
  assert.ok(a.primary.items!.length >= 3);
  d.exams[0] = schoolExam(d, now, 1);
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'pressure'));
  d.exams[0] = schoolExam(d, now, 4);
  d.events = d.events.map((e, i) => ({
    ...e,
    occurredAt: new Date(now - 3600000 - i * 10000).toISOString(),
  }));
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'pressure'));
});

test('pinyin self checks are not repeatedly treated as a first visit or as an objective pressure baseline', () => {
  const d = fixture('chinese');
  d.questions = d.questions.map((q) => ({
    ...q,
    type: 'pinyin',
    prompt: 'láng jí',
    answer: '狼藉',
    explanation: '',
    options: undefined,
  }));
  d.events = [
    attempt(d, 0, now - 2 * DAY, {
      source: 'self',
      answer: undefined,
      learningEvidence: { version: 1, assessment: 'self' },
    }),
  ];
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'initial'));
  d.exams = [schoolExam(d, now, 4)];
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'pressure'));
});

test('CE simulations require a complete imported matching paper, respect time, and cool down after completion', () => {
  const d = fixture('ce');
  d.exams = [schoolExam(d, now, 4)];
  assert.equal(studyAgenda(d, now).primary.kind, 'import-exam');
  const p = importedPaper(d, 'SAT', now);
  const a = studyAgenda(d, now);
  assert.equal(a.primary.kind, 'simulation');
  assert.equal(a.primary.minutes, 64);
  d.settings.dailyMinutes = 20;
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'simulation'));
  assert.ok(
    studyAgenda(d, now).actions.some((a) =>
      a.id.startsWith('simulation-time:'),
    ),
  );
  d.settings.dailyMinutes = 90;
  p.origin = undefined;
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'simulation'));
  p.origin = 'imported';
  const q = d.questions.find((q) => q.id === Object.values(p.questions)[0])!;
  q.reviewStatus = 'paused';
  assert.equal(studyAgenda(d, now).primary.kind, 'import-exam');
  q.reviewStatus = undefined;
  d.jobs!.push({
    id: 'done',
    kind: 'exam-run',
    paperId: p.id,
    exam: 'SAT',
    status: 'complete',
    startedAt: new Date(now - DAY).toISOString(),
    completedAt: new Date(now - 3600000).toISOString(),
  });
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'simulation'));
});

test('resume outranks score reminders; reminders start the next day and defer until requested', () => {
  const d = fixture();
  d.exams = [schoolExam(d, now, -2)];
  assert.equal(studyAgenda(d, now).primary.kind, 'score');
  d.jobs!.push({
    id: 'session',
    kind: 'session',
    status: 'active',
    mode: 'review',
    createdAt: new Date(now - 10000).toISOString(),
    items: [{ question: d.questions[0], reason: '继续', priority: 1 }],
  });
  assert.equal(studyAgenda(d, now).primary.kind, 'resume');
  d.jobs = [];
  const id = studyAgenda(d, now).primary.id;
  d.jobs.push({
    id: 'skip',
    kind: 'study-decision',
    actionId: id,
    choice: 'defer',
    at: new Date(now).toISOString(),
    until: new Date(now + DAY).toISOString(),
  });
  assert.notEqual(studyAgenda(d, now).primary.kind, 'score');
  assert.equal(studyAgenda(d, now + DAY + 1).primary.kind, 'score');
  d.exams = [schoolExam(d, now, 0)];
  assert.ok(!studyAgenda(d, now).actions.some((a) => a.kind === 'score'));
});

test('course and weekly report are scheduled and sparse performance never becomes a confident trend', () => {
  const d = fixture();
  d.questions = [];
  d.jobs!.push({
    id: 'c',
    kind: 'course',
    status: 'ready',
    subject: 'math',
    sections: [{ id: 's', title: '方程', content: {}, completedAt: undefined }],
  });
  assert.equal(studyAgenda(d, now).primary.kind, 'course');
  const p = practiced(fixture(), now);
  const insight = studyInsights(p, now);
  assert.equal(insight.weekCount, 8);
  assert.equal(insight.change, null);
  assert.match(insight.method, /证据不足/);
  assert.ok(studyAgenda(p, now).actions.some((a) => a.kind === 'report'));
});

test('Qwen opportunities only arise at milestones, cache validated actions, and cap rolling daily/weekly calls', () => {
  const d = fixture(),
    actions = studyAgenda(d, now).actions;
  assert.equal(adviceOpportunity(d, actions, now), null);
  d.exams = [schoolExam(d, now, -2)];
  d.exams[0].result = {
    score: 60,
    maxScore: 100,
    credits: 1,
    recordedAt: new Date(now - 1000).toISOString(),
  };
  const op = adviceOpportunity(d, studyAgenda(d, now).actions, now)!;
  assert.ok(op);
  assert.match(op.milestone, /^result:/);
  const a = op.candidates[0];
  const job = {
    id: 'advice',
    kind: 'study-advice',
    milestone: op.milestone,
    status: 'complete',
    at: new Date(now - 1000).toISOString(),
    expires: new Date(now + DAY).toISOString(),
    actionIds: [a.id],
    actionId: a.id,
    explanation: '选择当前已有行动',
    method: '间隔验证',
  };
  d.jobs!.push(job);
  assert.equal(adviceOpportunity(d, actions, now), null);
  assert.ok(cachedStudyAdvice(d, studyAgenda(d, now).actions, now));
  job.actionId = 'invented';
  assert.equal(cachedStudyAdvice(d, actions, now), undefined);
  d.settings.assistantAi = false;
  d.jobs = [];
  assert.equal(adviceOpportunity(d, actions, now), null);
  d.settings.assistantAi = true;
  d.jobs = [
    {
      ...job,
      id: 'failed-1',
      status: 'error',
      milestone: 'other-1',
      at: new Date(now - 2 * DAY).toISOString(),
    },
    {
      ...job,
      id: 'failed-2',
      status: 'error',
      milestone: 'other-2',
      at: new Date(now - 4 * DAY).toISOString(),
    },
  ];
  assert.equal(
    adviceOpportunity(d, actions, now),
    null,
    '失败尝试也计入滚动七天两次上限',
  );
  d.jobs = [{ ...job, id: 'future', at: new Date(now + DAY).toISOString() }];
  assert.ok(adviceOpportunity(d, actions, now), '未来记录不影响真实额度');
});

test('concurrent planned CE entry creates only one resumable run without replacing its deadline', async () => {
  await switchAccount('planned-exam-atomic');
  try {
    const d = fixture('ce'),
      p = importedPaper(d);
    for (const n of d.nodes) await put('node', n);
    for (const q of d.questions) await put('question', q);
    await put('job', p);
    const action = {
      id: 'simulation',
      kind: 'simulation' as const,
      title: 'SAT',
      reason: '测试',
      label: '开始',
      minutes: 64,
      priority: 1,
      paperId: p.id,
    };
    const [a, b] = await Promise.all([
      beginPlannedSimulation(action),
      beginPlannedSimulation(action),
    ]);
    assert.equal(a.id, b.id);
    assert.equal(a.deadline, b.deadline);
    assert.equal(
      (await loadData()).jobs!.filter((j) => j.kind === 'exam-run').length,
      1,
    );
  } finally {
    await switchAccount(null);
  }
});

test('planned choices and Qwen reservation are idempotent across concurrent requests and isolate accounts', async () => {
  await switchAccount('study-orchestrator-check');
  const fetchBefore = globalThis.fetch;
  let calls = 0;
  try {
    const now = Date.now(),
      d = practiced(fixture(), now);
    d.exams = [schoolExam(d, now, -2)];
    d.exams[0].result = {
      score: 60,
      maxScore: 100,
      credits: 1,
      recordedAt: new Date(now - 1000).toISOString(),
    };
    for (const n of d.nodes) await put('node', n);
    for (const q of d.questions) await put('question', q);
    for (const e of d.events) await put('event', e);
    await put('exam', d.exams[0]);
    await put('setting', d.settings, 'settings');
    globalThis.fetch = async (_url, init) => {
      calls++;
      const b = JSON.parse(String(init?.body));
      assert.equal(b.action, 'study-advice');
      assert.ok(!('questions' in b));
      return Response.json({
        advice: {
          actionId: b.summary.actions[0].id,
          explanation: '按现有证据先验证',
          method: '独立作答',
        },
      });
    };
    await Promise.all([reviewStudyMilestone(), reviewStudyMilestone()]);
    await reviewStudyMilestone();
    assert.equal(calls, 1);
    let fresh = await loadData();
    assert.equal(
      fresh.jobs!.filter((j) => j.kind === 'study-advice').length,
      1,
    );
    const stage = studyAgenda(fresh).actions.find((a) => a.kind === 'test')!;
    await postponeStudyAction(stage);
    fresh = await loadData();
    assert.ok(!studyAgenda(fresh).actions.some((a) => a.id === stage.id));
    await assert.rejects(freshStudyAction(stage.id));
    const ns = currentNamespace();
    await switchAccount('study-orchestrator-other');
    await assert.rejects(postponeStudyAction(stage, 'defer', ns));
    assert.equal(
      (await loadData()).jobs!.some((j) => j.kind === 'study-advice'),
      false,
    );
  } finally {
    globalThis.fetch = fetchBefore;
    await switchAccount(null);
  }
});
