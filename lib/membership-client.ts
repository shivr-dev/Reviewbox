import {currentNamespace} from './store';
import {apiFetch,usesPrivateCloud} from './runtime';
import type {MembershipSnapshot,MembershipFeature} from './membership-policy';
export async function membershipRequest(action:string,payload:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
 const ns=currentNamespace();let response:Response;
 if(usesPrivateCloud()){
  const [{accessToken},{pagesConfig}]=await Promise.all([import('./pages-cloud'),import('./pages-vault')]);const token=await accessToken(),config=await pagesConfig();
  if(!token||!config)throw new Error('请先登录学习账户并连接云服务');
  response=await fetch(config.supabaseUrl+'/functions/v1/review-membership',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Cloudflare-Account':config.cloudflareAccountId,'X-Cloudflare-Token':config.cloudflareTokens[0]??''},body:JSON.stringify(action==='tutor'?payload:{action,payload}),signal:signal??AbortSignal.timeout(25000)});
 }else response=await apiFetch('/api/membership',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='tutor'?payload:{action,payload}),signal:signal??AbortSignal.timeout(25000)});
 const value:any=await response.json();if(ns!==currentNamespace())throw new Error('账户已切换，操作已停止');
 if(!response.ok)throw Object.assign(new Error(value.error??'会员服务暂不可用'),{code:value.code});
 return value;
}
export const membershipState=()=>membershipRequest('state') as Promise<MembershipSnapshot>;
export const permitMembership=(feature:MembershipFeature,authorizationRequestId?:string)=>membershipRequest('permit',{feature,requestId:crypto.randomUUID(),authorizationRequestId});
