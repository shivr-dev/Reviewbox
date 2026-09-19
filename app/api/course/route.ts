import { sameOrigin, requireSiteUser, readBody, fail } from '@/lib/server';
import { courseErrorMessage } from '@/lib/course-errors';
import {
  generateCourseSection,
  courseConversation,
  reviseCourseSection,
} from '@/lib/course-server';
const limits = new Map<string, { at: number; count: number }>();
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    const user = await requireSiteUser();
    const now = Date.now();
    const r = limits.get(user.userId);
    const rate = r && now - r.at < 60000 ? r : { at: now, count: 0 };
    if (++rate.count > 15) throw new Error('课程请求较多，请稍后继续');
    limits.set(user.userId, rate);
    const b = await readBody(req, 1000000);
    if (b.action === 'generate')
      return Response.json({ content: await generateCourseSection(b) });
    if (b.action === 'chat') return Response.json(await courseConversation(b));
    if (b.action === 'revise')
      return Response.json({ content: await reviseCourseSection(b) });
    throw new Error('无效课程请求');
  } catch (e) {
    if (e instanceof Error && 'parts' in e)
      return Response.json(
        {
          error: courseErrorMessage(e),
          parts: e.parts,
          repairs: (e as any).repairs,
        },
        { status: 422 },
      );
    return fail(new Error(courseErrorMessage(e)), 422);
  }
}
