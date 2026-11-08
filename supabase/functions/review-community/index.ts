const allow=(origin:string)=>['https://shivr-dev.github.io','https://review-study-kevin.shivrdream.chatgpt.site'].includes(origin)||/^http:\/\/(localhost|127\.0\.0\.1):\d{2,5}$/.test(origin);
export async function handle(request:Request){
 const origin=request.headers.get('origin')??'';
 const headers={'Access-Control-Allow-Origin':allow(origin)?origin:'null','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Vary':'Origin','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
 const json=(value:unknown,status=200)=>Response.json(value,{status,headers});
 if(origin&&!allow(origin))return json({error:'origin'},403);
 if(request.method==='OPTIONS')return json({});if(request.method!=='POST')return json({error:'method'},405);
 try{
  if(Number(request.headers.get('content-length'))>16000)return json({error:'input'},413);
  const reader=request.body?.getReader();if(!reader)return json({error:'input'},400);let size=0;const chunks:Uint8Array[]=[];
  while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>16000){await reader.cancel();return json({error:'input'},413);}chunks.push(part.value);}
  const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  const input=JSON.parse(new TextDecoder().decode(bytes));
  const keys=['id','keyword','subject','grade','curriculum','language','exam','content_type','difficulty','sort','installed','cursor','limit'];
  if(!input||Array.isArray(input)||Object.keys(input).some(k=>!keys.includes(k)))return json({error:'input'},400);
  for(const [key,value]of Object.entries(input)){
   if(key==='limit'){if(!Number.isInteger(value)||Number(value)<1||Number(value)>24)return json({error:'input'},400);}
   else if(key==='installed'){if(!Array.isArray(value)||value.length>200||value.some(v=>typeof v!=='string'||! /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(v)))return json({error:'input'},400);}
   else if(typeof value!=='string'||value.length>(key==='cursor'?2500:120))return json({error:'input'},400);
  }
  if(input.sort&&!['published','updated','name','installed'].includes(input.sort))return json({error:'input'},400);
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const response=await fetch(url+'/rest/v1/rpc/review_catalog_list',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({filters:input}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)return json({error:'unavailable'},503);
  return json(await response.json());
 }catch{return json({error:'unavailable'},503);}
}
Deno.serve(handle);
