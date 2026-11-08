import { z } from 'zod';
import { naviConversation } from './navi-server';
import { membershipFeature, MEMBERSHIP_FEATURES, hasMembershipFeature, type MembershipFeature } from './membership-policy';
type Environment={url:string;serviceKey:string;publishableKey?:string;account?:string;tokens?:string[]};
type GatewayDependencies={fetch?:typeof fetch;model?:typeof naviConversation};
const tutorRequest=z.object({action:z.literal('tutor'),requestId:z.string().uuid(),input:z.record(z.string(),z.unknown()),capability:z.enum(['navi_basic','navi_deep','agent']).default('navi_basic'),trial:z.enum(['plus','pro']).optional()}).strict();
const memberRequest=z.object({action:z.string().max(40),payload:z.record(z.string(),z.unknown()).default({})}).strict();
export function estimatedNaviFeature(input:any,requested:'navi_basic'|'navi_deep'|'agent'='navi_basic'):MembershipFeature {
  if(requested==='agent')return 'agent';
  if(input?.tutor?.mode==='writing')return 'diagnosis';
  if(Array.isArray(input?.contexts)&&input.contexts.filter((c:any)=>c?.provenance!=='learning-evidence').length>1)return 'multi_context';
  if(input?.tutor?.helpLevel===4)return 'navi_deep';
  return requested;
}
/** Server is the authority for identity, plan and credits. No client plan/balance field is accepted. */
export function createMembershipGateway(env:Environment,dependencies:GatewayDependencies={}) {
  const request=dependencies.fetch??fetch,model=dependencies.model??naviConversation;
  return async(req:Request)=>{
    const origin=req.headers.get('Origin')??'';
    const allowed=!origin||origin==='https://shivr-dev.github.io'||origin==='https://review-study-kevin.shivrdream.chatgpt.site'||/^http:\/\/(?:127\.0\.0\.1|localhost):\d{2,5}$/.test(origin);
    const headers={'Content-Type':'application/json','Cache-Control':'no-store',...(allowed&&origin?{'Access-Control-Allow-Origin':origin,'Vary':'Origin'}:{}),'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-cloudflare-account,x-cloudflare-token','Access-Control-Allow-Methods':'POST,OPTIONS'};
    const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers});
    if(!allowed)return reply({code:'origin'},403);
    if(req.method==='OPTIONS')return new Response(null,{status:204,headers});
    if(req.method!=='POST')return reply({code:'method'},405);
    if(!env.url||!env.serviceKey)return reply({code:'membership_unconfigured',error:'会员服务尚未配置'},503);
    let reserved=false,userId='',requestId='';
    const rpc=async(action:string,payload:Record<string,unknown>,token?:string,endpoint?:string)=>{
      const response=await request(env.url+'/rest/v1/rpc/'+(endpoint??(token?'review_membership':'review_membership_server')),{method:'POST',headers:{apikey:env.publishableKey??env.serviceKey,Authorization:'Bearer '+(token??env.serviceKey),'Content-Type':'application/json'},body:JSON.stringify({action,payload}),signal:AbortSignal.timeout(15000)});
      const result:any=await response.json().catch(()=>null);
      if(!response.ok)throw Object.assign(new Error(result?.message??'membership_service'),{status:response.status});
      return result;
    };
    try {
      const token=req.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
      if(!token)return reply({code:'auth',error:'请先登录学习账户'},401);
      const auth=await request(env.url+'/auth/v1/user',{headers:{apikey:env.publishableKey??env.serviceKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(12000)});
      const identity:any=await auth.json().catch(()=>null);
      if(!auth.ok||typeof identity?.id!=='string')return reply({code:'auth',error:'请重新登录学习账户'},401);
      userId=identity.id;
      const raw=await req.text();if(new TextEncoder().encode(raw).length>240000)return reply({code:'size'},413);
      const input=JSON.parse(raw);
      if(input?.action!=='tutor') {
        const parsed=memberRequest.parse(input);
        if(parsed.action==='checkout')return reply({code:'payment_unavailable',error:'支付渠道尚未接入。当前可使用已授权的会员兑换码。'},503);
        if(parsed.action==='permit') {
          if(parsed.payload.authorizationRequestId){const feature=membershipFeature.parse(parsed.payload.feature);return reply(await rpc('authorize-tool',{userId,requestId:z.string().uuid().parse(parsed.payload.authorizationRequestId),feature}));}
          const feature=membershipFeature.parse(parsed.payload.feature);if(MEMBERSHIP_FEATURES[feature].credits!==0)return reply({code:'membership_feature'},400);
          requestId=z.string().uuid().parse(parsed.payload.requestId);
          const fingerprint=await digest(JSON.stringify({feature,requestId,userId}));
          const reservation=await rpc('reserve',{userId,requestId,fingerprint,feature,trial:parsed.payload.trial});
          reserved=!reservation.replay;
          if(reservation.replay&&reservation.status!=='committed')return reply({code:'request_replay'},409);
          if(reserved)await rpc('settle',{userId,requestId,result:{permitted:true,feature}});
          reserved=false;return reply({permitted:true,feature,snapshot:(await rpc('state',{userId}))});
        }
        if(!['state','cancel','redeem','admin-code-save','admin-code-disable','admin-code-list','workflow-list','workflow-save','workflow-run','workflow-delete'].includes(parsed.action))return reply({code:'membership_action'},400);
        if(parsed.action==='redeem'){
          try{return reply(await rpc('redeem',parsed.payload,token));}
          catch(e){if(!(e instanceof Error)||!e.message.includes('membership_code_legacy'))throw e;await rpc('redeem',parsed.payload,token,'review_game');return reply({...await rpc('state',{},token),redeemed:true,legacy:true});}
        }
        return reply(await rpc(parsed.action,parsed.payload,token));
      }
      const parsed=tutorRequest.parse(input);requestId=parsed.requestId;
      // BYOK compatibility is request-local; it never changes membership authority or global credentials.
      const account=env.account||req.headers.get('X-Cloudflare-Account')||'',headerToken=req.headers.get('X-Cloudflare-Token')||'';
      const tokens=env.tokens?.length?env.tokens:headerToken?[headerToken]:[];
      if(!/^[a-f0-9]{32}$/i.test(account)||!tokens.length)return reply({code:'ai_unconfigured',error:'智能服务尚未配置，请检查连接配置'},503);
      const feature=estimatedNaviFeature(parsed.input,parsed.capability);
      const fingerprint=await digest(JSON.stringify({input:parsed.input,feature,trial:parsed.trial??null}));
      const reservation=await rpc('reserve',{userId,requestId,fingerprint,feature,trial:parsed.trial});
      if(reservation.replay) {
        if(reservation.status==='committed'&&reservation.result)return reply(reservation.result);
        return reply({code:'request_replay',error:'此请求正在处理或已结束，请刷新对话后重试。'},409);
      }
      reserved=true;
      const environment=(name:string)=>name==='CF_ACCOUNT_ID'||name==='CF_ACCOUNT_IDS'?account:name==='CF_AI_TOKENS'?JSON.stringify(tokens):'';
      const answer=await model(parsed.input,{environment,depth:feature==='navi_basic'?'basic':feature==='agent'?'agent':'deep'});
      const plan=reservation.snapshot.plan;
      if(!hasMembershipFeature(plan,'workspace')&&parsed.trial!=='plus'&&parsed.trial!=='pro')delete answer.ui_actions;
      if(!hasMembershipFeature(plan,'agent')&&parsed.trial!=='pro'){delete answer.configuration_actions;delete answer.tutor_actions;}
      const response={...answer,membership:{feature,credits:reservation.reserved,requestId}};
      await rpc('settle',{userId,requestId,result:response});reserved=false;
      return reply(response);
    } catch(error) {
      if(reserved)try{await rpc('refund',{userId,requestId});}catch{/* Reservation timeout refunds interrupted calls; never claim a completed refund. */}
      const message=error instanceof Error?error.message:'';
      const messages:Record<string,string>={membership_upgrade:'当前功能需要更高会员等级或明确使用体验次数',membership_credits:'本周期 AI Credits 已用完',membership_replay_mismatch:'该请求编号已用于另一项操作，请重新发起',membership_rate:'请求较多，请稍后再试',membership_code_invalid:'兑换码或会员天数格式不正确',membership_code_unavailable:'兑换码无效、已停用或已到期',membership_code_limit:'该兑换码的可用次数已用完',membership_admin:'当前账户没有会员码管理权限',workflow_rate:'报告运行较频繁，请稍后重试',workflow_unavailable:'工作流已暂停或移除，请先恢复',workflow_invalid:'请检查工作流名称与设置',workflow_timezone:'所选时区不可用',format:'请求格式需要检查'};
      const known=Object.keys(messages).find(c=>message.includes(c));
      const modelCode=typeof (error as any)?.code==='string'?(error as any).code:undefined;
      const code=known??modelCode??(error instanceof z.ZodError?'format':'request');
      return reply({code,error:messages[code]??'本次请求未完成，请稍后重试'},code.startsWith('membership_')?403:422);
    }
  };
}
async function digest(text:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text))),b=>b.toString(16).padStart(2,'0')).join('');}
