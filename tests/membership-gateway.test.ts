import test from 'node:test';import assert from 'node:assert/strict';
import {createMembershipGateway,estimatedNaviFeature} from '../lib/membership-gateway';
const user='aa8b1c0c-585d-4dc8-81ed-5585be252fb1',env={url:'https://test.supabase.co',serviceKey:'service-only',account:'a'.repeat(32),tokens:['private']};
function fixture(fail=false,plan='plus'){
 const calls:string[]=[],ledger=new Map<string,any>();let models=0;
 const handler=createMembershipGateway(env,{fetch:async(url:any,init:any)=>{if(String(url).endsWith('/user'))return Response.json({id:user});const {action,payload}=JSON.parse(init.body);calls.push(action);if(action==='state')return Response.json({plan});if(action==='reserve'){const old=ledger.get(payload.requestId);if(old)return Response.json({...old,replay:true});const next={status:'reserved',reserved:3,snapshot:{plan}};ledger.set(payload.requestId,next);return Response.json(next);}if(action==='settle'){const value=ledger.get(payload.requestId);Object.assign(value,{status:'committed',result:payload.result});return Response.json(value);}if(action==='refund'){ledger.get(payload.requestId).status='refunded';return Response.json({});}return Response.json({});},model:async()=>{models++;if(fail)throw new Error('failure');return {reply:'Explanation',citations:[],supplementary:true,ui_actions:[{type:'setZoom',value:1.5}],configuration_actions:[]};}});
 const send=(payload:any,auth=true)=>handler(new Request('https://service.test',{method:'POST',headers:{...(auth?{Authorization:'Bearer real-user'}:{}),'Content-Type':'application/json'},body:JSON.stringify(payload)}));
 return {send,calls,ledger,models:()=>models};
}
const request=()=>({action:'tutor',requestId:crypto.randomUUID(),input:{message:'Explain',contexts:[]},capability:'navi_deep'});
test('membership gateway requires fresh authenticated identity and rejects forged plan fields',async()=>{const f=fixture();assert.equal((await f.send(request(),false)).status,401);assert.equal((await f.send({...request(),plan:'pro'})).status,422);assert.equal(f.models(),0);});
test('successful request settles once and duplicate request returns the same final response',async()=>{const f=fixture(),r=request();const first=await f.send(r),second=await f.send(r);assert.equal(first.status,200);assert.deepEqual(await first.json(),await second.json());assert.equal(f.models(),1);assert.equal(f.calls.filter(c=>c==='settle').length,1);});
test('failed model refunds reservation, never returns a fabricated successful result',async()=>{const f=fixture(true),r=request();assert.equal((await f.send(r)).status,422);assert.equal(f.ledger.get(r.requestId).status,'refunded');assert.equal((await f.send(r)).status,409);assert.equal(f.models(),1);});
test('model tool output cannot promote Free permissions and checkout cannot fake payment',async()=>{const f=fixture(false,'free'),r=request();r.capability='navi_basic';const result:any=await (await f.send(r)).json();assert.equal(result.ui_actions,undefined);assert.equal(result.configuration_actions,undefined);assert.equal((await f.send({action:'checkout',payload:{plan:'pro'}})).status,503);});
test('server estimates multi-source and writing features instead of accepting a forged cost',()=>{assert.equal(estimatedNaviFeature({tutor:{mode:'writing'}}),'diagnosis');assert.equal(estimatedNaviFeature({contexts:[{provenance:'original-material'},{provenance:'learning-pack'}]}),'multi_context');});

test('a legacy SuperReview code uses the existing reward API and refreshes real membership state',async()=>{
 const paths:string[]=[];const handler=createMembershipGateway(env,{fetch:async(url:any,init:any)=>{
  if(String(url).endsWith('/user'))return Response.json({id:user});paths.push(String(url).split('/').pop()!);const {action}=JSON.parse(init.body);
  if(action==='redeem'&&String(url).endsWith('review_membership'))return Response.json({message:'membership_code_legacy'},{status:400});
  if(String(url).endsWith('review_game')){assert.equal(init.headers.Authorization,'Bearer user-token');return Response.json({redeemed:true});}
  return Response.json({plan:'plus',legacyUntil:'2026-12-08T00:00:00Z'});
 }});
 const response=await handler(new Request('https://service.test',{method:'POST',headers:{Authorization:'Bearer user-token','Content-Type':'application/json'},body:JSON.stringify({action:'redeem',payload:{code:'OLD-CODE',requestId:crypto.randomUUID()}})}));
 assert.equal(response.status,200);assert.equal((await response.json() as any).plan,'plus');assert.deepEqual(paths,['review_membership','review_game','review_membership']);
});
