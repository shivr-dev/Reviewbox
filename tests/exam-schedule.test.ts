import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, schoolExam, practiced } from './study-plan-fixtures';
import {
  allRecords,
  loadData,
  put,
  switchAccount,
  currentNamespace,
} from '../lib/store';
import {
  saveExamDetails,
  setExamScheduled,
  deleteExamRecord,
  undoExamDeletion,
  saveExamScopeTemplate,
} from '../lib/exam-schedule-client';
import { saveExamScore } from '../lib/exam-outcome-client';
import { examGpa, pendingExamScores } from '../lib/exam-outcomes';
import { examImpact } from '../lib/learning-signals';
import { studyAgenda } from '../lib/study-orchestrator';
import { saveAutoStartPreference } from '../lib/study-preferences-client';
import type { Exam } from '../lib/model';

async function setup(name: string) {
  await switchAccount(name);
  const d = fixture();
  for (const n of d.nodes) await put('node', n);
  return d;
}
const grade = () => ({
  score: 80,
  maxScore: 100,
  credits: 2,
  recordedAt: new Date(Date.now() - 2000).toISOString(),
});
test('cancelling arrangements preserves grades and GPA, stops future exam pressure and reminders, and can be resumed', async () => {
  const d = await setup('exam-cancel-regression'),
    now = Date.now();
  try {
    const past: Exam = {
      ...schoolExam(d, now, -3),
      id: 'graded-exam',
      result: grade(),
    };
    await put('exam', past);
    const before = examGpa(await loadData()).value;
    assert.equal(before, 3.2);
    await setExamScheduled(past.id, false);
    const data = await loadData();
    assert.equal(
      data.exams.find((e) => e.id === past.id)?.scheduleStatus,
      'cancelled',
    );
    assert.deepEqual(
      data.exams.find((e) => e.id === past.id)?.result,
      past.result,
    );
    assert.equal(examGpa(data).value, before);
    assert.equal(
      (await allRecords()).find((r) => r.id === past.id)?.deleted,
      false,
    );
    await put('exam', { ...past, id: 'no-score', result: undefined });
    await setExamScheduled('no-score', false);
    assert.ok(
      !pendingExamScores(await loadData()).some((e) => e.id === 'no-score'),
    );
    const future = { ...schoolExam(d, now, 4), id: 'upcoming' };
    await put('exam', future);
    assert.ok(examImpact(await loadData(), 'math', undefined, now).value > 0);
    await setExamScheduled(future.id, false);
    assert.equal(examImpact(await loadData(), 'math', undefined, now).value, 0);
    const snapshot = practiced(
      { ...d, ...(await loadData()), questions: d.questions },
      now,
    );
    assert.ok(
      !studyAgenda(snapshot, now).actions.some((a) => a.examId === future.id),
    );
    await setExamScheduled(future.id, true);
    assert.ok(examImpact(await loadData(), 'math', undefined, now).value > 0);
  } finally {
    await switchAccount(null);
  }
});
test('exam edits and concurrent score/cancellation writes preserve the latest grade and schedule state', async () => {
  const d = await setup('exam-edit-regression');
  try {
    const exam: Exam = {
      ...schoolExam(d, Date.now(), -3),
      id: 'edit-exam',
      result: grade(),
    };
    await put('exam', exam);
    const newer = { ...grade(), score: 92 };
    await Promise.all([
      saveExamScore(exam.id, newer),
      setExamScheduled(exam.id, false),
      saveExamDetails(
        {
          ...exam,
          title: '已编辑的月考',
          scope: [d.nodes[0].id],
          target: 90,
          dailyMinutes: 35,
          result: { ...grade(), score: 0 },
        } as any,
        exam.id,
      ),
    ]);
    const saved = (await loadData()).exams.find((e) => e.id === exam.id)!;
    assert.equal(saved.title, '已编辑的月考');
    assert.equal(saved.target, 90);
    assert.equal(saved.dailyMinutes, 35);
    assert.deepEqual(
      saved.result,
      newer,
      'form input cannot overwrite a result',
    );
    assert.equal(saved.scheduleStatus, 'cancelled');
    await assert.rejects(
      saveExamDetails({ ...saved, date: '2099-01-01' }, saved.id),
      /已有成绩/,
    );
    await assert.rejects(
      saveExamDetails({ ...saved, scope: ['missing-node'] }, saved.id),
      /范围/,
    );
    assert.deepEqual(
      (await loadData()).exams.find((e) => e.id === exam.id),
      saved,
    );
  } finally {
    await switchAccount(null);
  }
});
test('delete and durable undo are atomic, account isolated and do not overwrite subsequent changes', async () => {
  const d = await setup('exam-delete-regression'),
    ns = currentNamespace();
  try {
    const exam: Exam = {
      ...schoolExam(d, Date.now(), -3),
      id: 'delete-exam',
      result: grade(),
    };
    await put('exam', exam);
    const receipt = await deleteExamRecord(exam.id);
    assert.ok(!(await loadData()).exams.some((e) => e.id === exam.id));
    const records = await allRecords();
    assert.equal(records.find((r) => r.id === exam.id)?.deleted, true);
    assert.ok(
      records.some(
        (r) => r.id === receipt.id && r.payload.status === 'deleted',
      ),
    );
    await switchAccount('different-exam-account');
    await assert.rejects(undoExamDeletion(receipt.id, ns), /账户已切换/);
    await switchAccount('exam-delete-regression');
    await undoExamDeletion(receipt.id);
    assert.deepEqual(
      (await loadData()).exams.find((e) => e.id === exam.id),
      exam,
    );
    await assert.rejects(undoExamDeletion(receipt.id), /已撤销/);
    const second = await deleteExamRecord(exam.id);
    await put('exam', { ...exam, title: '后来恢复的记录' });
    await assert.rejects(undoExamDeletion(second.id), /未覆盖/);
    assert.equal(
      (await loadData()).exams.find((e) => e.id === exam.id)?.title,
      '后来恢复的记录',
    );
    await assert.rejects(deleteExamRecord('nonexistent'), /已变更或删除/);
  } finally {
    await switchAccount(null);
  }
});
test('scope templates and explicit Auto opt-in persist without overwriting unrelated preferences', async () => {
  const d = await setup('exam-template-regression');
  try {
    await saveExamScopeTemplate('第一章', 'math', [
      d.nodes[0].id,
      d.nodes[0].id,
    ]);
    assert.deepEqual(
      (await loadData()).jobs?.find((j) => j.kind === 'exam-scope-template')
        ?.scope,
      [d.nodes[0].id],
    );
    await assert.rejects(
      saveExamScopeTemplate('错误学科', 'english', [d.nodes[0].id]),
      /无效知识点/,
    );
    await put(
      'setting',
      {
        studyMode: 'auto',
        gameSound: false,
        dailyMinutes: 35,
        name: '保留设置',
      },
      'settings',
    );
    assert.equal((await loadData()).settings.studyAutoStart, undefined);
    await saveAutoStartPreference(true);
    let s = (await loadData()).settings;
    assert.equal(s.studyAutoStart?.enabled, true);
    assert.ok(s.studyAutoStart?.acknowledgedAt);
    assert.equal(s.gameSound, false);
    assert.equal(s.dailyMinutes, 35);
    assert.equal(s.name, '保留设置');
    await saveAutoStartPreference(false);
    assert.equal((await loadData()).settings.studyAutoStart?.enabled, false);
  } finally {
    await switchAccount(null);
  }
});
