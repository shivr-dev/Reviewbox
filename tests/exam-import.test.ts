import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import { zipSync, strToU8 } from 'fflate';
import {
  parseExamPackage,
  readExamFile,
  smartExamText,
  installExamImport,
} from '../lib/exam-import';
import { createRun, paperReady, stageSlots } from '../lib/exam-model';
import { nativeExamPackage, applyNativeAnswers } from '../lib/exam-native';
import {
  learningTemplate,
  examTaskTemplate,
  EXAM_TASK_TEMPLATES,
} from '../lib/import-templates';
import { parseImportText } from '../lib/import-skill';
import { objectiveScore, QUESTION_TYPES } from '../lib/question-tools';
import { ELEMENTS } from '../lib/elements';
import { switchAccount, loadData, put } from '../lib/store';
import { gradeExam } from '../lib/exam-client';
import { apiFetch } from '../lib/runtime';
const choice = {
  type: 'mcq',
  prompt: 'Which option is correct?',
  choices: ['Yes', 'No'],
  correct: 0,
  explanation: 'The first option is supported by the text.',
  skill: 'Text evidence',
};
const sample = (exam = 'TOEFL') => ({
  schemaVersion: 1,
  exam,
  title: 'Imported test',
  flow: [{ id: 'reading', label: 'Reading', durationSeconds: 120, count: 1 }],
  sectionsInline: { reading: { questions: [choice] } },
});
test('all general and TOEFL manual templates import without AI, examples remain explicit', async () => {
  for (const type of QUESTION_TYPES) {
    const p = parseImportText(learningTemplate(type.id));
    assert.equal(p.questions[0].type, type.id);
  }
  for (const type of Object.keys(EXAM_TASK_TEMPLATES)) {
    const value = await parseExamPackage(examTaskTemplate(type));
    assert.equal(value.questions.length, 1);
    assert.equal(paperReady(value.paper, value.questions), true);
    const pkg = nativeExamPackage(value.paper, value.questions, [], 'Learner');
    assert.equal(pkg.manifest.flow.length, 1);
    assert.equal(Object.values(pkg.sections)[0].questions.length, 1);
  }
});
test('import identity is stable, aliases normalize, invalid answers and missing audio fail before saving', async () => {
  const raw = JSON.parse(examTaskTemplate('complete_words'));
  raw.exam = 'TOFEL';
  const a = await parseExamPackage(raw),
    b = await parseExamPackage(raw);
  assert.equal(a.paper.id, b.paper.id);
  assert.equal(a.paper.exam, 'TOEFL');
  const bad = sample();
  bad.sectionsInline.reading.questions[0] = { ...choice, correct: 8 };
  await assert.rejects(() => parseExamPackage(bad), /答案无效/);
  const audio = JSON.parse(examTaskTemplate('listen_response'));
  delete audio.sectionsInline.listening.questions[0].audioText;
  await assert.rejects(() => parseExamPackage(audio), /音频或/);
  const noExplanation = sample();
  noExplanation.sectionsInline.reading.questions[0] = {
    ...choice,
    explanation: '',
  };
  await assert.rejects(() => parseExamPackage(noExplanation), /解析/);
});
test('SAT imported adaptive branches retain module lock and map only the played route', async () => {
  const raw = {
    ...sample('SAT'),
    flow: [
      {
        id: 'rw1',
        label: 'Reading and Writing',
        durationSeconds: 1920,
        count: 1,
      },
      {
        id: 'rw2',
        label: 'Reading and Writing',
        durationSeconds: 1920,
        count: 1,
      },
    ],
    sectionsInline: {
      rw1: { questions: [choice] },
      rw2_easy: { questions: [choice] },
      rw2_hard: { questions: [{ ...choice, prompt: 'Hard question' }] },
    },
  };
  const value = await parseExamPackage(raw),
    pkg = nativeExamPackage(value.paper, value.questions, [], 'Test');
  assert.deepEqual(
    pkg.manifest.flow.map((s) => s.id),
    ['rw1', 'rw2'],
  );
  assert.ok(pkg.sections.rw2_hard);
  const run = applyNativeAnswers(
    createRun(value.paper),
    value.paper,
    value.questions,
    {
      answers: { 'rw1:0': 0, 'rw2:0': 1 },
      flags: { 'rw2:0': true },
      times: { 'rw2:0': 42000 },
      routes: { rw2: 'hard' },
      finished: true,
    },
  );
  assert.equal(stageSlots(value.paper, run, 1)[0].route, 'higher');
  assert.equal(run.answers['1-higher-0'], 'No');
  assert.equal(run.times['1-higher-0'], 42000);
  assert.equal(run.status, 'complete');
  assert.equal(run.answers['1-lower-0'], undefined);
});
test('TOEFL missing letters and sentence tiles map to deterministic partial and full scores', async () => {
  const a = await parseExamPackage(examTaskTemplate('complete_words'));
  const run = applyNativeAnswers(createRun(a.paper), a.paper, a.questions, {
    answers: { 'reading:0': 'ital' },
    flags: { 'reading:0': true },
  });
  assert.equal(objectiveScore(a.questions[0], run.answers['0-standard-0']), 1);
  const b = await parseExamPackage(examTaskTemplate('build_sentence'));
  const built = applyNativeAnswers(createRun(b.paper), b.paper, b.questions, {
    answers: { 'writing:0': ['She', 'reads', 'every day', '.'] },
  });
  assert.equal(
    objectiveScore(b.questions[0], built.answers['0-standard-0']),
    1,
  );
  const flagged = applyNativeAnswers(createRun(a.paper), a.paper, a.questions, {
    flags: { 'reading:0': true },
    answers: {},
  });
  assert.equal(flagged.flags['0-standard-0'], true);
});
test('ZIP resources are stored in cloud-sized chunks and source programs are rejected', async () => {
  const raw: any = JSON.parse(examTaskTemplate('listen_response'));
  const q = raw.sectionsInline.listening.questions[0];
  q.audio = 'assets/test.wav';
  delete q.audioText;
  const { sectionsInline, ...manifest } = raw;
  const bytes = zipSync({
    'manifest.json': strToU8(
      JSON.stringify({
        ...manifest,
        sections: { listening: 'sections/listening.json' },
      }),
    ),
    'sections/listening.json': strToU8(
      JSON.stringify(sectionsInline.listening),
    ),
    'assets/test.wav': new Uint8Array(800000).fill(3),
  });
  const imported = await readExamFile(new File([bytes], 'test.zip'));
  assert.equal(
    imported.assets.filter((a) => a.kind === 'exam-asset-chunk').length,
    2,
  );
  const pkg = nativeExamPackage(
    imported.paper,
    imported.questions,
    imported.assets,
    '',
  );
  assert.ok(Object.values(pkg.media)[0].startsWith('data:audio/wav;base64,'));
  await assert.rejects(
    () =>
      readExamFile(
        new File([zipSync({ 'app/app.js': strToU8('nothing') })], 'source.zip'),
      ),
    /程序源码/,
  );
});
test('plain text exam import requires no network and preserves explanations', async () => {
  const p = await smartExamText(
    '1. Select the correct answer.\nA. Yes\nB. No\n答案：A\n解析：The text supports Yes.',
    'ACT',
  );
  assert.equal(p.questions[0].answer, 'Yes');
  assert.equal(p.questions[0].explanation, 'The text supports Yes.');
});
test('import and oral self review persist privately and cannot score a recording as AI text', async () => {
  await switchAccount('exam-import-tests');
  const p = await parseExamPackage(examTaskTemplate('listen_repeat'));
  await installExamImport(p);
  let run = applyNativeAnswers(createRun(p.paper), p.paper, p.questions, {
    answers: { 'speaking:0': { recorded: true } },
    finished: true,
  });
  await put('job', run);
  run = await gradeExam(p.paper, run, () => {});
  assert.equal(run.graded, false);
  assert.equal(
    (await loadData()).events.filter((e) => e.sessionId === run.id).length,
    0,
  );
  run.selfScores = { '0-standard-0': 1 };
  run = await gradeExam(p.paper, run, () => {});
  await gradeExam(p.paper, run, () => {});
  const events = (await loadData()).events.filter(
    (e) => e.sessionId === run.id,
  );
  assert.equal(events.length, 1);
  assert.equal(events[0].source, 'self');
  await switchAccount('another-exam-user');
  await assert.rejects(
    () => installExamImport(p, 'exam-import-tests'),
    /账户已切换/,
  );
});
test('periodic table has all 118 elements at unique valid positions', () => {
  assert.equal(ELEMENTS.length, 118);
  assert.equal(new Set(ELEMENTS.map((e) => e.symbol)).size, 118);
  assert.equal(new Set(ELEMENTS.map((e) => `${e.row}:${e.column}`)).size, 118);
  assert.equal(ELEMENTS[117].symbol, 'Og');
  assert.equal(ELEMENTS[71].group, 4);
  assert.equal(ELEMENTS[79].group, 12);
  assert.ok(ELEMENTS.every((e) => e.column >= 1 && e.column <= 18));
});
test('Pages API adapter stays local and never sends a password or AI prompt to GitHub', async () => {
  const prior = (globalThis as any).window;
  (globalThis as any).window = { __REVIEW_STATIC__: true };
  try {
    assert.equal(
      ((await (await apiFetch('/api/account')).json()) as {aiReady:boolean}).aiReady,
      false,
    );
    const r = await apiFetch('/api/ai', {
      method: 'POST',
      body: 'secret prompt',
    });
    assert.equal(r.status, 503);
  } finally {
    (globalThis as any).window = prior;
  }
});
