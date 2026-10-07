import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { put, loadData, switchAccount, allRecords } from '../lib/store';
import { reviewQuestion, verifyRevision } from '../lib/quality-client';
import { computeMastery, buildQueue } from '../lib/engine';
import { wrongQuestions } from '../lib/question-tools';
import { cleanEvents } from '../lib/learning-intelligence';
import {
  validateProcessResult,
  directProcessEvidence,
} from '../lib/process-diagnosis';
import {
  buildRemediation,
  remedyPractice,
  remedyProgress,
  dueRemediation,
} from '../lib/remediation';
import type { Question, Node, AnswerEvent, StudyData } from '../lib/model';
const at = Date.parse('2026-10-07T04:00:00Z'),
  DAY = 86400000;
const n: Node = {
  id: 'repair-node',
  subject: 'math',
  course: '数学',
  unit: '代数',
  chapter: '方程',
  title: '方程求解',
  description: '等式变形',
  prerequisites: [],
  relatedNodes: [],
  importance: 0.8,
  examWeight: 0.8,
  skills: [{ id: 'solve', title: '逐步推导', difficulty: 2 }],
  source: '手动导入',
  version: '1',
};
const q: Question = {
  id: 'repair-question',
  schemaVersion: 1,
  nodeId: n.id,
  skillId: 'solve',
  subject: 'math',
  type: 'choice',
  prompt: '2x=6，求x。',
  answer: '4',
  explanation: '原答案有误',
  difficulty: 2,
  expectedSeconds: 30,
  variant: 'linear-a',
  options: ['1', '2', '3', '4'],
  source: '手动导入',
  tags: [],
  version: '1',
  verified: true,
};
const event = (id: string, extra: Partial<AnswerEvent> = {}): AnswerEvent => ({
  id,
  questionId: q.id,
  nodeId: n.id,
  skillId: 'solve',
  subject: 'math',
  outcome: 'wrong',
  score: 0,
  source: 'test',
  answer: '3',
  occurredAt: new Date(at).toISOString(),
  displayedAt: new Date(at - 30000).toISOString(),
  revealedAt: new Date(at).toISOString(),
  activeThinkMs: 30000,
  expectedSeconds: 30,
  difficulty: 2,
  variant: q.variant,
  usedHint: false,
  reason: '测试',
  sessionId: 'repair-test',
  localDay: '2026-10-07',
  version: 1,
  ...extra,
});
const data = (
  qs: Question[] = [q],
  events: AnswerEvent[] = [event('raw')],
): StudyData => ({
  nodes: [n],
  questions: qs,
  events,
  jobs: [],
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { dailyMinutes: 20, name: '测试', surprise: false },
});
test('pause, resume and correction replay mastery without changing any immutable answer; retired delayed grades stay excluded', async () => {
  await switchAccount('repair-audit');
  await put('node', n);
  await put('question', q);
  await put('event', event('old'));
  let d = await loadData();
  const baseline = computeMastery([n], [])[n.id + '::solve'];
  assert.notEqual(
    computeMastery([n], d.events)[n.id + '::solve'].mastery,
    baseline.mastery,
  );
  await reviewQuestion(
    d.questions.find((x) => x.id === q.id)!,
    'pause',
    '答案计算有误',
  );
  d = await loadData();
  assert.equal(d.questions.find((x) => x.id === q.id)!.reviewStatus, 'paused');
  assert.equal(wrongQuestions(d).length, 0);
  assert.equal(buildQueue(d, { subject: 'math', practice: true }).length, 0);
  assert.equal(cleanEvents(d.events).length, 0);
  assert.deepEqual(computeMastery([n], d.events)[n.id + '::solve'], baseline);
  await reviewQuestion(
    d.questions.find((x) => x.id === q.id)!,
    'resume',
    '核对原题',
  );
  d = await loadData();
  assert.equal(d.events.find((e) => e.id === 'old')!.voidedBy, undefined);
  const result = await reviewQuestion(
    d.questions.find((x) => x.id === q.id)!,
    'revise',
    '标准答案应为3',
    { ...q, answer: '3', explanation: '等式两边同时除以2，x=3。' },
  );
  d = await loadData();
  assert.ok(result.replacement);
  assert.equal(
    d.questions.find((x) => x.id === result.replacement!.id)!.verified,
    false,
  );
  assert.equal(d.questions.find((x) => x.id === q.id)!.answer, '4');
  assert.equal(d.events.find((e) => e.id === 'old')!.score, 0);
  assert.ok(d.events.find((e) => e.id === 'old')!.voidedBy);
  await put(
    'event',
    event('late', { occurredAt: new Date(at - 1000).toISOString() }),
  );
  d = await loadData();
  assert.ok(d.events.find((e) => e.id === 'late')!.voidedBy);
  assert.equal(
    (await allRecords()).find((r) => r.id === 'old')!.payload.voidedBy,
    undefined,
  );
  await switchAccount('repair-isolation');
  assert.equal(
    (await loadData()).jobs?.some((j) => j.kind === 'question-review'),
    false,
  );
});
test('revision keeps deliberately retained existing evidence but excludes new old-version grades; stale editors and account switches rejected', async () => {
  await switchAccount('repair-retain');
  await put('node', n);
  await put('question', q);
  await put('event', event('kept'));
  await reviewQuestion(
    q,
    'revise',
    '仅排版更正',
    { ...q, explanation: '补充排版' },
    false,
  );
  await put('event', event('not-kept'));
  const d = await loadData();
  assert.equal(d.events.find((e) => e.id === 'kept')!.voidedBy, undefined);
  assert.ok(d.events.find((e) => e.id === 'not-kept')!.voidedBy);
  await put('question', { ...q, prompt: '更新的题干' });
  await assert.rejects(reviewQuestion(q, 'pause', '检查'), /更新/);
  await assert.rejects(
    reviewQuestion(q, 'pause', '检查', undefined, true, 'other-account'),
    /账户/,
  );
});
test('process diagnosis rejects invented quotes, invalid earliest-step indexes and conflicting abstention', () => {
  const steps = ['2x=6', 'x=6-2', 'x=4'];
  const r = {
    status: 'first-error',
    firstStep: 1,
    quote: 'x=6-2',
    attribute: 'symbolic',
    explanation: '移除系数应当除以2',
    suggestion: '对等式两边进行同一运算',
    confidence: 0.8,
  };
  assert.equal(validateProcessResult(r, steps).firstStep, 1);
  assert.throws(() =>
    validateProcessResult({ ...r, quote: '不存在的草稿' }, steps),
  );
  assert.throws(() => validateProcessResult({ ...r, firstStep: 9 }, steps));
  assert.throws(() =>
    validateProcessResult({ ...r, status: 'uncertain' }, steps),
  );
  assert.equal(
    validateProcessResult(
      {
        ...r,
        status: 'uncertain',
        firstStep: null,
        attribute: null,
        quote: '',
      },
      steps,
    ).status,
    'uncertain',
  );
});
test('direct step evidence requires linked unvoided original work and excludes edits made after reveal', () => {
  const d = data();
  const j = {
    id: 'process-1',
    kind: 'process-evidence',
    questionId: q.id,
    questionVersion: q.version,
    sessionId: 'repair-test',
    steps: ['x=6-2'],
    at: new Date(at).toISOString(),
    afterReveal: false,
    result: {
      status: 'first-error',
      firstStep: 0,
      quote: 'x=6-2',
      attribute: 'symbolic',
      confidence: 0.9,
    },
  };
  d.jobs = [j];
  assert.equal(directProcessEvidence(d).length, 1);
  assert.equal(
    directProcessEvidence({ ...d, jobs: [{ ...j, afterReveal: true }] }).length,
    0,
  );
  assert.equal(
    directProcessEvidence({
      ...d,
      events: [{ ...d.events[0], voidedBy: { id: 'v', reason: '错误题目' } }],
    }).length,
    0,
  );
});
test('remediation groups valid missed skills, reuses local questions and links practice plus only delayed unseen variants', () => {
  const correct = {
    ...q,
    answer: '3',
    explanation: '两边同时除以2，得到x=3。',
  };
  const variant = {
      ...correct,
      id: 'variation',
      prompt: '3x=9，求x。',
      variant: 'linear-b',
    },
    verify = {
      ...correct,
      id: 'verification',
      prompt: '4x=12，求x。',
      variant: 'linear-c',
    };
  const d = data([correct, variant, verify]);
  const job = buildRemediation(d, 'repair-test', '手动测试', at);
  assert.equal(job.groups.length, 1);
  const g = job.groups[0];
  g.lessonCompletedAt = new Date(at).toISOString();
  const practice = remedyPractice(d, job, g, 'practice', at);
  assert.equal(practice[0].question.id, 'variation');
  assert.equal(practice[0].remediationPhase, 'practice');
  const pe = event('practiced', {
    questionId: variant.id,
    variant: variant.variant,
    outcome: 'correct',
    score: 1,
    occurredAt: new Date(at + 1000).toISOString(),
    learningEvidence: {
      version: 1,
      assessment: 'objective',
      remediationId: job.id,
      remediationGroup: g.id,
      remediationPhase: 'practice',
    },
  });
  d.events.push(pe);
  d.jobs = [job];
  assert.equal(remedyPractice(d, job, g, 'verify', at + DAY).length, 0);
  const next = remedyPractice(d, job, g, 'verify', at + DAY + 2000);
  assert.equal(next.length, 1);
  assert.equal(next[0].question.id, 'verification');
  assert.equal(dueRemediation(d, at + DAY + 2000).length, 1);
  const ve = {
    ...pe,
    id: 'verified',
    questionId: verify.id,
    variant: verify.variant,
    occurredAt: new Date(at + DAY + 3000).toISOString(),
    learningEvidence: {
      ...pe.learningEvidence!,
      remediationPhase: 'verify' as const,
    },
  };
  d.events.push(ve);
  assert.ok(remedyProgress(job, g, d.events, at + DAY + 4000).successful);
  assert.equal(dueRemediation(d, at + DAY + 4000).length, 0);
  const voided = data(
    [correct],
    [{ ...event('void'), voidedBy: { id: 'r', reason: '答案错误' } }],
  );
  assert.equal(
    buildRemediation(voided, 'repair-test', '测试').groups.length,
    0,
  );
  const revoked = {
    ...d,
    events: d.events.map((e) =>
      e.id === 'raw' ? { ...e, voidedBy: { id: 'r', reason: '来源撤销' } } : e,
    ),
  };
  assert.equal(
    remedyPractice(revoked, job, g, 'practice', at + DAY + 4000).length,
    0,
  );
  const tooFast = { ...ve, activeThinkMs: 100 };
  assert.equal(
    remedyProgress(job, g, [d.events[0], pe, tooFast], at + DAY + 4000)
      .successful,
    undefined,
  );
});
test('repeated original questions are assisted consolidation and cannot count as delayed transfer verification', () => {
  const d = data(),
    job = buildRemediation(d, 'repair-test', '测试', at),
    g = job.groups[0];
  const items = remedyPractice(d, job, g, 'practice', at);
  assert.ok(items[0].scaffold);
  const e = event('original-repeat', {
    outcome: 'correct',
    score: 1,
    learningEvidence: {
      version: 1,
      assessment: 'objective',
      remediationId: job.id,
      remediationGroup: g.id,
      remediationPhase: 'practice',
    },
  });
  const bad = event('false-verify', {
    outcome: 'correct',
    score: 1,
    occurredAt: new Date(at + DAY + 1000).toISOString(),
    learningEvidence: { ...e.learningEvidence!, remediationPhase: 'verify' },
  });
  assert.equal(
    remedyProgress(job, g, [e, bad], at + 2 * DAY).successful,
    undefined,
  );
});

test('exact revised math verification uses three solvers and judge; rejection never generates or overwrites an updated question', async () => {
  await switchAccount('repair-verify');
  const revised = { ...q, id: 'edited', verified: false, answer: '3' };
  await put('question', revised);
  const before = globalThis.fetch;
  const actions: string[] = [];
  let pass = false,
    changeDuringJudge = false;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, '/api/ai');
    const b = JSON.parse(String(init?.body));
    actions.push(b.action);
    if (b.action === 'solve') return Response.json({ solver: { answer: '3' } });
    assert.equal(b.action, 'judge');
    assert.equal(b.solvers.length, 3);
    if (changeDuringJudge)
      await put('question', { ...revised, prompt: '已经更新的题干' });
    return Response.json({ pass, reason: '需核对' });
  };
  try {
    await assert.rejects(verifyRevision(revised), /未通过核验/);
    assert.deepEqual(actions, ['solve', 'solve', 'solve', 'judge']);
    assert.equal(
      (await loadData()).questions.find((x) => x.id === 'edited')!.verified,
      false,
    );
    pass = true;
    changeDuringJudge = true;
    await assert.rejects(verifyRevision(revised), /题目或账户已变化/);
    assert.equal(
      (await loadData()).questions.find((x) => x.id === 'edited')!.verified,
      false,
    );
    changeDuringJudge = false;
    await put('question', revised);
    await verifyRevision(revised);
    assert.equal(
      (await loadData()).questions.find((x) => x.id === 'edited')!.verification
        ?.solverCount,
      3,
    );
    assert.equal(actions.includes('generate'), false);
  } finally {
    globalThis.fetch = before;
  }
});
