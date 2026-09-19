import { env as workerEnv } from 'cloudflare:workers';
import { cookies } from 'next/headers';
import { getChatGPTUser } from '@/app/chatgpt-auth';
export const env = (name: string) =>
  String((workerEnv as any)[name] ?? process.env[name] ?? '');
export async function requireSiteUser() {
  const u = await getChatGPTUser();
  if (!u) throw new Error('请先登录学习空间');
  return u;
}
export function sameOrigin(req: Request) {
  const origin = req.headers.get('origin');
  if (origin && origin !== new URL(req.url).origin)
    throw new Error('请求来源不匹配');
}
export async function readBody(req: Request, max = 1500000) {
  if (Number(req.headers.get('content-length') ?? 0) > max)
    throw new Error('内容过大');
  const text = await req.text();
  if (text.length > max) throw new Error('内容过大');
  return JSON.parse(text);
}
const encode = (v: Uint8Array) => btoa(String.fromCharCode(...v));
const decode = (v: string) => Uint8Array.from(atob(v), (c) => c.charCodeAt(0));
async function encryptionKey() {
  const secret = env('SESSION_SECRET');
  if (!secret) throw new Error('云端账户尚未配置');
  return crypto.subtle.importKey(
    'raw',
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secret)),
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt'],
  );
}
export async function setSession(data: any) {
  const jar = await cookies();
  if (!data) {
    jar.delete('review_session');
    return;
  }
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const minimal = {
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    expires_at: data.expires_at,
    user: { id: data.user.id, email: data.user.email },
  };
  const cipher = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      await encryptionKey(),
      new TextEncoder().encode(JSON.stringify(minimal)),
    ),
  );
  jar.set('review_session', encode(iv) + '.' + encode(cipher), {
    httpOnly: true,
    secure: env('NODE_ENV') !== 'development',
    sameSite: 'strict',
    path: '/',
    maxAge: 60 * 60 * 24 * 30,
  });
}
async function readSession() {
  try {
    const raw = (await cookies()).get('review_session')?.value;
    if (!raw) return null;
    const [iv, cipher] = raw.split('.');
    const plain = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(iv) },
      await encryptionKey(),
      decode(cipher),
    );
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}
export async function sb(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<any> {
  const url = env('SUPABASE_URL'),
    key = env('SUPABASE_PUBLISHABLE_KEY');
  if (!url || !key) throw new Error('云端连接尚未配置');
  const r = await fetch(url + path, {
    ...init,
    headers: {
      apikey: key,
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(15000),
  });
  const body: any = await r.json().catch(() => null);
  if (!r.ok) {
    if (r.status === 400 && body?.msg?.includes('Email'))
      throw new Error('请先在邮箱确认注册，再登录');
    if (r.status === 400 || r.status === 422)
      throw new Error('账户信息不正确，或邮箱尚未确认');
    if (r.status === 401 || r.status === 403)
      throw new Error('请重新登录以继续同步');
    if (r.status === 429) throw new Error('请求较多，请稍后重试');
    throw new Error('云端暂时不可用，学习记录已保存在本地');
  }
  return body;
}
export async function session(allowStaleIdentity = false) {
  let s = await readSession();
  if (!s) return null;
  if (s.expires_at * 1000 < Date.now() + 60000) {
    try {
      s = await sb('/auth/v1/token?grant_type=refresh_token', {
        method: 'POST',
        body: JSON.stringify({ refresh_token: s.refresh_token }),
      });
      await setSession(s);
    } catch (error) {
      // Offline identity selects the local namespace; sync still validates a live user below.
      if (allowStaleIdentity) return s;
      throw error;
    }
  }
  return s;
}
export async function authenticatedSession() {
  const s = await session();
  if (!s) throw new Error('请登录以同步学习记录');
  const u = await sb('/auth/v1/user', {}, s.access_token);
  if (u.id !== s.user.id) throw new Error('账户验证失败');
  return s;
}
export function fail(error: unknown, status = 400) {
  return Response.json(
    { error: error instanceof Error ? error.message : '暂时无法完成，请重试' },
    { status, headers: { 'Cache-Control': 'no-store' } },
  );
}
