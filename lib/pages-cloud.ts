import { pagesConfig } from './pages-vault';

const sessionKey = 'review-pages-supabase-session';
type Session = { access_token:string; refresh_token:string; expires_at:number; user:{id:string;email:string} };
function stored(): Session | null {
  try { return JSON.parse(localStorage.getItem(sessionKey) || 'null'); } catch { return null; }
}
function save(value: any) {
  const session: Session = {
    access_token:value.access_token,
    refresh_token:value.refresh_token,
    expires_at:value.expires_at ?? Math.floor(Date.now()/1000)+(value.expires_in ?? 3600),
    user:{id:value.user.id,email:value.user.email},
  };
  localStorage.setItem(sessionKey,JSON.stringify(session));
  return session;
}
async function sb(path:string, init:RequestInit={}, token?:string):Promise<any> {
  const config = await pagesConfig();
  if (!config) throw new Error('请先在「我的」解锁站点配置');
  const response = await fetch(config.supabaseUrl + path, {
    ...init,
    headers:{apikey:config.publishableKey,'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...init.headers},
    signal:init.signal ?? AbortSignal.timeout(15000),
  });
  const data = await response.json().catch(()=>null);
  if (!response.ok) {
    if (response.status === 400 || response.status === 422) throw new Error('账户信息不正确，或邮箱尚未确认');
    if (response.status === 401 || response.status === 403) throw new Error('请重新登录以继续同步');
    if (response.status === 429) throw new Error('请求较多，请稍后重试');
    throw new Error('云端暂时不可用，学习记录已保存在本地');
  }
  return data;
}
async function session(allowOffline=false):Promise<Session|null> {
  let current = stored();
  if (!current) return null;
  if (current.expires_at*1000 < Date.now()+60000) {
    try {
      current = save(await sb('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:JSON.stringify({refresh_token:current.refresh_token})}));
    } catch(error) { if (!allowOffline || navigator.onLine) throw error; }
  }
  return current;
}
export async function accessToken() { return (await session())?.access_token ?? null; }
export async function pagesApi(path:string, init?:RequestInit):Promise<Response> {
  try {
    const config = await pagesConfig();
    const method = init?.method || 'GET';
    if (path === '/api/account' && method === 'GET') {
      if (!config) return Response.json({user:null,aiReady:false,cloudReady:false,staticMode:true,vaultLocked:true});
      const current = await session(true);
      return Response.json({user:current?.user ?? null,aiReady:!!current && config.cloudflareTokens.length>0,cloudReady:true,staticMode:true,vaultLocked:false});
    }
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    if (path === '/api/account' && method === 'POST') {
      if (body?.action === 'logout') {
        const current = stored();
        if (current) await sb('/auth/v1/logout',{method:'POST'},current.access_token).catch(()=>{});
        localStorage.removeItem(sessionKey);
        return Response.json({ok:true});
      }
      if (!config) throw new Error('请先在「我的」解锁站点配置');
      if (body?.action !== 'register' && body?.action !== 'login') throw new Error('账户请求无效');
      if (typeof body.email !== 'string' || typeof body.password !== 'string' || body.password.length < 8) throw new Error('请输入有效邮箱和至少 8 位密码');
      const result = await sb(body.action === 'register' ? '/auth/v1/signup' : '/auth/v1/token?grant_type=password', {
        method:'POST',body:JSON.stringify({email:body.email,password:body.password}),
      });
      if (!result.access_token) return Response.json({confirmationRequired:true,message:'请在邮箱中确认注册，然后返回登录。'});
      return Response.json({user:save(result).user});
    }
    if (path.startsWith('/api/sync')) {
      const current = await session();
      if (!current || init?.headers && new Headers(init.headers).get('X-Review-Account') !== current.user.id)
        throw new Error('账户已变化，请重新登录后再同步');
      const status = await sb('/rest/v1/rpc/review_sync_status',{method:'POST',body:'{}'},current.access_token);
      if (method === 'POST') {
        if (body?.generation !== status.generation || !Array.isArray(body.records) || body.records.length > 100)
          throw new Error('同步版本或批次无效');
        await sb('/rest/v1/rpc/review_merge_records_v2',{method:'POST',body:JSON.stringify({records:body.records,expected_generation:body.generation})},current.access_token);
        return Response.json({ok:true});
      }
      const params = new URLSearchParams(path.split('?')[1] || '');
      if (params.has('status')) return Response.json(status);
      const cursor = params.get('cursor') || '';
      if (cursor.length>160) throw new Error('同步游标不正确');
      const records = await sb('/rest/v1/review_records?select=id,kind,payload,updated_at,deleted&order=id.asc&limit=300'+(cursor?'&id=gt.'+encodeURIComponent(cursor):''),{},current.access_token);
      return Response.json({records,cursor:records.length===300?records.at(-1).id:null,...status});
    }
    if (method === 'POST' && path === '/api/ai') {
      if (!config) throw new Error('请先解锁站点配置');
      const {generate,solve,judge,grade} = await import('./ai-server');
      const {questionSchema} = await import('./importer');
      const {seedQuestions} = await import('./seed');
      if (body.action === 'generate') return Response.json({question:await generate(body)});
      const question = questionSchema.parse(seedQuestions.find(q=>q.id===body.question?.id) ?? body.question);
      if (body.action === 'solve') return Response.json({solver:await solve(question as any,body.slot)});
      if (body.action === 'judge') return Response.json(await judge(question as any,body.solvers));
      if (body.action === 'grade') return Response.json({grade:await grade(question as any,body.answer)});
    }
    if (method === 'POST' && path === '/api/course') {
      const {generateCourseSection,courseConversation,reviseCourseSection} = await import('./course-server');
      if (body.action === 'generate') return Response.json({content:await generateCourseSection(body)});
      if (body.action === 'chat') return Response.json(await courseConversation(body));
      if (body.action === 'revise') return Response.json({content:await reviseCourseSection(body)});
    }
    if (method === 'POST' && path === '/api/exam') {
      const {examPassage,examGenerate,examSolve,examJudge} = await import('./exam-server');
      if (body.action === 'passage') return Response.json(await examPassage(body));
      if (body.action === 'generate') return Response.json(await examGenerate(body));
      if (body.action === 'solve') return Response.json(await examSolve(body));
      if (body.action === 'judge') return Response.json(await examJudge(body));
    }
    throw new Error('不支持的请求');
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'请求暂时不可用'},{status:503});
  }
}
