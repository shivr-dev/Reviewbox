import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { renderToStaticMarkup } from 'react-dom/server';
import { switchAccount, loadData, put, installPack } from '../lib/store';
import {
  IMPORT_EXAMPLE,
  IMPORT_SKILL,
  parseImportText,
} from '../lib/import-skill';
import {
  isPinyin,
  objectiveScore,
  wrongQuestions,
  blindSpots,
  assertQuestionFormat,
} from '../lib/question-tools';
import {
  EXAM_FORMAT,
  examStages,
  allSlots,
  createRun,
  paperReady,
  stageSlots,
  nextStage,
  expireRun,
  type ExamPaper,
} from '../lib/exam-model';
import { gradeExam, newPaper, preparePaper } from '../lib/exam-client';
import {
  newAssessment,
  scoreAssessment,
  type AssessmentSession,
} from '../lib/assessment';
import { corePack, seedNodes, seedQuestions } from '../lib/seed';
import { buildQueue } from '../lib/engine';
import MathText from '../components/math-text';
import StudyView from '../components/study-view';
import AssessmentRoom from '../components/assessment-room';
import { ReviewContext } from '../components/review-context';
import {
  type Question,
  type StudyData,
  type AnswerEvent,
  localDay,
} from '../lib/model';
const now = Date.parse('2026-09-06T01:00:00Z');
const example = IMPORT_EXAMPLE.questions[0] as Question;
const empty: StudyData = {
  nodes: seedNodes,
  questions: [],
  events: [],
  jobs: [],
  exams: [],
  notes: [],
  materials: [],
  tests: [],
  packs: [],
  settings: { dailyMinutes: 20, name: 'Test learner', surprise: true },
};
const pinyin = { ...seedQuestions.find((q) => isPinyin(q))!, type: 'pinyin' };
const event = (q: Question, score: number, at = now): AnswerEvent => ({
  id: 'event-' + at,
  questionId: q.id,
  nodeId: q.nodeId,
  skillId: q.skillId,
  subject: q.subject,
  outcome: score === 1 ? 'correct' : score === 0 ? 'wrong' : 'unsure',
  score,
  source: 'self',
  occurredAt: new Date(at).toISOString(),
  displayedAt: new Date(at - 30000).toISOString(),
  revealedAt: new Date(at).toISOString(),
  activeThinkMs: 30000,
  expectedSeconds: 30,
  difficulty: 2,
  variant: q.variant,
  usedHint: false,
  reason: 'test',
  sessionId: 'test',
  localDay: localDay(new Date(at)),
  version: 1,
});
test('external AI skill contains a valid round-trip package and rejects malformed references', () => {
  const raw = '```json\n' + JSON.stringify(IMPORT_EXAMPLE) + '\n```';
  const parsed = parseImportText(raw);
  assert.equal(parsed.questions.length, 1);
  assert.equal(parsed.questions[0].verified, false);
  assert.ok(IMPORT_SKILL.includes('不提供汉字输入框'));
  const broken = structuredClone(IMPORT_EXAMPLE);
  broken.questions[0].nodeId = 'missing';
  assert.throws(() => parseImportText(JSON.stringify(broken)));
  assert.throws(() => parseImportText('{"schemaVersion":1'));
  assert.ok(isPinyin(parseImportText('沮丧 jǔ sàng').questions[0]));
});
test('matching scoring uses IDs, gives partial credit and rejects invalid answer mappings', () => {
  const q: Question = {
    ...example,
    type: 'matching',
    options: undefined,
    matching: {
      left: [
        { id: 'L1', text: 'a' },
        { id: 'L2', text: 'b' },
      ],
      right: [
        { id: 'R2', text: 'B' },
        { id: 'R1', text: 'A' },
      ],
    },
    answer: '{"L1":"R1","L2":"R2"}',
  };
  assert.doesNotThrow(() => assertQuestionFormat(q));
  assert.equal(objectiveScore(q, '{"L2":"R2","L1":"R1"}'), 1);
  assert.equal(objectiveScore(q, '{"L1":"R1"}'), 0.5);
  assert.equal(objectiveScore(q, 'bad'), 0);
  assert.throws(() =>
    assertQuestionFormat({ ...q, answer: '{"L1":"R1","L2":"R1"}' }),
  );
});
test('choice answers never pass by a shared prefix and numeric answers accept exact fractions', () => {
  assert.equal(
    objectiveScore(
      { ...example, options: ['AB correct', 'AB wrong'], answer: 'AB correct' },
      'AB wrong',
    ),
    0,
  );
  assert.equal(
    objectiveScore(
      { ...example, type: 'blank', options: undefined, answer: '0.5' },
      '1/2',
    ),
    1,
  );
  assert.equal(
    objectiveScore(
      { ...example, type: 'blank', options: undefined, answer: '-0.5' },
      '1/2',
    ),
    0,
  );
});
test('wrong notebook includes unsure pinyin and clears only after later successful assessment', () => {
  const data = {
    ...empty,
    questions: [pinyin],
    events: [{ ...event(pinyin, 0.5), predictedConfidence: 'sure' as const }],
  };
  assert.equal(wrongQuestions(data).length, 1);
  assert.equal(blindSpots(data).length, 1);
  data.events.push({
    ...event(pinyin, 1, now + 1000),
    predictedConfidence: 'sure',
  });
  assert.equal(wrongQuestions(data).length, 0);
  data.events.push({
    ...event(pinyin, 0, now + 2000),
    predictedConfidence: 'sure',
  });
  assert.equal(wrongQuestions(data).length, 1);
});
test('pinyin practice and test have no answer input and use different manual checking stages', () => {
  const session: AssessmentSession = {
    id: 'pinyin-render',
    items: [{ question: pinyin, priority: 1, reason: 'test' }],
    mode: 'review',
    title: '拼音测试',
  };
  const ctx: any = {
    data: { ...empty, questions: [pinyin] },
    states: {},
    refresh: async () => {},
    notify: () => {},
    start: () => {},
    aiReady: false,
  };
  const review = renderToStaticMarkup(
    <ReviewContext.Provider value={ctx}>
      <StudyView session={session} finish={() => {}} />
    </ReviewContext.Provider>,
  );
  assert.ok(review.includes('显示答案'));
  assert.ok(!review.includes('<textarea'));
  assert.ok(!review.includes('value="' + pinyin.answer + '"'));
  const testHtml = renderToStaticMarkup(
    <ReviewContext.Provider value={ctx}>
      <AssessmentRoom
        session={{ ...session, mode: 'test' }}
        finish={() => {}}
      />
    </ReviewContext.Provider>,
  );
  assert.ok(testHtml.includes('完成回忆'));
  assert.ok(testHtml.includes('交卷后显示标准答案'));
  assert.ok(!testHtml.includes('<textarea'));
});
test('math rendering supports both inline and display LaTeX and escapes hostile text', () => {
  const html = renderToStaticMarkup(
    <MathText>
      {'Inline $x^2$ and $$\\frac{1}{2}$$ <script>alert(1)</script>'}
    </MathText>,
  );
  assert.ok(html.includes('katex'));
  assert.ok(html.includes('math-display'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  const unsafe = renderToStaticMarkup(
    <MathText>{'$\\href{javascript:alert(1)}{bad}$'}</MathText>,
  );
  assert.ok(!unsafe.includes('href="javascript:'));
});
function fixture(exam: 'SAT' | 'ACT', writing = false) {
  const paper: ExamPaper = {
    id: 'paper-' + exam + '-' + writing,
    kind: 'exam-paper',
    format: EXAM_FORMAT,
    exam,
    options: { writing },
    createdAt: new Date(now).toISOString(),
    status: 'ready',
    questions: {},
    passages: {},
  };
  const qs = allSlots(paper).map((s) => {
    const q = {
      ...example,
      id: 'q-' + paper.id + '-' + s.id,
      subject: 'ce' as const,
      nodeId: 'ce-fixture',
      skillId: 'apply',
      type: s.type,
      answer: 'A',
      options: s.type === 'choice' ? ['A', 'B', 'C', 'D'] : undefined,
      rubric:
        s.type === 'subjective'
          ? [
              {
                id: 'writing',
                title: 'Writing',
                max: 6,
                description: 'clear',
                skillId: 'apply',
              },
            ]
          : undefined,
      verified: true,
      tags: ['exam-only'],
    };
    paper.questions[s.id] = q.id;
    return q;
  });
  return { paper, qs };
}
test('English-only blueprints include full sections, ACT writing optional and shared passage sets', () => {
  const sat = examStages('SAT', { writing: false });
  assert.deepEqual(
    sat.map((s) => [s.count, s.seconds, s.breakAfter]),
    [
      [27, 1920, 0],
      [27, 1920, 0],
    ],
  );
  assert.equal(sat.flatMap((s) => s.slots).length, 81);
  assert.ok(sat.every((s) => s.section === 'Reading and Writing'));
  const act = examStages('ACT', { writing: false });
  assert.deepEqual(
    act.map((s) => [s.section, s.count, s.seconds]),
    [
      ['English', 50, 2100],
      ['Reading', 36, 2400],
    ],
  );
  assert.deepEqual(
    [...new Set(act[0].slots.map((s) => s.group))].map(
      (g) => act[0].slots.filter((s) => s.group === g).length,
    ),
    [10, 10, 10, 10, 5, 5],
  );
  assert.equal(new Set(act[1].slots.map((s) => s.group)).size, 4);
  const writing = examStages('ACT', { writing: true });
  assert.equal(writing[1].breakAfter, 300);
  assert.equal(writing[2].seconds, 2400);
  assert.equal(writing[2].count, 1);
});
test('paper readiness rejects legacy formats and missing local verified questions', () => {
  const { paper, qs } = fixture('SAT');
  assert.equal(paperReady(paper, qs), true);
  assert.equal(paperReady(paper, qs.slice(1)), false);
  assert.equal(paperReady({ ...paper, format: undefined } as any), false);
  assert.throws(() => createRun({ ...paper, format: undefined } as any));
});
test('SAT locks completed modules and routes once; expired exams cannot gain time on reload', () => {
  const { paper, qs } = fixture('SAT');
  let run = createRun(paper, now);
  for (const s of stageSlots(paper, run).slice(0, 20)) run.answers[s.id] = 'A';
  run = nextStage(paper, run, qs, now + 1920000);
  assert.equal(run.stage, 1);
  assert.equal(run.routes[1], 'higher');
  assert.equal(stageSlots(paper, run).length, 27);
  assert.ok(stageSlots(paper, run).every((s) => s.route === 'higher'));
  const done = expireRun(paper, run, qs, now + 10 * 86400000);
  assert.equal(done.status, 'complete');
  assert.equal(Date.parse(done.completedAt!), now + 3840000);
  assert.equal(nextStage(paper, done, qs), done);
});
test('ACT writing break advances automatically and English-only total clock is bounded', () => {
  const { paper, qs } = fixture('ACT', true);
  const run = createRun(paper, now);
  const duringBreak = expireRun(paper, run, qs, now + 75 * 60000 + 1000);
  assert.equal(duringBreak.status, 'break');
  assert.equal(duringBreak.deadline, now + 80 * 60000);
  const writing = expireRun(paper, duringBreak, qs, now + 80 * 60000);
  assert.equal(writing.stage, 2);
  assert.equal(writing.status, 'active');
  assert.equal(
    expireRun(paper, writing, qs, now + 120 * 60000).status,
    'complete',
  );
});
test('ordinary pinyin test defers mastery until post-test manual check and is idempotent', async () => {
  await switchAccount('assessment-self-check');
  const session: AssessmentSession = {
    id: 'manual-test',
    items: [{ question: pinyin, reason: 'test', priority: 1 }],
    mode: 'test',
    title: '字形测试',
  };
  const draft = {
    ...newAssessment(session),
    status: 'grading' as const,
    submittedAt: new Date(now).toISOString(),
    completedQuestions: [pinyin.id],
    times: { [pinyin.id]: 32000 },
  };
  let next = await scoreAssessment(session, draft);
  assert.equal((await loadData()).events.length, 0);
  assert.equal(next.status, 'grading');
  next = await scoreAssessment(session, next, {
    questionId: pinyin.id,
    outcome: 'wrong',
  });
  const data = await loadData();
  assert.equal(data.events.length, 1);
  assert.equal(data.events[0].answer, undefined);
  assert.equal(data.events[0].activeThinkMs, 32000);
  assert.equal(data.events[0].score, 0);
  assert.equal(next.status, 'complete');
  await scoreAssessment(session, next, {
    questionId: pinyin.id,
    outcome: 'correct',
  });
  assert.equal((await loadData()).events[0].score, 0);
});
test('submitted SAT scores exactly 54 answers once, and exam-only questions are not leaked into practice', async () => {
  await switchAccount('exam-scoring');
  const { paper, qs } = fixture('SAT');
  for (const q of qs) await put('question', q);
  let run = createRun(paper, now);
  for (const s of stageSlots(paper, run)) run.answers[s.id] = 'A';
  run = nextStage(paper, run, qs, now + 1920000);
  for (const s of stageSlots(paper, run)) run.answers[s.id] = 'A';
  run = nextStage(paper, run, qs, now + 3840000);
  await gradeExam(paper, run, () => {});
  await gradeExam(paper, run, () => {});
  const data = await loadData();
  assert.equal(data.events.length, 54);
  assert.ok(data.events.every((e) => e.score === 1));
  assert.equal(data.tests[0].subject, 'ce');
  assert.equal(
    buildQueue({ ...empty, questions: qs }, { practice: true }).length,
    0,
  );
});
test('paper preparation checkpoints survive interruption and ignore completed slots on resume', async () => {
  await switchAccount('exam-prepare');
  const oldFetch = globalThis.fetch;
  const paper = await newPaper('SAT', { writing: false });
  const slots = allSlots(paper);
  for (const s of slots.slice(3)) {
    const q = {
      ...example,
      id: 'existing-' + s.id,
      subject: 'ce' as const,
      verified: true,
    };
    await put('question', q);
    paper.questions[s.id] = q.id;
  }
  await put('job', paper);
  let generateCalls = 0,
    solveCalls = 0;
  globalThis.fetch = async (_u, init) => {
    const b = JSON.parse(String(init?.body));
    if (b.action === 'generate') {
      generateCalls++;
      return Response.json({
        questions: b.slots.map((slotId: string) => ({
          slotId,
          question: { ...example, id: 'generated-' + slotId, subject: 'ce' },
        })),
      });
    }
    if (b.action === 'solve') {
      solveCalls++;
      if (solveCalls === 1) throw new Error('temporary network failure');
      return Response.json({
        solutions: b.questions.map((q: any) => ({
          slotId: q.slotId,
          answer: q.question.answer,
          wellPosed: true,
          unique: true,
          steps: ['checked'],
          optionChecks: [
            { index: 1, correct: true, reason: 'right' },
            { index: 2, correct: false, reason: 'wrong' },
            { index: 3, correct: false, reason: 'wrong' },
            { index: 4, correct: false, reason: 'wrong' },
          ],
        })),
      });
    }
    return Response.json({ pass: true, reason: 'verified' });
  };
  try {
    let prepared = await preparePaper(paper, () => {}, { current: false });
    assert.equal(paperReady(prepared), false);
    prepared = await preparePaper(prepared, () => {}, { current: false });
    assert.equal(paperReady(prepared), true);
    assert.equal(generateCalls, 1);
    assert.equal(solveCalls, 2);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
import { shuffleMatching } from '../lib/matching';
import { completeActiveSession } from '../lib/store';
test('numeric grading accepts rendered LaTeX fractions without changing signs or values', () => {
  const q = {
    ...example,
    type: 'blank',
    options: undefined,
    answer: '$\\frac{1}{2}$',
  };
  assert.equal(objectiveScore(q, '0.5'), 1);
  assert.equal(
    objectiveScore({ ...q, answer: '\\(x=\\dfrac{-1}{2}\\)' }, '-0.5'),
    1,
  );
  assert.equal(objectiveScore(q, '-0.5'), 0);
  assert.equal(objectiveScore(q, '0.5001'), 0);
});
test('matching shuffling retains semantic answers and removes parallel order and ID clues', () => {
  const q: Question = {
    ...example,
    type: 'matching',
    options: undefined,
    matching: {
      left: [
        { id: 'left-a', text: 'Alpha' },
        { id: 'left-b', text: 'Beta' },
        { id: 'left-c', text: 'Gamma' },
      ],
      right: [
        { id: 'answer-a', text: 'First' },
        { id: 'answer-b', text: 'Second' },
        { id: 'answer-c', text: 'Third' },
      ],
    },
    answer: '{"left-a":"answer-a","left-b":"answer-b","left-c":"answer-c"}',
  };
  const shuffled = shuffleMatching(q);
  assertQuestionFormat(shuffled);
  const answers = JSON.parse(shuffled.answer);
  const expected = ['First', 'Second', 'Third'];
  assert.ok(
    shuffled.matching!.left.some(
      (l, i) => answers[l.id] !== shuffled.matching!.right[i].id,
    ),
  );
  shuffled.matching!.left.forEach((l, i) => {
    assert.equal(
      shuffled.matching!.right.find((r) => r.id === answers[l.id])?.text,
      expected[i],
    );
  });
  assert.equal(objectiveScore(shuffled, shuffled.answer), 1);
});
test('older test completion cannot overwrite a newer active session, and the full assessment remains resumable', async () => {
  await switchAccount('assessment-resume-history');
  await put(
    'job',
    { id: 'new-session', kind: 'session', status: 'active', items: [] },
    'active-session',
  );
  await completeActiveSession('old-session');
  assert.equal(
    (await loadData()).jobs!.find((j) => j.kind === 'session')!.status,
    'active',
  );
  const session: AssessmentSession = {
    id: 'old-test',
    items: [{ question: pinyin, reason: 'test', priority: 1 }],
    mode: 'test',
    title: 'Pending pinyin',
  };
  const draft = {
    ...newAssessment(session),
    status: 'grading' as const,
    submittedAt: new Date(now).toISOString(),
  };
  await scoreAssessment(session, draft);
  const saved = (await loadData()).jobs!.find((j) => j.id === draft.id)!;
  assert.equal(saved.session.items[0].question.id, pinyin.id);
  assert.equal(saved.status, 'grading');
  await scoreAssessment(saved.session, saved, {
    questionId: pinyin.id,
    outcome: 'wrong',
  });
  assert.equal(
    (await loadData()).jobs!.find((j) => j.kind === 'session')!.id,
    'new-session',
  );
});
test('preparation and grading reject a changed account before writing', async () => {
  await switchAccount('origin-check');
  const paper = await newPaper('SAT', { writing: false });
  await switchAccount('different-check');
  await assert.rejects(
    () => preparePaper(paper, () => {}, { current: false }, 'origin-check'),
    /账户已切换/,
  );
  await assert.rejects(
    () =>
      gradeExam(paper, { status: 'complete' } as any, () => {}, 'origin-check'),
    /账户已切换/,
  );
  assert.equal((await loadData()).questions.length, 0);
});
import {
  createCourse,
  courseCall,
  prepareCourse,
  prepareFreeCoursePractice,
  saveCourse,
  recordCourseCheck,
} from '../lib/course-client';
import {
  courseFingerprint,
  splitCourseSource,
  validateCourseContent,
  courseQuestions,
  replaceCourseSection,
  type CourseContent,
} from '../lib/course-model';
import CourseRoom from '../components/course-room';
import CourseHub from '../components/course-hub';
import { courseErrorMessage } from '../lib/course-errors';
import { reconcileCourseQuotes } from '../lib/course-sources';
import { CourseSources, CourseStudyTools } from '../components/course-tools';
const courseSource = '细胞膜控制物质进出。细胞核含有遗传物质。';
function shortHtmlLesson() {
  return {
    format: 'interactive-html',
    title: '细胞结构',
    html: '<main><h1>细胞结构</h1><p>' + courseSource.repeat(5) + '</p></main>',
    checks: Array.from({ length: 4 }, (_, i) => ({
      prompt: '检验 ' + i,
      options: ['细胞膜', '细胞核', '液泡', '细胞壁'],
      answer: '细胞膜',
      explanation: '细胞膜控制物质进出。',
      skill: 'understand',
    })),
    practice: Array.from({ length: 5 }, (_, i) => ({
      prompt: '练习 ' + i,
      answer: '细胞膜',
      explanation: '细胞膜控制物质进出。',
      skill: 'apply',
      solution: Array.from({ length: 7 }, (_, n) => '推理步骤 ' + n),
    })),
    sourceQuotes: [courseSource],
  };
}
test('source matching tolerates typography while preserving negation, numbers and formulas', () => {
  assert.equal(
    reconcileCourseQuotes(['细胞膜控制物质进出。'], '细胞膜\n控制物质进出.')
      .matched.length,
    1,
  );
  assert.equal(
    reconcileCourseQuotes(['“细胞核”，含遗传物质。'], '"细胞核",含遗传物质.')
      .matched.length,
    1,
  );
  for (const [quote, source] of [
    ['can not pass', 'cannot pass'],
    ['质量为 5 g', '质量为 50 g'],
    ['x²', 'x2'],
    ['不需要氧气', '需要氧气'],
  ])
    assert.equal(reconcileCourseQuotes([quote], source).unmatched.length, 1);
});
test('unmatched interactive quotations remain visibly unverified without discarding the lesson', () => {
  const lesson = shortHtmlLesson();
  lesson.sourceQuotes = [courseSource, '细胞壁控制物质进出。'];
  const content = validateCourseContent(lesson, courseSource);
  assert.equal(content.html, lesson.html);
  assert.deepEqual(content.sourceQuotes, [courseSource]);
  assert.ok('sourceWarnings' in content);
  assert.deepEqual(content.sourceWarnings, ['细胞壁控制物质进出。']);
  assert.deepEqual(validateCourseContent(content, courseSource), content);
  const html = renderToStaticMarkup(
    <CourseSources content={content} source={courseSource} />,
  );
  assert.match(html, /待核对/);
  assert.match(html, /不能作为教材依据/);
  assert.match(html, /本节原始资料/);
  const missing = validateCourseContent(
    { ...lesson, sourceQuotes: [] },
    courseSource,
  );
  assert.match(
    renderToStaticMarkup(
      <CourseSources content={missing} source={courseSource} />,
    ),
    /未提供可对应的引文/,
  );
});
test('personal course bookmarks and memos persist separately from learning evidence', async () => {
  await switchAccount('course-study-tools');
  const { course } = await createCourse(
    'biology',
    '书签课程',
    courseSource,
    [],
  );
  course.sections[0].content = validateCourseContent(
    shortHtmlLesson(),
    courseSource,
  );
  course.sections[0].bookmarked = true;
  course.sections[0].studyMemo = '需要区分细胞膜和细胞壁。';
  const eventsBefore = (await loadData()).events.length;
  await saveCourse(course);
  const restored = (await loadData()).jobs!.find((j) => j.id === course.id)!;
  assert.equal(restored.sections[0].bookmarked, true);
  assert.equal(restored.sections[0].studyMemo, course.sections[0].studyMemo);
  assert.equal((await loadData()).events.length, eventsBefore);
  const html = renderToStaticMarkup(
    <CourseStudyTools section={restored.sections[0]} onSave={async () => {}} />,
  );
  assert.match(html, /aria-pressed="true"/);
  assert.match(html, /需要区分细胞膜和细胞壁/);
  const ctx: any = { data: { ...empty, jobs: [restored] }, aiReady: true };
  assert.match(
    renderToStaticMarkup(
      <ReviewContext.Provider value={ctx}>
        <CourseHub subject="biology" />
      </ReviewContext.Provider>,
    ),
    /type="search"/,
  );
});
test('interactive metadata accepts concise answers and preserves extended non-math reasoning', () => {
  const content = validateCourseContent(shortHtmlLesson(), courseSource);
  assert.equal(content.checks.length, 4);
  assert.equal(content.practice.length, 5);
  assert.equal(content.practice[1].answer, '细胞膜');
  assert.equal(content.practice[1].solution?.length, 7);
  for (const field of ['answer', 'explanation'] as const) {
    const broken = shortHtmlLesson();
    broken.practice[0][field] = '   ';
    assert.throws(
      () => validateCourseContent(broken, courseSource),
      (error: any) => {
        assert.match(error.message, /第 1 道巩固练习/);
        assert.doesNotMatch(error.message, /invalid_union|too_small/);
        return true;
      },
    );
  }
  const duplicate = shortHtmlLesson();
  duplicate.checks[0].options[1] = ' 细胞膜 ';
  assert.throws(() => validateCourseContent(duplicate, courseSource), /选项/);
});
test('course requests translate validator dumps, timeouts, network and non-JSON failures', async () => {
  const fetchBefore = globalThis.fetch;
  const raw = '[{"code":"invalid_union","errors":[]}]';
  try {
    for (const [response, pattern] of [
      [() => Response.json({ error: raw }, { status: 422 }), /格式检查/],
      [
        () => new Response('<html>502</html>', { status: 502 }),
        /未返回有效内容/,
      ],
      [
        () => {
          throw new DOMException('timeout', 'TimeoutError');
        },
        /响应超时/,
      ],
      [
        () => {
          throw new TypeError('Failed to fetch');
        },
        /检查网络/,
      ],
    ] as const) {
      globalThis.fetch = (async () => response()) as typeof fetch;
      await assert.rejects(courseCall({ action: 'generate' }), pattern);
    }
    assert.doesNotMatch(courseErrorMessage(raw), /invalid_union/);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
test('failed course generation keeps source and saved sections, resumes only missing sections, and displays old errors safely', async () => {
  await switchAccount('course-failure-regression');
  const fetchBefore = globalThis.fetch;
  const { course } = await createCourse(
    'biology',
    '细胞课程',
    courseSource,
    [],
  );
  const savedSection = {
    ...course.sections[0],
    id: 'saved-section',
    content: validateCourseContent(shortHtmlLesson(), courseSource),
  };
  course.sections.unshift(savedSection);
  await saveCourse(course);
  let calls = 0;
  try {
    globalThis.fetch = (async () => {
      calls++;
      return Response.json(
        { error: '[{"code":"invalid_union","errors":[]}]' },
        { status: 422 },
      );
    }) as typeof fetch;
    await assert.rejects(
      prepareCourse(course, () => {}, { current: false }),
      /格式检查/,
    );
    const retained = (await loadData()).jobs!.find((j) => j.id === course.id)!;
    assert.equal(retained.source, courseSource);
    assert.deepEqual(retained.sections[0].content, savedSection.content);
    assert.equal(calls, 1);
    // Legacy persisted dumps also become a readable persistent alert after reload.
    retained.sections[1].error = '[{"code":"invalid_union","errors":[]}]';
    const ctx: any = { data: { ...empty, jobs: [retained] }, aiReady: true };
    const html = renderToStaticMarkup(
      <ReviewContext.Provider value={ctx}>
        <CourseHub subject="biology" />
      </ReviewContext.Provider>,
    );
    assert.match(html, /role="alert"/);
    assert.match(html, /格式检查/);
    assert.doesNotMatch(html, /invalid_union/);
    globalThis.fetch = (async () => {
      calls++;
      return Response.json({ content: shortHtmlLesson() });
    }) as typeof fetch;
    const ready = await prepareCourse(course, () => {}, { current: false });
    assert.equal(ready.status, 'ready');
    assert.equal(calls, 2);
    assert.equal(ready.sections[1].error, undefined);
  } finally {
    globalThis.fetch = fetchBefore;
  }
});
function lessonFixture(): CourseContent {
  return {
    title: '细胞结构',
    objectives: ['解释细胞膜的功能', '比较细胞膜与细胞核'],
    concepts: [0, 1].map((i) => ({
      title: i ? '细胞核' : '细胞膜',
      explanation:
        '细胞的结构与功能相适应，需要结合不同物质进出的实际过程理解控制作用。'.repeat(
          8,
        ),
      why: '生物体通过不同结构协作维持正常的生命活动，因此需要建立结构与功能之间的具体联系。',
      example: {
        prompt: '为什么有些物质可以通过细胞膜？',
        steps: [
          '首先识别细胞膜所处的位置与边界。',
          '接着比较不同物质通过边界的条件。',
          '最后联系维持细胞内部环境的作用。',
        ],
        answer: '细胞膜能够有选择地控制物质进出。',
      },
      misconception: '所有物质都能任意通过细胞膜。',
      correction:
        '并非所有物质都可以任意通过细胞膜，物质进出受到细胞膜结构与相关机制的控制。',
    })),
    comparison: {
      title: '结构与功能对照',
      columns: ['结构', '功能', '联系'],
      rows: [
        ['细胞膜', '控制进出', '物质交换'],
        ['细胞核', '遗传信息', '生命活动'],
      ],
    },
    process: {
      title: '观察与分析',
      steps: [1, 2, 3].map((i) => ({
        title: '分析步骤 ' + i,
        explanation:
          '按照观察、比较和归纳的过程，结合具体细胞结构提出解释，并核对解释是否符合所提供的教材依据。',
      })),
    },
    checks: [0, 1, 2].map((i) => ({
      prompt: '哪个结构与控制物质进出有关？' + i,
      options: ['细胞膜', '细胞核', '液泡', '细胞壁'],
      answer: '细胞膜',
      explanation:
        '细胞膜控制物质进出，是细胞与外界进行物质交换的重要边界；细胞核主要与遗传信息有关，而其他两个选项不能替代细胞膜的功能。',
      skill: 'understand',
    })),
    practice: [0, 1].map((i) => ({
      prompt: '请结合一个日常实例解释细胞膜的作用。' + i,
      answer:
        '可以结合细胞吸收营养物质并排出代谢产物的实例，说明细胞膜控制物质进出。',
      explanation:
        '说明时需要明确输入与输出的物质，再解释细胞膜为什么不是完全封闭的墙壁，也不是任意开放的边界。这样才建立了结构与功能的联系。',
      skill: 'apply',
    })),
    recall: [
      '不看教材，说明细胞膜有哪些作用。',
      '通过比较，说明细胞核与细胞膜的区别。',
    ],
    sourceQuotes: [courseSource],
    uncertainties: [],
  };
}
test('course source splitting preserves all source text and rejects oversized inputs', async () => {
  const source = '光合作用的条件与产物。\n'.repeat(600);
  assert.equal(splitCourseSource(source).join(''), source.trim());
  assert.throws(() => splitCourseSource('中'.repeat(60001)));
  assert.equal(
    await courseFingerprint('biology', '细胞\r\n结构'),
    await courseFingerprint('biology', '细胞\n结构'),
  );
});
test('course content validates source provenance and unambiguous choices', () => {
  const c = lessonFixture();
  assert.doesNotThrow(() => validateCourseContent(c, courseSource));
  assert.throws(() =>
    validateCourseContent(
      { ...c, sourceQuotes: ['不存在的教材原文'] },
      courseSource,
    ),
  );
  assert.throws(() =>
    validateCourseContent(
      { ...c, checks: c.checks.map((q) => ({ ...q, answer: '不存在' })) },
      courseSource,
    ),
  );
});
test('same material reuses a course; revisions and checks preserve previous immutable learning evidence', async () => {
  await switchAccount('course-reuse');
  const { course } = await createCourse('biology', '细胞', courseSource, []);
  assert.equal(
    (await createCourse('biology', '另一个标题', courseSource, [])).course.id,
    course.id,
  );
  const s = course.sections[0];
  s.content = lessonFixture();
  s.title = s.content.title;
  course.status = 'ready';
  await saveCourse(course);
  const q = courseQuestions(course, s, 'checks')[0];
  await recordCourseCheck(course, q, '细胞核', now);
  await recordCourseCheck(course, q, q.answer, now);
  assert.equal((await loadData()).events[0].score, 0);
  const updated = replaceCourseSection(course, s.id, {
    ...s.content,
    title: '细胞 · 补充解释',
  });
  await saveCourse(updated);
  assert.equal(updated.sections[0].history.length, 1);
  assert.notEqual(
    courseQuestions(updated, updated.sections[0], 'checks')[0].id,
    q.id,
  );
  assert.equal((await loadData()).events[0].questionId, q.id);
  assert.equal(updated.sections[0].passed.length, 0);
  assert.ok(
    !buildQueue(await loadData(), { practice: true }).some((i) =>
      i.question.tags.includes('course-check'),
    ),
  );
});
test('interactive course renderer escapes source and model HTML instead of executing it', async () => {
  await switchAccount('course-html');
  const { course } = await createCourse(
    'biology',
    '安全课程',
    courseSource,
    [],
  );
  course.sections[0].content = {
    ...lessonFixture(),
    title: '<script>alert(1)</script>',
  };
  const ctx: any = {
    data: { ...empty, jobs: [course] },
    refresh: async () => {},
    notify: () => {},
    navigate: () => {},
    start: () => {},
    aiReady: false,
  };
  const html = renderToStaticMarkup(
    <ReviewContext.Provider value={ctx}>
      <CourseRoom courseId={course.id} />
    </ReviewContext.Provider>,
  );
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  assert.ok(html.includes('课程答疑'));
  assert.ok(html.includes('检查答案'));
});
import {
  buildCourseDocument,
  practiceEligibility,
  assertCourseHTML,
} from '../lib/course-html';
test('free HTML has no metadata requirements and preserves document attributes, styles and scripts verbatim', () => {
  const html =
    '<!doctype html><html lang="zh" class="lab" data-scene="cell"><head><style>html.lab body{margin:0} @keyframes membrane{to{transform:translateX(20px)}} .cell{animation:membrane 4s infinite}</style></head><body class="biology" onload="boot()"><canvas id="lab"></canvas><script>function boot(){document.querySelector("#lab").dataset.ready="yes"}</script></body></html>';
  const content = validateCourseContent(
    { format: 'free-html', title: '细胞', html },
    '细胞',
  );
  assert.equal(content.html, html);
  assert.equal(content.checks.length, 0);
  assert.equal(content.practice.length, 0);
  const doc = buildCourseDocument(html, 'free-doc', true);
  assert.ok(
    doc.startsWith(
      '<!doctype html><html lang="zh" class="lab" data-scene="cell"><head>',
    ),
  );
  assert.ok(doc.endsWith(html.slice(html.indexOf('<style>'))));
  assert.ok(
    doc.indexOf('window.ReviewCourse') < doc.indexOf('function boot()'),
  );
  assert.ok(!doc.includes('animation-duration:.01ms!important'));
  assert.ok(!doc.includes('max-width:100%'));
  assert.equal(practiceEligibility(0, [], true).allowed, true);
  assert.throws(
    () =>
      assertCourseHTML(
        '<meta http-equiv="refresh" content="0;url=https://example.com">',
      ),
    /安全检查/,
  );
  assert.throws(
    () =>
      assertCourseHTML(
        '<script>window.location.href="https://example.com"</script>',
      ),
    /安全检查/,
  );
});
test('free course practice reuses verified cached questions without regenerating the lesson or awarding mastery', async () => {
  await switchAccount('free-course-practice');
  const { course } = await createCourse(
    'biology',
    '细胞',
    '细胞膜控制物质进出。',
    [],
  );
  course.sections[0].content = validateCourseContent(
    { format: 'free-html', title: '细胞', html: '<canvas></canvas>' },
    course.source,
  );
  await saveCourse(course);
  const q = {
    ...example,
    id: 'free-cached-question',
    nodeId: 'lesson-node:' + course.sections[0].id,
    subject: 'biology' as const,
    verified: true,
  };
  await put('question', q, q.id);
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error('Unexpected AI call');
  };
  try {
    const practice = await prepareFreeCoursePractice(course, () => {});
    assert.equal(practice[0].id, q.id);
    assert.equal((await loadData()).events.length, 0);
    const courseAgain = (await loadData()).jobs!.find(
      (j) => j.id === course.id,
    )!;
    assert.equal(courseAgain.sections[0].content.html, '<canvas></canvas>');
    assert.equal(courseAgain.sections[0].verification, undefined);
  } finally {
    globalThis.fetch = oldFetch;
  }
});
import HtmlCourse from '../components/html-course';
import {
  clearAllStudyData,
  currentNamespace,
  getMeta,
  setMeta,
  syncCloud,
  allRecords,
} from '../lib/store';
test('independent HTML lessons accept custom animations and variable checks without the old teaching template', () => {
  const content = validateCourseContent(
    {
      ...lessonFixture(),
      format: 'interactive-html',
      html: '<style>@keyframes move{to{transform:translateX(30px)}}</style><main><canvas id="demo"></canvas><button>改变条件</button></main>',
      checks: [lessonFixture().checks[0]],
    },
    courseSource,
  );
  assert.equal(content.format, 'interactive-html');
  assert.equal(content.concepts.length, 0);
  assert.equal(content.checks.length, 1);
  assert.ok(content.html?.includes('canvas'));
  assert.deepEqual(practiceEligibility(2, [0, 0, 999]), {
    allowed: false,
    remaining: 1,
  });
  assert.deepEqual(practiceEligibility(2, [0, 1]), {
    allowed: true,
    remaining: 0,
  });
  assert.equal(practiceEligibility(0, []).allowed, false);
});
test('interactive documents expose the learning bridge inside an isolated iframe and block external resources', () => {
  const html =
    '<html><head><meta http-equiv="refresh" content="0;url=https://bad.invalid"><script src="https://bad.invalid/a.js"></script></head><body><style>@keyframes pulse{to{opacity:.4}}</style><canvas></canvas><script>document.body.dataset.ready="yes";</script></body></html>';
  const doc = buildCourseDocument(html, 'test-channel');
  assert.ok(doc.includes('window.ReviewCourse'));
  assert.ok(doc.includes("connect-src 'none'"));
  assert.ok(doc.includes('@keyframes pulse'));
  assert.ok(!doc.includes('bad.invalid'));
  const rendered = renderToStaticMarkup(
    <HtmlCourse
      html={'<html><head></head><body><canvas></canvas></body></html>'}
      title="测试课件"
      checks={[]}
      passed={[]}
      onCheck={async () => {}}
      onState={async () => {}}
      onPractice={async () => {}}
      onAsk={() => {}}
    />,
  );
  assert.ok(rendered.includes('sandbox="allow-scripts"'));
  assert.ok(!rendered.includes('allow-same-origin'));
});
test('a cloud reset is detected before uploading an older local queue', async () => {
  await switchAccount('reset-generation-check');
  await put('note', { id: 'stale-note', body: 'old' }, 'stale-note');
  await setMeta('generation:reset-generation-check', 'old-generation');
  const oldFetch = globalThis.fetch;
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init?.method === 'POST') writes++;
    return String(url).includes('account')
      ? Response.json({ user: { id: 'reset-generation-check' } })
      : Response.json({
          generation: 'new-generation',
          resetAt: new Date().toISOString(),
        });
  };
  try {
    await syncCloud();
    assert.equal(writes, 0);
    assert.equal((await allRecords()).length, 0);
    assert.equal(
      await getMeta('generation:reset-generation-check'),
      'new-generation',
    );
  } finally {
    globalThis.fetch = oldFetch;
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else delete (navigator as any).onLine;
  }
});
test('clearing removes current and guest data only after cloud confirmation, while preserving other accounts', async () => {
  await switchAccount(null);
  await put(
    'note',
    { id: 'guest-clear-test', body: 'guest' },
    'guest-clear-test',
  );
  await switchAccount('clear-other');
  await put(
    'note',
    { id: 'other-clear-test', body: 'other' },
    'other-clear-test',
  );
  await switchAccount('clear-owner');
  await put(
    'note',
    { id: 'owner-clear-test', body: 'owner' },
    'owner-clear-test',
  );
  await assert.rejects(() => clearAllStudyData('wrong-account'), /账户已切换/);
  const oldFetch = globalThis.fetch;
  const online = Object.getOwnPropertyDescriptor(navigator, 'onLine');
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  });
  let fail = true;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes('reset')) {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.confirmation, '清理所有数据');
      if (fail)
        return Response.json({ error: 'Cloud unavailable' }, { status: 503 });
      return Response.json({ generation: 'reset-success' });
    }
    return Response.json({ generation: 'original-generation' });
  };
  try {
    await assert.rejects(() => clearAllStudyData(), /Cloud unavailable/);
    assert.ok((await allRecords()).some((r) => r.id === 'owner-clear-test'));
    fail = false;
    await clearAllStudyData();
    assert.equal((await allRecords()).length, 0);
    assert.equal((await allRecords('local')).length, 0);
    assert.ok(
      (await allRecords('clear-other')).some(
        (r) => r.id === 'other-clear-test',
      ),
    );
    assert.equal(await getMeta('generation:clear-owner'), 'reset-success');
    assert.equal(currentNamespace(), 'clear-owner');
  } finally {
    globalThis.fetch = oldFetch;
    if (online) Object.defineProperty(navigator, 'onLine', online);
    else delete (navigator as any).onLine;
  }
});
