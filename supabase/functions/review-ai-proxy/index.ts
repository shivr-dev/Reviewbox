// Authenticated transport for the encrypted, browser-unlocked personal AI token.
const allowedOrigin = 'https://shivr-dev.github.io';
const accountId = '68ab52ee180f593d1f508aedba898452';
const model = '@cf/qwen/qwen3-30b-a3b-fp8';
const cors = {
  'Access-Control-Allow-Origin': allowedOrigin,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-cloudflare-token, x-cloudflare-account',
  'Vary': 'Origin',
};
const json = (value:unknown,status=200) => Response.json(value,{status,headers:{...cors,'Cache-Control':'no-store'}});

Deno.serve(async request => {
  if (request.headers.get('origin') !== allowedOrigin) return json({error:'请求来源不正确'},403);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return json({error:'不支持的请求'},405);
  try {
    const bearer = request.headers.get('authorization') || '';
    const token = request.headers.get('x-cloudflare-token') || '';
    if (!/^Bearer eyJ[A-Za-z0-9._-]+$/.test(bearer) ||
        !/^cfut_[A-Za-z0-9]{20,160}$/.test(token) ||
        request.headers.get('x-cloudflare-account') !== accountId)
      return json({error:'请登录并解锁网站配置'},401);
    const user = await fetch(Deno.env.get('SUPABASE_URL')!+'/auth/v1/user',{
      headers:{apikey:Deno.env.get('SUPABASE_ANON_KEY')!,Authorization:bearer},
      signal:AbortSignal.timeout(10000),
    });
    const identity = await user.json() as {id?:string};
    if (!user.ok || !identity.id) return json({error:'登录已失效，请重新登录'},401);
    const source = await request.text();
    if (source.length > 150000) return json({error:'请求内容过大'},413);
    const body = JSON.parse(source);
    if (!Array.isArray(body.messages) || body.messages.length !== 2 ||
        !Number.isInteger(body.max_tokens) || body.max_tokens < 1 || body.max_tokens > 16000 ||
        body.stream !== false) return json({error:'模型请求格式不正确'},400);
    const upstream = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,{
      method:'POST',
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:source,
      signal:AbortSignal.timeout(55000),
    });
    return new Response(upstream.body,{
      status:upstream.status,
      headers:{...cors,'Content-Type':'application/json','Cache-Control':'no-store'},
    });
  } catch {
    return json({error:'模型连接暂时不可用'},503);
  }
});
