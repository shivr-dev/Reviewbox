import { apiFetch } from './runtime';
import { verifyCourseQuestions } from './course-verification';
import { courseErrorMessage } from './course-errors';
import {
  generateVerified,
  resumeVerifiedJob,
  type GenerationJob,
} from './ai-client';
import { put, loadData, currentNamespace, saveRecords } from './store';
import {
  courseFingerprint,
  splitCourseSource,
  courseNode,
  courseQuestions,
  validateCourseContent,
  type Course,
  type CourseContent,
} from './course-model';
import {
  localDay,
  type Subject,
  type Question,
  type AnswerEvent,
} from './model';
export async function courseCall(body: unknown) {
  try {
    const res = await apiFetch('/api/course', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(180000),
    });
    const payload = await res.json().catch(() => {
      throw new Error('课程服务未返回有效内容，请稍后继续。');
    });
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new Error('课程服务未返回有效内容，请稍后继续。');
    const value = payload as Record<string, any>;
    if (!res.ok) {
      const error = new Error(courseErrorMessage(value.error)) as Error & {
        parts?: Record<string, unknown>;
        repairs?: Record<string, unknown>;
      };
      error.parts = value.parts;
      error.repairs = value.repairs;
      throw error;
    }
    return value;
  } catch (e) {
    throw Object.assign(new Error(courseErrorMessage(e)), {
      parts: (e as any)?.parts,
      repairs: (e as any)?.repairs,
    });
  }
}
export async function createCourse(
  subject: Subject,
  title: string,
  source: string,
  sourceNames: string[],
  ns = currentNamespace(),
): Promise<{ course: Course; reused: boolean }> {
  const chunks = splitCourseSource(source);
  const fingerprint = await courseFingerprint(subject, source);
  if (currentNamespace() !== ns) throw new Error('账户已切换，请重新打开课程');
  const data = await loadData(ns);
  const old = data.jobs?.find(
    (j) =>
      j.kind === 'course' &&
      j.subject === subject &&
      j.fingerprint === fingerprint,
  ) as Course | undefined;
  if (old) return { course: old, reused: true };
  const now = new Date().toISOString();
  const course: Course = {
    id: 'course:' + crypto.randomUUID(),
    schemaVersion: 1,
    kind: 'course',
    title: title.trim() || source.trim().split('\n')[0].slice(0, 50),
    subject,
    source,
    sourceNames,
    fingerprint,
    createdAt: now,
    updatedAt: now,
    sections: chunks.map((s, i) => ({
      id: crypto.randomUUID(),
      source: s,
      title: '第 ' + (i + 1) + ' 节',
      revision: 1,
      history: [],
      passed: [],
    })),
    current: 0,
    status: 'preparing',
    chat: [],
  };
  await put('job', course, course.id, false, ns);
  return { course, reused: false };
}
export async function saveCourse(course: Course, ns = currentNamespace()) {
  const now = new Date().toISOString();
  const records: any[] = [];
  const record = (id: string, payload: any) => {
    if (new TextEncoder().encode(JSON.stringify(payload)).length > 1800000)
      throw new Error(
        '该课件小节超过同步容量，请拆分资料后建立课程；既有记录已保留',
      );
    records.push({ id, kind: 'job', payload, updated_at: now, deleted: false });
  };
  const chatIds = course.chat.map((m) => {
    const id = 'course-chat:' + course.id.slice(7) + ':' + m.at + ':' + m.role;
    record(id, { id, kind: 'course-chat', courseId: course.id, message: m });
    return id;
  });
  for (const section of course.sections) {
    const history = section.history.map((h) => {
      const id = 'course-revision:' + section.id + ':' + h.revision;
      record(id, {
        id,
        kind: 'course-revision',
        courseId: course.id,
        content: h.content,
      });
      return { revision: h.revision, at: h.at, contentId: id };
    });
    record('course-section:' + section.id, {
      id: 'course-section:' + section.id,
      kind: 'course-section',
      courseId: course.id,
      section: { ...section, history },
    });
    if (!section.content) continue;
    const node = courseNode(course, section);
    records.push({
      id: node.id,
      kind: 'node',
      payload: node,
      updated_at: now,
      deleted: false,
    });
    for (const q of [
      ...courseQuestions(course, section, 'checks'),
      ...courseQuestions(course, section, 'practice'),
    ])
      records.push({
        id: q.id,
        kind: 'question',
        payload: q,
        updated_at: now,
        deleted: false,
      });
  }
  record(course.id, {
    ...course,
    storageVersion: 1,
    sections: course.sections.map(
      ({
        content,
        pendingContent,
        history,
        draftParts,
        draftRepairs,
        ...section
      }) => section,
    ),
    chat: [],
    chatIds,
    updatedAt: now,
  });
  await saveRecords(records, true, ns);
}
export async function prepareCourse(
  original: Course,
  onProgress: (c: Course, message: string) => void,
  stop: { current: boolean },
  ns = currentNamespace(),
) {
  if (currentNamespace() !== ns) throw new Error('账户已切换，请重新打开课程');
  let course = structuredClone(
    (await loadData(ns)).jobs?.find((j) => j.id === original.id) ?? original,
  ) as Course;
  const reload = async () => {
    course = ((await loadData(ns)).jobs?.find((j) => j.id === original.id) ??
      course) as Course;
  };
  const patch = async (
    id: string,
    changes: Partial<Course['sections'][number]>,
  ) => {
    await reload();
    course = {
      ...course,
      sections: course.sections.map((s) =>
        s.id === id ? { ...s, ...changes } : s,
      ),
    };
    course.status = course.sections.every((s) => s.content)
      ? 'ready'
      : 'preparing';
    await saveCourse(course, ns);
  };
  for (let i = 0; i < course.sections.length; i++) {
    if (stop.current || currentNamespace() !== ns) break;
    if (course.sections[i].content) continue;
    const id = course.sections[i].id;
    try {
      let section = course.sections[i];
      let content = section.pendingContent;
      if (!content)
        for (let attempt = 0; attempt < 2; attempt++) {
          onProgress(
            course,
            `正在${attempt ? '完善' : '编制'}第 ${i + 1} / ${course.sections.length} 节`,
          );
          try {
            const value = await courseCall({
              action: 'generate',
              subject: course.subject,
              title: course.title,
              source: section.source,
              index: i,
              total: course.sections.length,
              parts: section.draftParts,
              repairs: section.draftRepairs,
            });
            content = validateCourseContent(value.content, section.source);
            await patch(id, {
              pendingContent: content,
              draftParts: undefined,
              draftRepairs: undefined,
              error: undefined,
            });
            break;
          } catch (e) {
            if ((e as any)?.parts) {
              await patch(id, {
                draftParts: (e as any).parts,
                draftRepairs: (e as any).repairs,
              });
              section = course.sections.find((s) => s.id === id)!;
            }
            if (
              attempt === 1 ||
              !(e as any)?.parts ||
              stop.current ||
              currentNamespace() !== ns
            )
              throw e;
          }
        }
      if (!content) throw new Error('本节编制未完成');
      if (stop.current || currentNamespace() !== ns) break;
      section = course.sections.find((s) => s.id === id)!;
      const verification = await verifyCourseQuestions(
        course,
        { ...section, content },
        (message) => onProgress(course, message),
        ns,
      );
      await reload();
      if (course.sections.find((s) => s.id === id)?.content) continue;
      await patch(id, {
        content,
        title: content.title,
        pendingContent: undefined,
        verification,
        error: undefined,
        draftParts: undefined,
        draftRepairs: undefined,
      });
      if (currentNamespace() === ns) onProgress(course, `第 ${i + 1} 节已保存`);
    } catch (e) {
      await reload();
      const section = course.sections.find((s) => s.id === id)!;
      const changes: Partial<typeof section> = {
        error: courseErrorMessage(e),
      };
      if ((e as any)?.rejected && section.pendingContent) {
        const { checks, practice, ...rest } = section.pendingContent;
        const { comparison, process, recall, ...teaching } = rest;
        changes.pendingContent = undefined;
        changes.draftParts = {
          '0': teaching,
          '1': { comparison, process, recall },
        };
        changes.draftRepairs = {
          '2': {
            value: { checks, practice },
            issues: [
              {
                problem: changes.error,
                correction:
                  'Correct the rejected question and answer. Mathematics needs unique answers and five-step solutions for every question.',
              },
            ],
          },
        };
      }
      await patch(id, changes);
      throw e;
    }
  }
  return course;
}
export async function prepareFreeCoursePractice(
  course: Course,
  progress: (message: string) => void,
  ns = currentNamespace(),
) {
  const questions: Question[] = [];
  for (const section of course.sections.filter(
    (s) => s.content?.format === 'free-html',
  )) {
    if (currentNamespace() !== ns)
      throw new Error('账户已切换，请重新打开课程');
    const node = courseNode(course, section);
    const data = await loadData(ns);
    if (currentNamespace() !== ns)
      throw new Error('账户已切换，请重新打开课程');
    const cached = data.questions.filter(
      (q) => q.nodeId === node.id && q.verified,
    );
    if (cached.length) {
      questions.push(...cached.slice(0, 3));
      continue;
    }
    const pending = data.jobs?.find(
      (j) =>
        j.kind === 'generation' &&
        j.node?.id === node.id &&
        j.status !== 'ready',
    ) as GenerationJob | undefined;
    const q = pending
      ? await resumeVerifiedJob(pending, progress)
      : await generateVerified(node, node.skills[1], 2, '', [], progress);
    if (currentNamespace() !== ns)
      throw new Error('账户已切换，请重新打开课程');
    questions.push(q);
  }
  return questions;
}
export async function recordCourseCheck(
  course: Course,
  q: Question,
  answer: string,
  shownAt: number,
  ns = currentNamespace(),
) {
  if (currentNamespace() !== ns) throw new Error('账户已切换，未记录本次作答');
  const score = answer === q.answer ? 1 : 0,
    at = new Date().toISOString();
  const id = 'course-event:' + q.id;
  const event: AnswerEvent = {
    id,
    questionId: q.id,
    nodeId: q.nodeId,
    skillId: q.skillId,
    subject: q.subject,
    outcome: score ? 'correct' : 'wrong',
    score,
    source: 'test',
    answer,
    occurredAt: at,
    displayedAt: new Date(shownAt).toISOString(),
    revealedAt: at,
    activeThinkMs: Math.max(0, Date.now() - shownAt),
    expectedSeconds: q.expectedSeconds,
    difficulty: q.difficulty,
    variant: q.variant,
    usedHint: false,
    reason: '课程理解检验',
    sessionId: course.id,
    localDay: localDay(new Date(at)),
    version: 1,
  };
  await put('event', event, id, false, ns);
  return score;
}
