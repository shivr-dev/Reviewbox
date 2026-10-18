import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createCourse,
  recordCourseCheck,
  saveCourse,
} from '../lib/course-client';
import { courseNode, courseQuestions, type Course } from '../lib/course-model';
import {
  courseCompletionRecords,
  courseLearningTasks,
  prepareCourseLearningSession,
} from '../lib/course-lifecycle';
import {
  currentNamespace,
  database,
  loadData,
  put,
  saveRecords,
  switchAccount,
} from '../lib/store';

export function courseFixture(): Course {
  return {
    id: 'course:' + crypto.randomUUID(),
    kind: 'course',
    schemaVersion: 1,
    subject: 'english',
    title: 'Course fixture',
    source: 'Manual source',
    sourceNames: [],
    fingerprint: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    current: 0,
    status: 'ready',
    chat: [],
    sections: [
      {
        id: crypto.randomUUID(),
        source: 'Manual source',
        title: 'Section',
        revision: 1,
        history: [],
        passed: [],
        completedAt: new Date().toISOString(),
        verification: { status: 'verified' } as any,
        content: {
          format: 'free-html',
          title: 'Course fixture',
          html: '<html><body>Interactive teaching fixture</body></html>',
          objectives: [],
          concepts: [],
          comparison: { title: '', columns: [], rows: [] },
          process: { title: '', steps: [] },
          recall: [],
          sourceQuotes: [],
          uncertainties: [],
          checks: [
            {
              prompt: 'Which answer is valid?',
              options: ['A', 'B', 'C', 'D'],
              answer: 'A',
              explanation: 'A is valid.',
              skill: 'understand',
            },
          ],
          practice: [
            {
              prompt: 'Explain the idea independently.',
              answer: 'A complete explanation.',
              explanation: 'The explanation applies the idea.',
              skill: 'apply',
            },
          ],
        },
      },
    ],
  };
}

test('course checks retain wrong then correct attempts and a concurrent retry chain', async () => {
  const original = currentNamespace();
  try {
    await switchAccount('course-attempt-test-' + crypto.randomUUID());
    const course = courseFixture(),
      q = courseQuestions(course, course.sections[0], 'checks')[0];
    await saveCourse(course);
    await recordCourseCheck(course, q, 'B', Date.now() - 20000);
    await Promise.all([
      recordCourseCheck(course, q, 'A', Date.now() - 5000),
      recordCourseCheck(course, q, 'A', Date.now() - 4000),
    ]);
    const events = (await loadData()).events
      .filter((e) => e.sessionId === course.id)
      .sort((a, b) => a.attemptNumber! - b.attemptNumber!);
    assert.equal(events.length, 3);
    assert.deepEqual(
      events.map((e) => e.score),
      [0, 1, 1],
    );
    assert.deepEqual(
      events.map((e) => e.attemptNumber),
      [1, 2, 3],
    );
    assert.equal(events[1].previousAttemptId, events[0].id);
    assert.equal(events[2].previousAttemptId, events[1].id);
    const staleNs = currentNamespace();
    await switchAccount(null);
    await assert.rejects(
      recordCourseCheck(course, q, 'A', Date.now(), staleNs),
      /账户已切换/,
    );
  } finally {
    await switchAccount(original === 'local' ? null : original);
  }
});

test('course completion atomically starts only its own practice, resumes idempotently, and schedules due verification', async () => {
  const original = currentNamespace();
  try {
    await switchAccount('course-loop-test-' + crypto.randomUUID());
    const course = courseFixture();
    await saveCourse(course);
    const [a, b] = await Promise.all([
      prepareCourseLearningSession(course.id),
      prepareCourseLearningSession(course.id),
    ]);
    assert.ok(a.session);
    assert.equal(a.session.id, b.session!.id);
    assert.deepEqual(
      a.session.items.map((i: any) => i.question.nodeId),
      [courseNode(course, course.sections[0]).id],
    );
    assert.match(a.session.title, /课后巩固/);
    const data = await loadData(),
      at = new Date().toISOString();
    const records = courseCompletionRecords(data.jobs!, a.session.id, at);
    assert.equal(records.length, 1);
    await saveRecords(records);
    assert.equal(
      courseCompletionRecords((await loadData()).jobs!, a.session.id, at)
        .length,
      0,
    );
    const job = records[0].payload;
    assert.equal(job.stage, 'verify');
    assert.equal(job.verification.length, 3);
    assert.equal(
      courseLearningTasks(await loadData(), Date.parse(at)).length,
      0,
    );
    assert.equal(
      courseLearningTasks(await loadData(), Date.parse(at) + 86400001)[0].phase,
      'verify',
    );
    const stored = await (
      await database()
    ).get('records', currentNamespace() + '/active-session');
    await put(
      'job',
      { ...stored.payload, status: 'complete' },
      'active-session',
    );
    assert.equal(
      (await prepareCourseLearningSession(course.id)).alreadyComplete,
      true,
    );
    course.sections[0].revision++;
    await saveCourse(course);
    assert.equal(
      courseLearningTasks(await loadData(), Date.parse(at) + 86400001).length,
      0,
    );
  } finally {
    await switchAccount(original === 'local' ? null : original);
  }
});

test('new free HTML courses never inherit completion; missing course practice is explicit without an AI call', async () => {
  const original = currentNamespace(),
    originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('No AI permitted');
  };
  try {
    await switchAccount('course-empty-test-' + crypto.randomUUID());
    const made = await createCourse(
      'english',
      'A fresh course',
      'Manual new source ' + crypto.randomUUID(),
      [],
    );
    assert.equal(made.course.current, 0);
    assert.equal(made.course.sections[0].completedAt, undefined);
    await assert.rejects(
      prepareCourseLearningSession(made.course.id),
      /完成全部课程/,
    );
    const course = courseFixture();
    course.sections[0].content!.checks = [];
    course.sections[0].content!.practice = [];
    await saveCourse(course);
    const result = await prepareCourseLearningSession(course.id);
    assert.equal(result.missingQuestions, true);
    assert.equal(result.session, undefined);
    assert.equal(
      (await loadData()).jobs?.filter((j) => j.kind === 'course-completion')
        .length,
      1,
    );
    assert.equal(calls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    await switchAccount(original === 'local' ? null : original);
  }
});
