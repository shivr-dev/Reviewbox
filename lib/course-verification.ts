import { apiFetch } from './runtime';
import { currentNamespace, loadData, put } from './store';
import type { Question } from './model';
import {
  courseQuestions,
  type Course,
  type CourseSection,
} from './course-model';
async function call(body: unknown) {
  const r = await apiFetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const data = (await r.json()) as any;
  if (!r.ok) throw new Error(data.error ?? '课程题目核验未完成');
  return data;
}
export async function verifyCourseQuestions(
  course: Course,
  section: CourseSection,
  progress: (message: string) => void,
  ns = currentNamespace(),
) {
  if (!['math', 'ce'].includes(course.subject)) return undefined;
  const count = course.subject === 'math' ? 3 : 1;
  const questions = [
    ...courseQuestions(course, section, 'checks'),
    ...courseQuestions(course, section, 'practice'),
  ];
  if (!questions.length) return undefined;
  for (let index = 0; index < questions.length; index++) {
    if (currentNamespace() !== ns)
      throw new Error('账户已切换；核验进度已保存');
    const q = questions[index];
    if (course.subject === 'math' && q.solution?.length !== 5)
      throw Object.assign(
        new Error('课程数学题缺少完整五步解法，请修订题目后继续'),
        { rejected: true },
      );
    const id = 'course-verify:' + q.id;
    const fingerprint = JSON.stringify({
      prompt: q.prompt,
      options: q.options,
      answer: q.answer,
      explanation: q.explanation,
      solution: q.solution,
    });
    const existing = (await loadData(ns)).jobs?.find((j) => j.id === id);
    const job =
      existing?.fingerprint === fingerprint
        ? structuredClone(existing)
        : {
            id,
            kind: 'course-verification',
            fingerprint,
            solvers: [],
            passed: false,
          };
    if (job.passed) continue;
    progress(`正在核验课程题目 ${index + 1} / ${questions.length}`);
    const missing = Array.from({ length: count }, (_, i) => i).filter(
      (i) => !job.solvers[i],
    );
    const results = await Promise.allSettled(
      missing.map(async (i) => ({
        i,
        solver: (await call({ action: 'solve', question: q, slot: i + 1 }))
          .solver,
      })),
    );
    for (const result of results)
      if (result.status === 'fulfilled')
        job.solvers[result.value.i] = result.value.solver;
    await put('job', job, id, false, ns);
    if (results.some((r) => r.status === 'rejected'))
      throw new Error('部分课程题目核验未完成；继续时将复用已有结果');
    if (currentNamespace() !== ns)
      throw new Error('账户已切换；核验进度已保存');
    const verdict = await call({
      action: 'judge',
      question: q,
      solvers: job.solvers,
    });
    if (!verdict.pass)
      throw Object.assign(
        new Error('课程题目未通过核验：' + q.prompt + '；' + verdict.reason),
        { rejected: true },
      );
    job.passed = true;
    await put('job', job, id, false, ns);
  }
  return {
    method:
      count === 3 ? '3 isolated solvers + judge' : 'independent review + judge',
    solverCount: count,
    at: new Date().toISOString(),
  };
}
