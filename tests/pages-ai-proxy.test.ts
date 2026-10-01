import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import vm from 'node:vm';

test('Pages AI transport uses caller Cloudflare credentials without a Supabase login or inference for checks',async()=>{
  const source=await readFile('supabase/functions/review-ai-proxy/index.ts','utf8');
  const code=ts.transpileModule(source.replace('export async function handle','async function handle'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None}}).outputText;
  const calls:{url:string;init:RequestInit}[]=[];let handler:(r:Request)=>Promise<Response>;
  const sandbox={Deno:{serve:(h:typeof handler)=>handler=h},Response,Request,AbortSignal,
    fetch:async(url:string,init:RequestInit)=>{calls.push({url,init});return Response.json({success:true,result:[{name:'@cf/qwen/qwen3-30b-a3b-fp8'}]});}};
  vm.runInNewContext(code,sandbox);
  const headers={Origin:'https://shivr-dev.github.io','X-Cloudflare-Account':'68ab52ee180f593d1f508aedba898452','X-Cloudflare-Token':'cfut_'+'a'.repeat(40),'Content-Type':'application/json'};
  const check=await handler!(new Request('https://proxy.test',{method:'POST',headers,body:JSON.stringify({action:'check'})}));
  assert.equal(check.status,200);assert.equal(((await check.json()) as {ok:boolean}).ok,true);
  assert.equal(calls.length,1);assert.ok(calls[0].url.includes('/ai/models/search'));assert.equal(calls[0].init.method,undefined);
  assert.equal(new Headers(calls[0].init.headers).get('authorization'),'Bearer '+headers['X-Cloudflare-Token']);
  const forbidden=await handler!(new Request('https://proxy.test',{method:'POST',headers:{...headers,Origin:'https://wrong.example'},body:'{}'}));
  assert.equal(forbidden.status,403);assert.equal(calls.length,1);
  const missing=await handler!(new Request('https://proxy.test',{method:'POST',headers:{Origin:headers.Origin},body:'{}'}));assert.equal(missing.status,401);assert.equal(calls.length,1);
  const malformed=await handler!(new Request('https://proxy.test',{method:'POST',headers,body:'{}'}));assert.equal(malformed.status,400);assert.equal(calls.length,1);
  const preflight=await handler!(new Request('https://proxy.test',{method:'OPTIONS',headers:{Origin:headers.Origin}}));assert.equal(preflight.status,204);
  const cloudSource=await readFile('lib/pages-cloud.ts','utf8'),aiSource=await readFile('lib/ai-server.ts','utf8');
  assert.ok(cloudSource.includes('aiReady:config.cloudflareTokens.length>0'));
  assert.ok(!aiSource.includes('accessToken()'));
});
