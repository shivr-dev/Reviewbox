import {
  authenticatedSession,
  env,
  fail,
  readBody,
  requireSiteUser,
  sameOrigin,
} from '@/lib/server';
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireSiteUser();
    const s = await authenticatedSession(),
      body = await readBody(req, 12000);
    const result = await fetch(
      env('SUPABASE_URL') + '/rest/v1/rpc/review_game',
      {
        method: 'POST',
        headers: {
          apikey: env('SUPABASE_PUBLISHABLE_KEY'),
          Authorization: 'Bearer ' + s.access_token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: body.action,
          payload: body.payload ?? {},
        }),
        signal: AbortSignal.timeout(15000),
      },
    );
    const data: any = await result.json();
    if (!result.ok) throw new Error(data.message ?? '奖励服务暂时不可用');
    return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    return fail(e);
  }
}
