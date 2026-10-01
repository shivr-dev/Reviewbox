// Caller-owned Cloudflare credentials authenticate at Cloudflare. No server AI
// secret or database access is used. Supabase login is only needed for sync.
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

export async function handle(request: Request) {
  if (request.headers.get('origin') !== allowedOrigin) return json({error:'请求来源不正确'},403);
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:cors});
  if (request.method !== 'POST') return json({error:'不支持的请求'},405);
  try {
    const token = request.headers.get('x-cloudflare-token') || '';
    if (!/^cfut_[A-Za-z0-9]{20,160}$/.test(token) ||
        request.headers.get('x-cloudflare-account') !== accountId)
      return json({error:'请先解锁网站的私有学习配置'},401);
    const source = await request.text();
    if (source.length > 150000) return json({error:'请求内容过大'},413);
    const body = JSON.parse(source);
    if (body.action === 'check') {
      // Model discovery validates the actual AI credential without inference.
      const check = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?search=qwen3-30b-a3b-fp8&per_page=1`,{
        headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000),
      });
      const data = await check.json();
      if (!check.ok || data.success === false) return json({error:'Cloudflare 凭据已失效或没有 Workers AI 权限，请更新私有配置'},check.status===429?429:403);
      if (!data.result?.some((m:{name:string})=>m.name===model)) return json({error:'所选模型暂时不可用'},503);
      return json({ok:true,model});
    }
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
}
Deno.serve(handle);
