import { sameOrigin, readBody, requireSiteUser, fail } from '@/lib/server';
import { generate, solve, judge, grade } from '@/lib/ai-server';
import { questionSchema } from '@/lib/importer';
import { seedQuestions } from '@/lib/seed';
const limits = new Map<string, { at: number; count: number }>();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await requireSiteUser();
    const now = Date.now();
    let rate = limits.get(u.userId);
    if (!rate || now - rate.at > 60000) rate = { at: now, count: 0 };
    if (++rate.count > 40) throw new Error('请求较多，请稍后重试');
    limits.set(u.userId, rate);
    const b = await readBody(req, 100000);
    if (b.action === 'generate')
      return Response.json({ question: await generate(b) });
    const q = questionSchema.parse(
      seedQuestions.find((q) => q.id === b.question?.id) ?? b.question,
    );
    if (b.action === 'solve') {
      if (![1, 2, 3].includes(b.slot)) throw new Error('无效核验步骤');
      return Response.json({ solver: await solve(q as any, b.slot) });
    }
    if (b.action === 'judge') {
      if (!Array.isArray(b.solvers) || b.solvers.length > 3)
        throw new Error('核验结果不正确');
      return Response.json(await judge(q as any, b.solvers));
    }
    if (b.action === 'grade') {
      if (typeof b.answer !== 'string' || b.answer.length > 16000)
        throw new Error('答案过长');
      return Response.json({ grade: await grade(q as any, b.answer) });
    }
    throw new Error('不支持的请求');
  } catch (e) {
    return fail(e, 422);
  }
}
