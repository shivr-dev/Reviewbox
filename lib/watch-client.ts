import { usesPrivateCloud } from './runtime';
import { currentNamespace } from './store';
export async function watchRequest(action:string,body:Record<string,unknown>={}):Promise<any> {
  const namespace=currentNamespace();
  let response:Response;
  if(usesPrivateCloud()) {
    const [{accessToken},{pagesConfig}]=await Promise.all([import('./pages-cloud'),import('./pages-vault')]);
    const token=await accessToken(), config=await pagesConfig();
    if(!token||!config)throw new Error('请先登录云端账户，再连接手表');
    response=await fetch(config.supabaseUrl+'/functions/v1/review-watch',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({action,body}),signal:AbortSignal.timeout(25000)});
  } else response=await fetch('/api/devices',{method:'POST',headers:{'Content-Type':'application/json','X-Review-Account':namespace},body:JSON.stringify({action,body}),signal:AbortSignal.timeout(25000)});
  if(currentNamespace()!==namespace)throw new Error('账户已切换，已停止设备操作');
  const result:any=await response.json();
  if(!response.ok)throw new Error(result.error??'设备服务暂不可用，请重试');
  return result;
}
