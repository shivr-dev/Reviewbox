import { pagesConfig } from './pages-vault';

export async function checkPagesAI() {
  const config = await pagesConfig();
  if (!config) throw new Error('请先解锁私有学习配置');
  const results = await Promise.all(config.cloudflareTokens.map(async token => {
    const response = await fetch(config.supabaseUrl+'/functions/v1/review-ai-proxy',{
      method:'POST',headers:{apikey:config.publishableKey,'Content-Type':'application/json','X-Cloudflare-Token':token,'X-Cloudflare-Account':config.cloudflareAccountId},
      body:JSON.stringify({action:'check'}),signal:AbortSignal.timeout(20000),
    });
    const result = await response.json().catch(()=>null) as {ok?:boolean;error?:string}|null;
    if (!response.ok || !result?.ok) throw new Error(result?.error || 'AI 连接检查未完成（'+response.status+'）');
    return true;
  }));
  return results.length;
}
