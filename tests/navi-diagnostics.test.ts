import test from 'node:test';import assert from 'node:assert/strict';
import {runJSON} from '../lib/ai-server';
import {naviConversation} from '../lib/navi-server';
import {diagnosticText,diagnosticReport,naviDiagnostic,safeDiagnostic} from '../lib/navi-diagnostics';
import {createMembershipGateway} from '../lib/membership-gateway';
import { GEMMA, GLM, GPT_OSS } from '../supabase/functions/_shared/workers-ai-models';
const environment=(key:string)=>key==='CF_ACCOUNT_ID'?'a'.repeat(32):key==='CF_AI_TOKENS'?'["test-token-only"]':'';
const input={message:'Explain',locale:'en',contexts:[],history:[],tutor:{mode:'auto',helpLevel:1}};
test('injected server runtime never enters browser vault even when window exists',async()=>{
 const oldFetch=globalThis.fetch,oldWindow=Object.getOwnPropertyDescriptor(globalThis,'window');let url='';
 Object.defineProperty(globalThis,'window',{value:{},configurable:true});
 try{globalThis.fetch=async target=>{url=String(target);return Response.json({result:{response:'{"answer":"ok"}'}});};const result:any=await runJSON('explain',{},0,false,200,undefined,undefined,false,{environment});assert.equal(result.answer,'ok');assert.ok(url.startsWith('https://api.cloudflare.com/'));}
 finally{globalThis.fetch=oldFetch;if(oldWindow)Object.defineProperty(globalThis,'window',oldWindow);else delete(globalThis as any).window;}
});
test('upstream authentication errors retain HTTP status and provider code through Navi',async()=>{
 const oldFetch=globalThis.fetch;let calls=0;
 try{globalThis.fetch=async()=>{calls++;return Response.json({errors:[{code:10000,message:'Authentication error; token=secret-value'}]},{status:403});};await assert.rejects(naviConversation(input,{environment}),(e:any)=>{assert.equal(e.diagnostic.code,'RB-CF-AUTH');assert.equal(e.diagnostic.httpStatus,403);assert.deepEqual(e.diagnostic.upstreamCodes,['10000']);assert.ok(!JSON.stringify(e.diagnostic).includes('secret-value'));return true;});assert.equal(calls,1);}
 finally{globalThis.fetch=oldFetch;}
});
test('Gemma retries unsupported native JSON mode once and then uses GLM on a retryable outage',async()=>{
 const fetchBefore=globalThis.fetch;
 const calls:{url:string;body:any}[]=[];
 try {
  globalThis.fetch=async (url,init)=>{
   const body=JSON.parse(String(init?.body));calls.push({url:String(url),body});
   if(calls.length===1)return Response.json({errors:[{message:'response_format is not supported'}]},{status:400});
   if(calls.length===2)return Response.json({errors:[{message:'provider unavailable'}]},{status:503});
   return Response.json({result:{choices:[{finish_reason:'stop',message:{reasoning_content:'hidden',content:[{type:'text',text:'{"answer":42}'}]}}]}});
  };
  const schema={type:'object',properties:{answer:{type:'integer'}},required:['answer']};
  assert.deepEqual(await runJSON('exact answer',{},0,true,200,schema,undefined,false,{environment}),{answer:42});
  assert.deepEqual(calls.map(c=>c.url.split('/ai/run/')[1]),[GEMMA,GEMMA,GLM]);
  assert.equal(calls[0].body.response_format.type,'json_object');
  assert(calls.slice(1).every(c=>!c.body.response_format));
  assert(calls.every(c=>c.body.messages[0].content.includes('Required JSON schema')&&!/\/(no_)?think\b/.test(c.body.messages[0].content)));
 } finally {globalThis.fetch=fetchBefore;}
});
test('task routing and explicit evaluation never silently select GPT-OSS for normal traffic',async()=>{
 const fetchBefore=globalThis.fetch;
 const calls:string[]=[];
 try {
  globalThis.fetch=async url=>{calls.push(String(url).split('/ai/run/')[1]);return Response.json({result:{response:{answer:1}}});};
  await runJSON('classify',{},0,false,200,undefined,undefined,false,{environment,light:true});
  await runJSON('learn',{},0,false,200,undefined,undefined,false,{environment});
  await runJSON('benchmark',{},0,false,200,undefined,undefined,false,{environment,evaluationModel:GPT_OSS});
  assert.deepEqual(calls,[GLM,GEMMA,GPT_OSS]);
  await assert.rejects(runJSON('learn',{},0,false,200,undefined,undefined,false,{environment:key=>key==='CF_AI_MODEL'?GPT_OSS:environment(key)}),/CF_AI_MODEL/);
  assert.equal(calls.length,3);
 } finally {globalThis.fetch=fetchBefore;}
});
test('truncation diagnostics distinguish final-content failure and preserve retry count',async()=>{
 const oldFetch=globalThis.fetch;try{globalThis.fetch=async()=>Response.json({result:{choices:[{finish_reason:'length',message:{content:'{"reply":"unfinished'}}]}});await assert.rejects(naviConversation(input,{environment}),(e:any)=>e.diagnostic.code==='RB-MODEL-TRUNCATED'&&e.diagnostic.attempts===2);}finally{globalThis.fetch=oldFetch;}
});
test('diagnostic reports only expose allowlisted metadata and redact credentials',()=>{
 const d=safeDiagnostic({...naviDiagnostic('RB-CF-AUTH','cloudflare'),detail:'Bearer abcdefg token=private password=hidden https://example.com/?key=private person@example.com',reasoning:'private reasoning',prompt:'private prompt',headers:{authorization:'secret'}})!;
 const result=diagnosticReport(d);for(const secret of ['abcdefg','private','hidden','person@example.com','reasoning','prompt','authorization'])assert.ok(!result.includes(secret),secret);
 assert.ok(diagnosticText('test').length>0);
});
test('gateway error report keeps the request ID and upstream diagnostic without persisting success',async()=>{
 const id=crypto.randomUUID(),user=crypto.randomUUID(),actions:string[]=[];
 const handler=createMembershipGateway({url:'https://test.supabase.co',serviceKey:'service',account:'a'.repeat(32),tokens:['test']},{fetch:async(url:any,init:any)=>{if(String(url).endsWith('/user'))return Response.json({id:user});const b=JSON.parse(init.body);actions.push(b.action);return Response.json(b.action==='reserve'?{replay:false,reserved:1,snapshot:{plan:'free'}}:{});},model:async()=>{throw Object.assign(new Error('request'),{diagnostic:naviDiagnostic('RB-CF-AUTH','cloudflare',{httpStatus:403,upstreamCodes:['10000']})});}});
 const r=await handler(new Request('https://service.test',{method:'POST',headers:{Authorization:'Bearer user','Content-Type':'application/json'},body:JSON.stringify({action:'tutor',requestId:id,input,capability:'navi_basic'})}));const result:any=await r.json();assert.equal(result.diagnostic.requestId,id);assert.equal(result.diagnostic.code,'RB-CF-AUTH');assert.equal(result.diagnostic.httpStatus,403);assert.ok(actions.includes('refund'));assert.ok(!actions.includes('settle'));
});
