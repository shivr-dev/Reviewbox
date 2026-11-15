import {currentNamespace} from './store';
import {apiFetch,usesPrivateCloud} from './runtime';
import {DiagnosticError,diagnoseNaviFailure,naviDiagnostic,safeDiagnostic} from './navi-diagnostics';
import type {MembershipSnapshot,MembershipFeature} from './membership-policy';
export async function membershipRequest(action:string,payload:Record<string,unknown>={},signal?:AbortSignal):Promise<any>{
 const ns=currentNamespace(),requestId=typeof payload.requestId==='string'?payload.requestId:crypto.randomUUID();let response:Response;
 try{
  if(usesPrivateCloud()){
   const [{accessToken},{pagesConfig}]=await Promise.all([import('./pages-cloud'),import('./pages-vault')]);const token=await accessToken(),config=await pagesConfig();
   if(!config)throw new DiagnosticError('请先连接云服务',naviDiagnostic('RB-CONNECTION-CONFIG','client',{requestId}), 'ai_unconfigured');
   if(!token)throw new DiagnosticError('请先登录学习账户',naviDiagnostic('RB-AUTH-REQUIRED','identity',{requestId}), 'auth');
   response=await fetch(config.supabaseUrl+'/functions/v1/review-membership',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','X-Cloudflare-Account':config.cloudflareAccountId,'X-Cloudflare-Token':config.cloudflareTokens[0]??''},body:JSON.stringify(action==='tutor'?payload:{action,payload}),signal:signal??AbortSignal.timeout(25000)});
  }else response=await apiFetch('/api/membership',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(action==='tutor'?payload:{action,payload}),signal:signal??AbortSignal.timeout(25000)});
  let value:any;try{value=await response.json();}catch{throw new DiagnosticError('连接服务没有返回可读取的结果',naviDiagnostic('RB-GATEWAY-NONJSON','gateway',{requestId,httpStatus:response.status,retryable:response.status>=500}));}
  if(ns!==currentNamespace())throw new DiagnosticError('账户已切换，操作已停止',naviDiagnostic('RB-ACCOUNT-CHANGED','client',{requestId}),'auth');
  if(!response.ok){const diagnostic=safeDiagnostic(value?.diagnostic)??naviDiagnostic(response.status===401?'RB-AUTH-REQUIRED':response.status===404?'RB-GATEWAY-NOT-FOUND':'RB-GATEWAY-HTTP','gateway',{requestId,httpStatus:response.status,detail:value?.error,retryable:response.status>=500});throw new DiagnosticError(value.error??'会员服务暂不可用',diagnostic,value.code??'request');}
  return value;
 }catch(e){if(e instanceof DiagnosticError)throw e;throw new DiagnosticError('连接服务未完成请求',diagnoseNaviFailure(e,'client',requestId));}
}
export const membershipState=()=>membershipRequest('state') as Promise<MembershipSnapshot>;
export const permitMembership=(feature:MembershipFeature,authorizationRequestId?:string)=>membershipRequest('permit',{feature,requestId:crypto.randomUUID(),authorizationRequestId});
