import 'fake-indexeddb/auto';
import test from 'node:test';
import assert from 'node:assert/strict';
import { switchAccount, loadData, put } from '../lib/store';
import { applyNaviConfiguration } from '../lib/navi-configuration-client';
import { examGpa } from '../lib/exam-outcomes';
import {
  configurationBaseline,
  configurationContext,
  naviConfigurationAction,
  offlineConfigurationRequest,
  type NaviConfigurationAction,
} from '../lib/navi-configuration';

test('configuration capabilities exclude grades, deletion and unrelated private evidence', async () => {
  assert.equal(
    naviConfigurationAction.safeParse({ type: 'deleteExam', examId: 'a' })
      .success,
    false,
  );
  assert.equal(
    naviConfigurationAction.safeParse({
      type: 'updateExam',
      examId: 'a',
      changes: { result: { score: 100 } },
    }).success,
    false,
  );
  assert.equal(
    naviConfigurationAction.safeParse({
      type: 'setGpaRule',
      changes: { mastery: 1 },
    }).success,
    false,
  );
  await switchAccount('navi-config-schemas');
  const data = await loadData();
  assert.equal(configurationContext(data, '解释一下光的折射'), undefined);
  const context = configurationContext(data, '调整 GPA 公式')!;
  assert.ok(context.gpa);
  assert.equal('events' in context, false);
  assert.equal('results' in context, false);
  assert.ok(configurationContext(data, '每天学习 30 分钟'));
  assert.deepEqual(offlineConfigurationRequest('每天学习35分钟'), {
    type: 'setDailyTime',
    minutes: 35,
  });
  assert.deepEqual(offlineConfigurationRequest('修改GPA公式'), {
    type: 'setGpaRule',
    changes: {},
  });
  assert.equal(offlineConfigurationRequest('不要修改GPA'), undefined);
  assert.equal(offlineConfigurationRequest('怎么修改GPA'), undefined);
});
test('confirmed configuration is atomic, account isolated, replay safe, and preserves real grades', async () => {
  const ns = 'navi-config-writes';
  await switchAccount(ns);
  let data = await loadData();
  const create: NaviConfigurationAction = {
    type: 'createExam',
    changes: {
      title: '验收考试',
      subject: 'math',
      date: '2029-12-10',
      scope: [],
      target: 90,
      dailyMinutes: 20,
    },
  };
  await Promise.all([
    applyNaviConfiguration(create, 'navi-config:create', 'new', ns),
    applyNaviConfiguration(create, 'navi-config:create', 'new', ns),
  ]);
  data = await loadData();
  assert.equal(data.exams.length, 1);
  assert.equal(data.exams[0].target, 90);
  await assert.rejects(
    applyNaviConfiguration(
      { ...create, changes: { ...create.changes, target: 80 } },
      'navi-config:create',
      'new',
      ns,
    ),
    /changed/,
  );
  const exam = {
    ...data.exams[0],
    date: '2020-01-01',
    result: {
      score: 75,
      maxScore: 100,
      credits: 2,
      recordedAt: '2020-01-01T00:00:00Z',
    },
  };
  await put('exam', exam, exam.id);
  data = await loadData();
  const update: NaviConfigurationAction = {
    type: 'updateExam',
    examId: exam.id,
    changes: { title: '名称修订' },
  };
  const before = configurationBaseline(data, update);
  await applyNaviConfiguration(update, 'navi-config:update', before, ns);
  data = await loadData();
  assert.deepEqual(data.exams[0].result, exam.result);
  assert.equal(data.exams[0].date, exam.date);
  const stale: NaviConfigurationAction = {
    type: 'updateExam',
    examId: exam.id,
    changes: { target: 95 },
  };
  await assert.rejects(
    applyNaviConfiguration(stale, 'navi-config:stale', before, ns),
    /changed/,
  );
  const invalid: NaviConfigurationAction = {
    type: 'setGpaRule',
    changes: { formula: 'globalThis.alert(1)' },
  };
  const gpaBefore = configurationBaseline(data, invalid);
  await assert.rejects(
    applyNaviConfiguration(invalid, 'navi-config:invalid', gpaBefore, ns),
  );
  data = await loadData();
  assert.equal(configurationBaseline(data, invalid), gpaBefore);
  assert.equal(
    data.jobs?.some((j) => j.id === 'navi-config:invalid'),
    false,
  );
  const gpa: NaviConfigurationAction = {
    type: 'setGpaRule',
    changes: { scale: 4, formula: 'ratio * scale', weighted: false },
  };
  await applyNaviConfiguration(
    gpa,
    'navi-config:gpa',
    configurationBaseline(data, gpa),
    ns,
  );
  data = await loadData();
  assert.equal(data.settings.examGpa?.weighted, false);
  assert.deepEqual(data.exams[0].result, exam.result);
  const daily: NaviConfigurationAction = { type: 'setDailyTime', minutes: 35 };
  // Legacy settings aliases participate in the same effective projection.
  await put(
    'setting',
    { id: 'legacy-preferences', dailyMinutes: 45, name: '保留姓名' },
    'legacy-preferences',
  );
  data = await loadData();
  const preservedName = data.settings.name;
  await applyNaviConfiguration(
    daily,
    'navi-config:daily',
    configurationBaseline(data, daily),
    ns,
  );
  assert.equal((await loadData()).settings.dailyMinutes, 35);
  assert.equal((await loadData()).settings.name, preservedName);
  data = await loadData();
  const preferences: NaviConfigurationAction = {
    type: 'setLearningPreferences',
    changes: { mode: 'manual', weights: { math: 5 } },
  };
  await applyNaviConfiguration(
    preferences,
    'navi-config:preferences',
    configurationBaseline(data, preferences),
    ns,
  );
  data = await loadData();
  assert.equal(data.settings.studyMode, 'manual');
  assert.equal(data.settings.assistant?.weights.math, 5);
  assert.equal(data.settings.assistant?.weights.english, 3);
  assert.equal(data.settings.studyAutoStart, undefined);
  const noSubjects: NaviConfigurationAction = {
    type: 'setLearningPreferences',
    changes: {
      weights: {
        math: 0,
        english: 0,
        chinese: 0,
        ce: 0,
        physics: 0,
        chemistry: 0,
        biology: 0,
        history: 0,
      },
    },
  };
  await assert.rejects(
    applyNaviConfiguration(
      noSubjects,
      'navi-config:no-subject',
      configurationBaseline(data, noSubjects),
      ns,
    ),
    /invalid/,
  );
  const beforeGpa = examGpa(data);
  const cancel: NaviConfigurationAction = {
    type: 'setExamScheduled',
    examId: exam.id,
    enabled: false,
  };
  await applyNaviConfiguration(
    cancel,
    'navi-config:cancel',
    configurationBaseline(data, cancel),
    ns,
  );
  data = await loadData();
  assert.equal(data.exams[0].scheduleStatus, 'cancelled');
  assert.deepEqual(data.exams[0].result, exam.result);
  assert.equal(examGpa(data).value, beforeGpa.value);
  assert.deepEqual(examGpa(data).rows.map(r=>[r.exam.id,r.point,r.weight]),beforeGpa.rows.map(r=>[r.exam.id,r.point,r.weight]));
  const resume:NaviConfigurationAction={...cancel,enabled:true};
  await applyNaviConfiguration(resume,'navi-config:resume',configurationBaseline(data,resume),ns);
  assert.equal((await loadData()).exams[0].scheduleStatus,'active');
  await switchAccount('navi-config-other');
  await assert.rejects(
    applyNaviConfiguration(daily, 'navi-config:leak', 'null', ns),
    /account/,
  );
  assert.equal((await loadData()).exams.length, 0);
});
