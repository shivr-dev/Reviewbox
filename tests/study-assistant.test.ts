import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assistantSettings,
  completedWeek,
  dailyStudyPlan,
  weeklyLearningGpa,
} from '../lib/study-assistant';
import {
  localDay,
  type AnswerEvent,
  type Node,
  type Question,
  type StudyData,
  type Subject,
} from '../lib/model';
const now = new Date(2026, 9, 12, 12).getTime();
function node(
  id: string,
  subject: Subject = 'math',
  prerequisites: string[] = [],
): Node {
  return {
    id,
    subject,
    prerequisites,
    course: subject,
    unit: '',
    chapter: '',
    title: id,
    description: id,
    relatedNodes: [],
    importance: 0.8,
    examWeight: 0.9,
    skills: [{ id: 's', title: '计算', difficulty: 2 }],
    source: 'manual',
    version: '1',
  };
}
function question(n: Node, id = n.id + '-q', seconds = 50): Question {
  return {
    schemaVersion: 1,
    id,
    nodeId: n.id,
    skillId: 's',
    subject: n.subject,
    type: 'choice',
    prompt: '2×3?',
    answer: '6',
    options: ['3', '6', '9', '12'],
    explanation: '2×3=6',
    expectedSeconds: seconds,
    difficulty: 2,
    variant: id,
    tags: [],
    source: 'manual',
    version: '1',
    verified: true,
  };
}
function data(nodes = [node('a'), node('b')]): StudyData {
  return {
    nodes,
    questions: nodes.flatMap((n) => [question(n), question(n, n.id + '-v')]),
    events: [],
    exams: [],
    notes: [],
    materials: [],
    tests: [],
    packs: [],
    settings: { dailyMinutes: 20, name: '测试', surprise: false },
  };
}
function event(
  q: Question,
  at: number,
  id: string,
  score = 1,
  extra: Partial<AnswerEvent> = {},
): AnswerEvent {
  const iso = new Date(at).toISOString();
  return {
    id,
    questionId: q.id,
    nodeId: q.nodeId,
    skillId: q.skillId,
    subject: q.subject,
    score,
    outcome: score >= 0.85 ? 'correct' : score >= 0.4 ? 'unsure' : 'wrong',
    source: 'test',
    answer: score ? q.answer : '3',
    occurredAt: iso,
    displayedAt: iso,
    revealedAt: iso,
    activeThinkMs: 30000,
    expectedSeconds: q.expectedSeconds,
    difficulty: 2,
    variant: q.variant,
    usedHint: false,
    reason: '测试',
    sessionId: id,
    localDay: localDay(new Date(at)),
    version: 1,
    learningEvidence: { version: 1, assessment: 'objective' },
    ...extra,
  };
}
const hours = 3600000;
test('new learners stay unknown and initial diagnosis covers weighted imported subjects', () => {
  const d = data([node('m'), node('c', 'chinese'), node('e', 'english')]);
  const plan = dailyStudyPlan(d, now);
  assert.ok(
    plan.skills.every((s) => s.state === 'unknown' && s.mastery === null),
  );
  const initial = plan.recommendations.find((r) => r.subject === 'all');
  assert.ok(initial);
  assert.deepEqual(
    new Set(initial.questions.map((i) => i.question.subject)),
    new Set(['math', 'chinese', 'english']),
  );
  assert.ok(
    plan.queue.every((i) => d.questions.some((q) => q.id === i.question.id)),
  );
  assert.equal(weeklyLearningGpa(d, now).value, null);
});
test('weights and nearing exams change priority without exceeding remaining time', () => {
  const d = data([node('m'), node('e', 'english')]);
  d.settings.dailyMinutes = 10;
  (d.settings as any).assistant = {
    version: 1,
    dailyMinutes: 10,
    weights: { math: 1, english: 5 },
  };
  d.questions.forEach((q) => (q.expectedSeconds = 400));
  d.exams = [
    {
      id: 'x',
      title: '英语考试',
      subject: 'english',
      date: localDay(new Date(now + 86400000)),
      scope: [],
      target: 85,
      dailyMinutes: 10,
    },
  ];
  const plan = dailyStudyPlan(d, now);
  assert.equal(plan.queue[0].question.subject, 'english');
  assert.ok(plan.scheduledSeconds <= plan.remainingSeconds);
  assert.equal(plan.queue.length, 1);
  d.events = [
    event(d.questions[0], now - hours, 'today', 0, { activeThinkMs: 599000 }),
  ];
  assert.equal(dailyStudyPlan(d, now).queue.length, 0);
  (d.settings as any).assistant.weights.english = 0;
  assert.ok(
    dailyStudyPlan({ ...d, events: [] }, now).queue.every(
      (q) => q.question.subject === 'math',
    ),
  );
});
test('available weak or unknown prerequisites precede dependencies and cyclic graphs terminate', () => {
  const base = node('base'),
    dependent = node('next', 'math', ['base']);
  const plan = dailyStudyPlan(data([dependent, base]), now);
  assert.equal(plan.queue[0].question.nodeId, 'base');
  const index = plan.queue.findIndex((q) => q.question.nodeId === 'next');
  assert.ok(index > 0);
  assert.equal(plan.stages[0].kind, 'prerequisite');
  const cyclic = data([node('a', 'math', ['b']), node('b', 'math', ['a'])]);
  assert.equal(dailyStudyPlan(cyclic, now).queue.length, 0);
});
test('same day answers and suspect/future/paused/voided evidence never imply durable mastery', () => {
  const d = data();
  d.events = Array.from({ length: 6 }, (_, i) =>
    event(d.questions[i % 2], now - (6 - i) * hours, 'same-' + i),
  );
  d.events.push(event(d.questions[2], now + hours, 'future'));
  d.events.push(
    event(d.questions[2], now - hours, 'void', 1, {
      voidedBy: { id: 'v', reason: '争议' },
    }),
  );
  assert.equal(
    dailyStudyPlan(d, now).skills.find((s) => s.nodeId === 'a')?.state,
    'developing',
  );
  assert.equal(
    dailyStudyPlan(d, now).skills.find((s) => s.nodeId === 'b')?.state,
    'unknown',
  );
  assert.ok(
    dailyStudyPlan(d, now).queue.every((i) => i.question.nodeId !== 'a'),
  );
  d.questions[2].reviewStatus = 'paused';
  assert.ok(
    dailyStudyPlan(d, now).queue.every(
      (i) => i.question.id !== d.questions[2].id,
    ),
  );
  assert.equal(weeklyLearningGpa(d, now).value, null);
});
test('retained content respects its due date instead of filling the day with repetitions', () => {
  const d = data([node('a')]);
  d.events = [
    event(d.questions[0], now - 11 * 86400000, 'one'),
    event(d.questions[1], now - 9 * 86400000, 'two'),
    event(d.questions[0], now - 5 * 86400000, 'three'),
    event(d.questions[1], now - 86400000, 'four'),
  ];
  const plan = dailyStudyPlan(d, now);
  assert.equal(plan.skills[0].state, 'retained');
  assert.equal(plan.queue.length, 0);
});
test('pressure recommendations require a spaced baseline and upcoming examination', () => {
  const d = data();
  for (let i = 0; i < 4; i++)
    for (const q of [d.questions[i % 2], d.questions[2 + (i % 2)]])
      d.events.push(
        event(q, now - (12 - i * 3) * 86400000, q.id + '-day' + i, 1, {
          source: 'rubric',
        }),
      );
  d.exams = [
    {
      id: 'x',
      title: '数学',
      subject: 'math',
      date: localDay(new Date(now + 3 * 86400000)),
      scope: [],
      target: 85,
      dailyMinutes: 20,
    },
  ];
  assert.ok(
    dailyStudyPlan(d, now).recommendations.some((r) => r.mode === 'pressure'),
  );
  d.events = [
    event(d.questions[0], now - hours, 'only', 1, { source: 'rubric' }),
  ];
  assert.ok(
    !dailyStudyPlan(d, now).recommendations.some((r) => r.mode === 'pressure'),
  );
});
test('weekly boundaries release only ended weeks across year, Sunday, Monday and DST', () => {
  assert.equal(
    completedWeek(new Date(2027, 0, 4, 0).getTime()).startDate,
    '2026-12-28',
  );
  assert.equal(
    completedWeek(new Date(2027, 0, 3, 23, 59).getTime()).startDate,
    '2026-12-21',
  );
  assert.equal(
    completedWeek(new Date(2027, 0, 4, 0).getTime()).endDate,
    '2027-01-03',
  );
  const dst = completedWeek(new Date(2026, 2, 9, 12).getTime());
  assert.equal(dst.startDate, '2026-03-02');
  assert.equal(dst.endDate, '2026-03-08');
});
test('GPA uses only reliable spaced raw scores and ignores XP, duplicates, hints, current/future week', () => {
  const d = data(),
    period = completedWeek(now),
    start = Date.parse(period.start);
  for (let day = -1; day <= 4; day++)
    for (let skill = 0; skill < 2; skill++) {
      const q = d.questions[skill * 2 + ((day + 1) % 2)];
      d.events.push(
        event(q, start + day * 86400000 + 12 * hours, `s${skill}-d${day}`),
      );
    }
  const report = weeklyLearningGpa(d, now);
  assert.equal(report.sample, 10);
  assert.equal(report.value, 4);
  const duplicate = { ...d.events[3], id: 'import-again' };
  d.events.push(
    duplicate,
    event(d.questions[0], now - hours, 'thisweek', 0),
    event(d.questions[0], now + hours, 'future', 0),
    event(d.questions[0], start + 5 * 86400000 + hours, 'hint', 0, {
      usedHint: true,
    }),
    event(d.questions[0], start + 5 * 86400000 + 2 * hours, 'fast', 0, {
      activeThinkMs: 1,
    }),
  );
  (d.settings as any).gameXP = 999999;
  assert.equal(weeklyLearningGpa(d, now).value, 4);
  assert.equal(weeklyLearningGpa(d, now).sample, 10);
  d.events[4].voidedBy = { id: 'bad', reason: '修订撤销' };
  assert.ok(weeklyLearningGpa(d, now).sample < 10);
  d.questions[0].reviewStatus = 'paused';
  d.questions[1].reviewStatus = 'paused';
  assert.equal(weeklyLearningGpa(d, now).value, null);
});
test('settings defend against malformed numbers and preserve all-zero subject selection', () => {
  const d = data();
  (d.settings as any).assistant = {
    dailyMinutes: Infinity,
    weights: { math: -10, chinese: 99, english: NaN },
  };
  const settings = assistantSettings(d);
  assert.equal(settings.dailyMinutes, 20);
  assert.equal(settings.weights.math, 0);
  assert.equal(settings.weights.chinese, 5);
  assert.equal(settings.weights.english, 3);
});

test('pinyin initial tests stay manual and completion does not fabricate objective GPA evidence', () => {
  const d = data([node('words', 'chinese')]);
  d.questions = d.questions.map((q) => ({
    ...q,
    type: 'pinyin',
    prompt: 'láng jí',
    answer: '狼藉',
    options: undefined,
  }));
  const rec = dailyStudyPlan(d, now).recommendations.find(
    (r) => r.mode === 'initial',
  );
  assert.ok(rec);
  assert.equal(rec.questions[0].question.type, 'pinyin');
  assert.match(rec.reason, /交卷后.*自评/);
  const e = event(d.questions[0], now - 86400000, 'self-test', 1, {
    source: 'self',
    answer: undefined,
    learningEvidence: { version: 1, assessment: 'self' },
  });
  d.events.push(e);
  d.tests.push({
    id: 'test-self',
    title: '初测',
    subject: 'chinese',
    sessionId: e.sessionId,
    at: e.occurredAt,
    scope: ['words'],
    eventIds: [e.id, 'not-scored-yet'],
  });
  assert.ok(
    dailyStudyPlan(d, now).recommendations.some((r) => r.mode === 'initial'),
  );
  d.tests[0].eventIds = [e.id];
  assert.ok(
    !dailyStudyPlan(d, now).recommendations.some((r) => r.mode === 'initial'),
  );
  assert.equal(weeklyLearningGpa(d, now).sample, 0);
  assert.equal(weeklyLearningGpa(d, now).value, null);
  assert.equal(dailyStudyPlan(d, now).skills[0].state, 'developing');
});
