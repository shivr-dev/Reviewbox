import { apiFetch } from './runtime';
import { put, currentNamespace } from './store';
import { type Node, type Skill, type Question, type Grade } from './model';
export type GenerationJob = {
  id: string;
  kind: 'generation';
  node: Node;
  skill: Skill;
  difficulty: number;
  style: string;
  previousErrors: string[];
  status: string;
  createdAt: string;
  question?: Question;
  solvers: any[];
  attempt: number;
  error?: string;
  questionType?: string;
  transferFrom?: Question;
  rejectedQuestions?: { prompt: string; reason: string }[];
};
async function call(body: any): Promise<any> {
  const r = await apiFetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  const v: any = await r.json();
  if (!r.ok) throw new Error(v.error ?? '题目生成暂时不可用');
  return v;
}
export async function gradeAnswer(
  question: Question,
  answer: string,
): Promise<Grade> {
  return (await call({ action: 'grade', question, answer })).grade;
}
export async function resumeVerifiedJob(
  original: GenerationJob,
  progress: (s: string) => void,
): Promise<Question> {
  const job = { ...original, solvers: [...(original.solvers ?? [])] };
  if (job.status === 'failed' && job.attempt >= 2) job.attempt = 0;
  const originNamespace = currentNamespace();
  const persist = (kind: 'job' | 'question', payload: any) =>
    put(kind, payload, payload.id, false, originNamespace);
  try {
    while (job.attempt < 2) {
      if (!job.question) {
        progress('正在准备练习');
        job.status = 'generating';
        await persist('job', job);
        let result;
        try {
          result = await call({
            action: 'generate',
            node: job.node,
            skill: job.skill,
            difficulty: job.difficulty,
            style: job.style,
            previousErrors: job.previousErrors,
            rejectedQuestions: job.rejectedQuestions,
            questionType: job.questionType,
            transferFrom: job.transferFrom,
          });
        } catch (e) {
          const message = e instanceof Error ? e.message : '';
          if (/已丢弃|结构检查|评分点|内容不完整/.test(message)) {
            job.attempt++;
            job.rejectedQuestions = [
              ...(job.rejectedQuestions ?? []),
              { prompt: '', reason: message },
            ].slice(-4);
            await persist('job', job);
            continue;
          }
          throw e;
        }
        job.question = result.question;
        job.solvers = [];
        job.status = 'validating';
        await persist('job', job);
      }
      const q = job.question!;
      progress('正在核验题目');
      const count = job.node.subject === 'math' ? 3 : 1;
      const missing = Array.from({ length: count }, (_, i) => i).filter(
        (i) => !job.solvers[i],
      );
      const results = await Promise.allSettled(
        missing.map((i) =>
          call({ action: 'solve', question: q, slot: i + 1 }).then((v) => ({
            slot: i,
            solver: v.solver,
          })),
        ),
      );
      for (const result of results) {
        if (result.status === 'fulfilled')
          job.solvers[result.value.slot] = result.value.solver;
      }
      await persist('job', job);
      if (results.some((x) => x.status === 'rejected'))
        throw new Error('部分核验暂未完成，可以继续准备');
      const verdict = await call({
        action: 'judge',
        question: q,
        solvers: job.solvers,
      });
      if (!verdict.pass) {
        job.attempt++;
        job.rejectedQuestions = [
          ...(job.rejectedQuestions ?? []),
          { prompt: q.prompt, reason: verdict.reason },
        ];
        job.status = 'rejected';
        job.question = undefined;
        job.solvers = [];
        await persist('job', job);
        continue;
      }
      const ready: Question = {
        ...q,
        ...(job.transferFrom
          ? { transferFrom: job.transferFrom.id, tags: [...q.tags, '迁移挑战'] }
          : {}),
        verified: true,
        verification: {
          method:
            job.node.subject === 'math'
              ? '3 isolated solvers + judge'
              : 'independent review + judge',
          solverCount: count,
          at: new Date().toISOString(),
        },
      };
      await persist('question', ready);
      job.status = 'ready';
      job.question = ready;
      await persist('job', job);
      return ready;
    }
    throw new Error('题目未通过核验，请换一个知识点再试');
  } catch (e) {
    job.status = 'failed';
    job.error = e instanceof Error ? e.message : '未完成';
    await persist('job', job);
    throw e;
  }
}
export async function generateVerified(
  node: Node,
  skill: Skill,
  difficulty: number,
  style: string,
  previousErrors: string[],
  progress: (s: string) => void,
  options: { questionType?: string; transferFrom?: Question } = {},
) {
  const job: GenerationJob = {
    id: 'job:' + crypto.randomUUID(),
    kind: 'generation',
    ...options,
    node,
    skill,
    difficulty,
    style,
    previousErrors,
    status: 'generating',
    createdAt: new Date().toISOString(),
    solvers: [],
    attempt: 0,
  };
  return resumeVerifiedJob(job, progress);
}
