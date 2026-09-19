import {
  sameOrigin,
  requireSiteUser,
  authenticatedSession,
  readBody,
  sb,
  fail,
} from '@/lib/server';
import { z } from 'zod';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireSiteUser();
    const session = await authenticatedSession();
    if (req.headers.get('X-Review-Account') !== session.user.id)
      throw new Error('账户已切换，请重新确认清理范围');
    const body = z
      .object({
        confirmation: z.literal('清理所有数据'),
        requestId: z.string().uuid(),
        generation: z.string().uuid(),
      })
      .parse(await readBody(req, 1000));
    const result = await sb(
      '/rest/v1/rpc/review_reset_data',
      {
        method: 'POST',
        body: JSON.stringify({
          confirmation: body.confirmation,
          request_id: body.requestId,
          expected_generation: body.generation,
        }),
      },
      session.access_token,
    );
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e, 409);
  }
}
