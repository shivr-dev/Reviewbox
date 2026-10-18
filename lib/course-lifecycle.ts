import type { LocalRecord, QueueItem, StudyData } from './model';
import { courseNode, courseQuestions, type Course } from './course-model';
import { assertWritable, currentNamespace, database, loadData } from './store';
import { memoryFamily, memoryFingerprint } from './learning-intelligence';
import { policyFor } from './policy-config';

const DAY = 86400000;
export type CourseCompletion = {
  id: string;
  kind: 'course-completion';
  courseId: string;
  revisionKey: string;
  title: string;
  subject: Course['subject'];
  stage: 'practice' | 'verify' | 'complete';
  teachingCompletedAt: string;
  questionIds: string[];
  practiceSessionId?: string;
  practiceCompletedAt?: string;
  verification: {
    id: string;
    dueAt: string;
    sessionId?: string;
    completedAt?: string;
  }[];
};
export const courseRevisionKey = (course: Course) =>
  course.sections.map((s) => s.id + ':' + s.revision).join('|');

/** Only existing verified course questions enter the loop. No generation occurs here. */
export function coursePracticeQuestions(data: StudyData, course: Course) {
  const nodes = new Set(course.sections.map((s) => courseNode(course, s).id));
  const current = new Set(
    course.sections.flatMap((s) =>
      courseQuestions(course, s, 'practice').map((q) => q.id),
    ),
  );
  return data.questions.filter(
    (q) =>
      nodes.has(q.nodeId) &&
      q.verified &&
      q.reviewStatus !== 'paused' &&
      (current.has(q.id) ||
        (!q.tags?.includes('course-check') && !q.id.startsWith('lesson-q:'))),
  );
}
export type CourseLearningTask = {
  id: string;
  phase: 'practice' | 'verify';
  completion: CourseCompletion;
  course: Course;
  dueAt: string;
  verificationId?: string;
};
export function courseLearningTasks(
  data: StudyData,
  now = Date.now(),
): CourseLearningTask[] {
  return (data.jobs ?? [])
    .filter((j): j is CourseCompletion => j.kind === 'course-completion')
    .flatMap<CourseLearningTask>((completion) => {
      const course = data.jobs?.find(
        (j): j is Course => j.kind === 'course' && j.id === completion.courseId,
      );
      if (
        !course ||
        courseRevisionKey(course) !== completion.revisionKey ||
        !coursePracticeQuestions(data, course).length
      )
        return [];
      if (!completion.practiceCompletedAt)
        return [
          {
            id: completion.id + ':practice',
            phase: 'practice' as const,
            completion,
            course,
            dueAt: completion.teachingCompletedAt,
          },
        ];
      const next = completion.verification.find(
        (v) => !v.completedAt && Date.parse(v.dueAt) <= now,
      );
      return next
        ? [
            {
              id: completion.id + ':' + next.id,
              phase: 'verify' as const,
              verificationId: next.id,
              completion,
              course,
              dueAt: next.dueAt,
            },
          ]
        : [];
    });
}

/** Advance in the caller's completion transaction so progress and session completion agree. */
export function courseCompletionRecords(
  jobs: any[],
  sessionId: string,
  completedAt: string,
  history?: Pick<StudyData, 'events' | 'questions' | 'nodes'> &
    Partial<Pick<StudyData, 'settings'>>,
): LocalRecord[] {
  return jobs
    .filter((j): j is CourseCompletion => j.kind === 'course-completion')
    .flatMap((job) => {
      let next: CourseCompletion | undefined;
      if (job.practiceSessionId === sessionId && !job.practiceCompletedAt) {
        next = {
          ...job,
          stage: 'verify',
          practiceCompletedAt: completedAt,
          verification: courseVerificationDays(
            job,
            history,
            Date.parse(completedAt),
          ).map((days, i) => ({
            id: 'verify-' + i,
            dueAt: new Date(Date.parse(completedAt) + days * DAY).toISOString(),
          })),
        };
      } else {
        const index = job.verification.findIndex(
          (v) => v.sessionId === sessionId && !v.completedAt,
        );
        if (index >= 0) {
          const verification = job.verification.map((v, i) =>
            i === index ? { ...v, completedAt } : v,
          );
          next = {
            ...job,
            verification,
            stage: verification.every((v) => v.completedAt)
              ? 'complete'
              : 'verify',
          };
        }
      }
      return next
        ? [
            {
              id: next.id,
              kind: 'job',
              payload: next,
              updated_at: completedAt,
              deleted: false,
            },
          ]
        : [];
    });
}

function courseVerificationDays(
  job: CourseCompletion,
  history:
    | (Pick<StudyData, 'events' | 'questions' | 'nodes'> &
        Partial<Pick<StudyData, 'settings'>>)
    | undefined,
  now: number,
) {
  const policy = policyFor(
    history?.settings ? { settings: history.settings } : undefined,
  );
  const cold = policy.evidence.coldIntervals;
  if (!history) return cold;
  const data: StudyData = {
    ...history,
    jobs: [],
    notes: [],
    materials: [],
    tests: [],
    packs: [],
    exams: [],
    settings: history.settings ?? {
      dailyMinutes: 20,
      name: '',
      surprise: false,
    },
  };
  const fingerprint = memoryFingerprint(data, now);
  const relevant = history.questions.filter((q) =>
    job.questionIds.includes(q.id),
  );
  const factors = relevant
    .map((q) =>
      fingerprint.find(
        (f) =>
          f.family ===
          memoryFamily(
            q,
            history.nodes.find((n) => n.id === q.nodeId),
          ),
      ),
    )
    .filter((f) => f?.ready)
    .map((f) => f!.factor);
  // No personalized claim is made until enough cross-day evidence exists.
  const factor = factors.length
    ? factors.reduce((sum, value) => sum + value, 0) / factors.length
    : 1;
  return cold.map((days) => days * factor);
}

export async function prepareCourseLearningSession(
  courseId: string,
  phase: 'practice' | 'verify' = 'practice',
  ns = currentNamespace(),
) {
  assertWritable(ns);
  if (currentNamespace() !== ns) throw new Error('账户已切换，请重新打开课程');
  const data = await loadData(ns);
  const course = data.jobs?.find(
    (j): j is Course => j.id === courseId && j.kind === 'course',
  );
  if (
    !course ||
    !course.sections.length ||
    course.sections.some((s) => !s.content || !s.completedAt)
  )
    throw new Error('请先完成全部课程小节');
  const questions = coursePracticeQuestions(data, course);
  const now = new Date().toISOString(),
    revisionKey = courseRevisionKey(course),
    id = 'course-completion:' + course.id;
  const db = await database();
  assertWritable(ns);
  if (currentNamespace() !== ns) throw new Error('账户已切换，请重新打开课程');
  const tx = db.transaction(['records', 'queue'], 'readwrite');
  const save = async (id: string, payload: unknown) => {
    const r = {
      id,
      key: ns + '/' + id,
      namespace: ns,
      kind: 'job',
      payload,
      updated_at: now,
      deleted: false,
    };
    await tx.objectStore('records').put(r);
    await tx.objectStore('queue').put(r);
  };
  const old = (await tx.objectStore('records').get(ns + '/' + id))?.payload as
    | CourseCompletion
    | undefined;
  let completion: CourseCompletion =
    old?.revisionKey === revisionKey
      ? old
      : {
          id,
          kind: 'course-completion',
          courseId,
          revisionKey,
          title: course.title,
          subject: course.subject,
          stage: 'practice',
          teachingCompletedAt: now,
          questionIds: questions.map((q) => q.id),
          verification: [],
        };
  if (phase === 'practice' && completion.practiceCompletedAt) {
    await tx.done;
    return {
      session: undefined,
      completion,
      missingQuestions: false,
      alreadyComplete: true,
    };
  }
  const verification =
    phase === 'verify'
      ? completion.verification.find(
          (v) => !v.completedAt && Date.parse(v.dueAt) <= Date.now(),
        )
      : undefined;
  if (phase === 'verify' && !verification) {
    await tx.done;
    throw new Error('尚未到课程验证时间');
  }
  if (!questions.length) {
    await save(id, completion);
    await tx.done;
    return {
      session: undefined,
      completion,
      missingQuestions: true,
      alreadyComplete: false,
    };
  }
  const active = (await tx.objectStore('records').get(ns + '/active-session'))
    ?.payload;
  const matchingId = verification?.sessionId ?? completion.practiceSessionId;
  if (active && active.id === matchingId && active.status !== 'complete') {
    await tx.done;
    return {
      session: active,
      completion,
      missingQuestions: false,
      alreadyComplete: false,
    };
  }
  if (active?.status === 'active') {
    await tx.done;
    throw new Error('已有未完成练习，请先完成或保存退出后再进入课程巩固');
  }
  const items: QueueItem[] = questions.map((question) => ({
    question,
    priority: 1,
    reason: phase === 'verify' ? '课程间隔验证' : '课程当场巩固',
  }));
  const session = {
    id: crypto.randomUUID(),
    items,
    mode: 'review' as const,
    kind: 'session',
    status: 'active',
    createdAt: now,
    title: course.title + (phase === 'verify' ? ' · 间隔验证' : ' · 课后巩固'),
    courseId,
    coursePhase: phase,
    courseVerificationId: verification?.id,
  };
  completion =
    phase === 'practice'
      ? {
          ...completion,
          questionIds: questions.map((q) => q.id),
          practiceSessionId: session.id,
        }
      : {
          ...completion,
          verification: completion.verification.map((v) =>
            v.id === verification!.id ? { ...v, sessionId: session.id } : v,
          ),
        };
  await save(id, completion);
  await save('active-session', session);
  await tx.done;
  return {
    session,
    completion,
    missingQuestions: false,
    alreadyComplete: false,
  };
}
