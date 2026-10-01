// Checks credentials and transport without sending an inference request.
import { createDecipheriv, pbkdf2Sync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
let password = '';
for await (const part of process.stdin) password += part;
const sealed = JSON.parse(await readFile('public/pages-vault.json','utf8'));
const bytes = Buffer.from(sealed.ciphertext,'base64');
const key = pbkdf2Sync(password.trim(),Buffer.from(sealed.salt,'base64'),310000,32,'sha256');
const decipher = createDecipheriv('aes-256-gcm',key,Buffer.from(sealed.iv,'base64'));
decipher.setAuthTag(bytes.subarray(-16));
const config = JSON.parse(Buffer.concat([decipher.update(bytes.subarray(0,-16)),decipher.final()]).toString());
const proxy = config.supabaseUrl+'/functions/v1/review-ai-proxy';
const preflight = await fetch(proxy,{method:'OPTIONS',headers:{Origin:'https://shivr-dev.github.io','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'apikey,content-type,x-cloudflare-token,x-cloudflare-account'}});
console.log(JSON.stringify({preflight:preflight.status,cors:preflight.headers.get('access-control-allow-origin')}));
for (const [slot,token] of config.cloudflareTokens.entries()) {
  const url = process.argv.includes('--proxy') ? proxy : `https://api.cloudflare.com/client/v4/accounts/${config.cloudflareAccountId}/ai/models/search?search=qwen3-30b-a3b-fp8&per_page=1`;
  const response = await fetch(url,process.argv.includes('--proxy') ? {method:'POST',headers:{Origin:'https://shivr-dev.github.io',apikey:config.publishableKey,'Content-Type':'application/json','X-Cloudflare-Token':token,'X-Cloudflare-Account':config.cloudflareAccountId},body:JSON.stringify({action:'check'})} : {headers:{Authorization:'Bearer '+token}});
  const data = await response.json();
  console.log(JSON.stringify({slot,status:response.status,success:data.success ?? data.ok,error:data.error,errors:data.errors?.map(x=>({code:x.code,message:x.message})),models:Array.isArray(data.result)?data.result.map(x=>x.name):undefined}));
}
