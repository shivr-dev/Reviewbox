import {
  sameOrigin,
  readBody,
  requireSiteUser,
  sb,
  setSession,
  session,
  fail,
  env,
} from '@/lib/server';
export async function GET() {
  try {
    const site = await requireSiteUser();
    const s = await session(true);
    return Response.json(
      {
        user: s ? { id: s.user.id, email: s.user.email } : null,
        siteUser: site.displayName,
        aiReady: !!env('CF_ACCOUNT_ID') && !!env('CF_AI_TOKENS'),
        cloudReady: !!env('SUPABASE_URL'),
      },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (e) {
    return fail(e, 401);
  }
}
export async function POST(req: Request) {
  try {
    sameOrigin(req);
    await requireSiteUser();
    const b = await readBody(req, 5000);
    if (b.action === 'logout') {
      const s = await session(true);
      if (s)
        await sb('/auth/v1/logout', { method: 'POST' }, s.access_token).catch(
          () => {},
        );
      await setSession(null);
      return Response.json({ ok: true });
    }
    if (
      !['register', 'login'].includes(b.action) ||
      typeof b.email !== 'string' ||
      !/^\S+@\S+\.\S+$/.test(b.email) ||
      b.email.length > 254 ||
      typeof b.password !== 'string' ||
      b.password.length < 8 ||
      b.password.length > 128
    )
      throw new Error('请输入有效邮箱和至少 8 位密码');
    const data = await sb(
      b.action === 'register'
        ? '/auth/v1/signup'
        : '/auth/v1/token?grant_type=password',
      {
        method: 'POST',
        body: JSON.stringify({ email: b.email, password: b.password }),
      },
    );
    if (data.access_token) {
      await setSession(data);
      return Response.json({
        user: { id: data.user.id, email: data.user.email },
      });
    }
    return Response.json({
      confirmationRequired: true,
      message: '请在邮箱中确认注册，然后返回登录。',
    });
  } catch (e) {
    return fail(e);
  }
}
