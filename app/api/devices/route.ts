import { authenticatedSession, requireSiteUser, sameOrigin, readBody, env, fail } from '@/lib/server';
export async function POST(request:Request) {
  try {
    sameOrigin(request);await requireSiteUser();const session=await authenticatedSession();
    if(request.headers.get('X-Review-Account')!==session.user.id)throw new Error('账户已切换，请重新打开设备页面');
    const input=await readBody(request,5000000);
    const response=await fetch(env('SUPABASE_URL')+'/functions/v1/review-watch',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify(input),signal:AbortSignal.timeout(25000)});
    return new Response(response.body,{status:response.status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}});
  } catch(error) {return fail(error);}
}
