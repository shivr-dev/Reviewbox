import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { MAP_TEMPLATES, mapTemplate } from '../lib/map-templates';
import {
  parseExamPackage,
  installExamImport,
  smartExamText,
} from '../lib/exam-import';
import { createMapRun, advanceMap, mapAnswered } from '../lib/map-model';
import {
  examStages,
  stageSlots,
  expireRun,
  paperReady,
} from '../lib/exam-model';
import { objectiveScore } from '../lib/question-tools';
import { put, loadData, switchAccount } from '../lib/store';
import { gradeExam } from '../lib/exam-client';
import { EXAM_IMPORT_SKILL } from '../lib/exam-skill';

test('all six MAP templates import, link skills and grade actual responses without AI', async () => {
  for (const type of Object.keys(MAP_TEMPLATES)) {
    const parsed = await parseExamPackage(
        mapTemplate(type, 'Language Usage', 8),
      ),
      q = parsed.questions[0];
    assert.equal(q.examTask?.type, type);
    assert.equal(parsed.paper.exam, 'MAP');
    assert.equal(parsed.paper.options.mapSection, 'Language Usage');
    assert.equal(examStages('MAP', parsed.paper.options)[0].seconds, 0);
    assert.equal(paperReady(parsed.paper, parsed.questions), true);
    assert.ok(
      parsed.nodes
        .find((n) => n.id === q.nodeId)
        ?.skills.some((s) => s.id === q.skillId),
    );
    assert.equal(objectiveScore(q, q.answer), 1);
    assert.equal(objectiveScore(q, 'wrong'), 0);
    assert.equal(mapAnswered(q, ''), false);
    assert.equal(mapAnswered(q, q.answer), true);
    if (type === 'multi_select') {
      assert.equal(
        objectiveScore(q, JSON.stringify(JSON.parse(q.answer).reverse())),
        1,
      );
      assert.equal(
        objectiveScore(q, JSON.stringify([JSON.parse(q.answer)[0]])),
        0,
      );
    }
    if (type === 'two_part')
      assert.equal(
        objectiveScore(q, JSON.stringify([JSON.parse(q.answer)[0], 'wrong'])),
        0,
      );
  }
  assert.ok(EXAM_IMPORT_SKILL.includes('MAP'));
  assert.ok(EXAM_IMPORT_SKILL.includes('testCount'));
});
test('smart numbered text imports into selected MAP subject without a model call', async () => {
  const parsed = await smartExamText(
    '1. Which verb agrees?\nA. walk\nB. walks\n答案：A\n解析：The plural subject takes walk.',
    'MAP',
    'Language Usage',
    9,
  );
  assert.equal(parsed.questions[0].answer, 'walk');
  assert.equal(parsed.paper.options.mapSection, 'Language Usage');
  assert.equal(parsed.paper.options.grade, 9);
});
test('invalid MAP imports fail before saving', async () => {
  const raw = JSON.parse(mapTemplate('gap_match'));
  raw.sectionsInline.map.questions[0].passage = 'No blank.';
  await assert.rejects(() => parseExamPackage(raw), /拖放题/);
  const tooMany = JSON.parse(mapTemplate('mcq'));
  tooMany.testCount = 43;
  await assert.rejects(() => parseExamPackage(tooMany), /不能超过/);
  const invalid = JSON.parse(mapTemplate('hot_text'));
  invalid.sectionsInline.map.questions[0].tokens = ['missing', 'another'];
  await assert.rejects(() => parseExamPackage(invalid), /选词题/);
});
test('MAP chooses harder or easier available items, stays untimed, resumes and grades exactly once', async () => {
  const raw = JSON.parse(mapTemplate('mcq'));
  raw.testCount = 3;
  raw.flow[0].count = 5;
  raw.sectionsInline.map.questions = [1, 2, 3, 4, 5].map((d) => ({
    ...MAP_TEMPLATES.mcq,
    difficulty: d,
    skill: 'Vocabulary ' + (d % 2),
  }));
  const parsed = await parseExamPackage(raw),
    { paper, questions } = parsed;
  let run = createMapRun(paper, questions);
  let id = run.map!.order[0],
    q = questions.find((q) => q.id === paper.questions[id])!;
  assert.equal(q.difficulty, 3);
  assert.equal(run.deadline, 0);
  assert.equal(expireRun(paper, run, questions, Date.now() + 1e12), run);
  assert.throws(() => advanceMap(paper, run, questions), /请完成/);
  const wrong = advanceMap(
    paper,
    { ...run, answers: { [id]: 'wrong' } },
    questions,
  );
  run = advanceMap(paper, { ...run, answers: { [id]: q.answer } }, questions);
  assert.ok(run.map!.ability > 3);
  assert.ok(wrong.map!.ability < 3);
  assert.notEqual(run.map!.order[1], id);
  assert.ok(
    questions.find((q) => q.id === paper.questions[run.map!.order[1]])!
      .difficulty >=
      questions.find((q) => q.id === paper.questions[wrong.map!.order[1]])!
        .difficulty,
  );
  await switchAccount('map-test');
  await installExamImport(parsed);
  await put('job', run);
  const reloaded = await loadData();
  assert.deepEqual(reloaded.jobs!.find((j) => j.id === run.id).map, run.map);
  while (run.status !== 'complete') {
    id = run.map!.order[run.index];
    q = questions.find((q) => q.id === paper.questions[id])!;
    run = advanceMap(
      paper,
      { ...run, answers: { ...run.answers, [id]: q.answer } },
      questions,
    );
  }
  assert.equal(run.map!.order.length, 3);
  assert.equal(new Set(run.map!.order).size, 3);
  assert.equal(stageSlots(paper, run).length, 3);
  assert.equal(advanceMap(paper, run, questions), run);
  await put('job', run);
  await gradeExam(paper, run, () => {});
  await gradeExam(paper, run, () => {});
  const after = await loadData();
  assert.equal(after.events.filter((e) => e.sessionId === run.id).length, 3);
  assert.ok(
    after.events
      .filter((e) => e.sessionId === run.id)
      .every((e) => e.score === 1),
  );
  await switchAccount('different-map-test');
  assert.equal(
    (await loadData()).events.some((e) => e.sessionId === run.id),
    false,
  );
  await switchAccount(null);
});
test('MAP generator blueprint has the full untimed 43-item route and a larger reusable pool', () => {
  const stage = examStages('MAP', {
    writing: false,
    mapSection: 'Reading',
    grade: 8,
  })[0];
  assert.equal(stage.count, 43);
  assert.equal(stage.slots.length, 65);
  assert.equal(stage.seconds, 0);
  assert.equal(
    stage.slots.some((s) => s.group),
    false,
  );
});
test('a full 43-item MAP simulation finishes from a 65-item manual pool without repeating an item', async () => {
  const raw = JSON.parse(mapTemplate('mcq'));
  raw.testCount = 43;
  raw.flow[0].count = 65;
  raw.sectionsInline.map.questions = Array.from({ length: 65 }, (_, i) => ({
    ...MAP_TEMPLATES.mcq,
    difficulty: 1 + (i % 5),
    skill: ['Literary Text', 'Informational Text', 'Vocabulary'][i % 3],
  }));
  const { paper, questions } = await parseExamPackage(raw);
  let run = createMapRun(paper, questions);
  while (run.status !== 'complete') {
    const id = run.map!.order[run.index],
      q = questions.find((q) => q.id === paper.questions[id])!;
    run = advanceMap(
      paper,
      {
        ...run,
        answers: { ...run.answers, [id]: run.index % 3 ? 'wrong' : q.answer },
      },
      questions,
    );
  }
  assert.equal(run.map!.order.length, 43);
  assert.equal(new Set(run.map!.order).size, 43);
  assert.equal(stageSlots(paper, run).length, 43);
  assert.equal(run.deadline, 0);
  assert.ok(run.completedAt);
});
