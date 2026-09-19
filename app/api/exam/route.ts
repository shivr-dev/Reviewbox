import { sameOrigin, readBody, requireSiteUser, fail } from '@/lib/server';
import {
  examPassage,
  examGenerate,
  examSolve,
  examJudge,
} from '@/lib/exam-server';
const rates = new Map<string, { at: number; count: number }>();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const u = await requireSiteUser();
    const now = Date.now();
    let r = rates.get(u.userId);
    if (!r || now - r.at > 60000) r = { at: now, count: 0 };
    if (++r.count > 60) throw new Error('正在准备多组试题，请稍后继续');
    rates.set(u.userId, r);
    const b = await readBody(req, 250000);
    if (b.action === 'passage') return Response.json(await examPassage(b));
    if (b.action === 'generate') return Response.json(await examGenerate(b));
    if (b.action === 'solve') return Response.json(await examSolve(b));
    if (b.action === 'judge') return Response.json(await examJudge(b));
    throw new Error('无效请求');
  } catch (e) {
    return fail(e, 422);
  }
}
