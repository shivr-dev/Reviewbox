import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import vm from 'node:vm';
import { QWEN, GLM, GPT_OSS } from '../supabase/functions/_shared/workers-ai-models';

test('Pages AI transport uses caller Cloudflare credentials without a Supabase login or inference for checks',async()=>{
  const { outputFiles:[bundle] }=await build({entryPoints:['supabase/functions/review-ai-proxy/index.ts'],bundle:true,write:false,format:'iife'});
  const calls:{url:string;init:RequestInit}[]=[];let handler:(r:Request)=>Promise<Response>;
  const sandbox={Deno:{serve:(h:typeof handler)=>handler=h},Response,Request,AbortSignal,URLSearchParams,
    fetch:async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json({success:true,result:[{name:GLM}]});}};
  vm.runInNewContext(bundle.text,sandbox);
  const headers={Origin:'https://shivr-dev.github.io','X-Cloudflare-Account':'68ab52ee180f593d1f508aedba898452','X-Cloudflare-Token':'cfut_'+'a'.repeat(40),'Content-Type':'application/json'};
  const check=await handler!(new Request('https://proxy.test',{method:'POST',headers,body:JSON.stringify({action:'check'})}));
  assert.equal(check.status,200);assert.equal(((await check.json()) as {ok:boolean}).ok,true);
  assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/ai/models/search'));assert.equal(calls[0].init.method,undefined);
  assert.equal(new Headers(calls[0].init.headers).get('authorization'),'Bearer '+headers['X-Cloudflare-Token']);
  const forbidden=await handler!(new Request('https://proxy.test',{method:'POST',headers:{...headers,Origin:'https://wrong.example'},body:'{}'}));
  assert.equal(forbidden.status,403);assert.equal(calls.length,1);
  const missing=await handler!(new Request('https://proxy.test',{method:'POST',headers:{Origin:headers.Origin},body:'{}'}));assert.equal(missing.status,401);assert.equal(calls.length,1);
  const malformed=await handler!(new Request('https://proxy.test',{method:'POST',headers,body:'{}'}));assert.equal(malformed.status,400);assert.equal(calls.length,1);
  const makeRequest=(model:string)=>new Request('https://proxy.test',{method:'POST',headers,body:JSON.stringify({model,messages:[{role:'system',content:'JSON only'},{role:'user',content:'{}'}],max_tokens:100,stream:false})});
  assert.equal((await handler!(makeRequest(GPT_OSS))).status,400);
  assert.equal(calls.length,1);
  for (const model of [GLM,QWEN]) {
    const inference=await handler!(makeRequest(model));
    assert.equal(inference.headers.get('X-Reviewbox-Model'),model);
    assert.ok(calls.at(-1)!.url.endsWith('/ai/run/'+model));
    assert.equal(JSON.parse(String(calls.at(-1)!.init.body)).model,undefined);
  }
  const preflight=await handler!(new Request('https://proxy.test',{method:'OPTIONS',headers:{Origin:headers.Origin}}));assert.equal(preflight.status,204);
  const cloudSource=await readFile('lib/pages-cloud.ts','utf8'),aiSource=await readFile('lib/ai-server.ts','utf8');
  assert.match(cloudSource,/aiReady:\s*config\.cloudflareTokens\.length\s*>\s*0/);
  assert.ok(!aiSource.includes('accessToken()'));
});
