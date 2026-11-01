/** Offline/operator tool. No source corpus, credentials or raw questions are
 * bundled into the student application. Paths are local, never executable code. */
import {createReadStream} from 'node:fs';
import {open,mkdir,readFile,writeFile} from 'node:fs/promises';
import {createInterface} from 'node:readline';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {build} from 'esbuild';
import {asyncBufferFromFile,parquetMetadataAsync,parquetReadObjects} from 'hyparquet';
import {compressors} from 'hyparquet-compressors';

export const safeRelative=p=>typeof p==='string'&&!p.startsWith('/')&&!p.includes('\\')&&!p.split('/').includes('..')&&!/^[a-z]+:/i.test(p);
export async function* readRows(file){
 if(file.endsWith('.parquet')){const buffer=await asyncBufferFromFile(file),metadata=await parquetMetadataAsync(buffer);for(let start=0;start<Number(metadata.num_rows);start+=500)for(const row of await parquetReadObjects({file:buffer,metadata,compressors,rowStart:start,rowEnd:Math.min(start+500,Number(metadata.num_rows))}))yield row;}
 else {const lines=createInterface({input:createReadStream(file),crlfDelay:Infinity});for await(const line of lines)if(line.trim()){const value=JSON.parse(line);if(Array.isArray(value)){for(const row of value)yield row;}else yield value;}}
}
/** TAR indexes retain member offsets, hashes, and shard names. Extract only
 * regular bounded raster members to a private content-addressed directory. */
export async function indexTar(file,directory){
 await mkdir(directory,{recursive:true});const f=await open(file,'r'),size=(await f.stat()).size,index=[];let offset=0;
 try {while(offset+512<=size){const head=Buffer.alloc(512);await f.read(head,0,512,offset);if(head.every(x=>x===0))break;
   const text=(a,b)=>head.subarray(a,b).toString().split('\0')[0],prefix=text(345,500),name=(prefix?prefix+'/':'')+text(0,100),length=parseInt(text(124,136).trim()||'0',8),type=text(156,157);
   if(!Number.isSafeInteger(length)||length<0||offset+512+length>size)throw new Error('Invalid TAR member length');
   if((type===''||type==='0')&&safeRelative(name)&&/\.(png|jpg|jpeg|webp)$/i.test(name)&&length<=8_000_000){const data=Buffer.alloc(length);await f.read(data,0,length,offset+512);const hash=createHash('sha256').update(data).digest('hex'),ext=path.extname(name).toLowerCase(),target=hash+ext;await writeFile(path.join(directory,target),data);index.push({path:name,shard:path.basename(file),offset:offset+512,length,hash,asset:target});}
   offset+=512+Math.ceil(length/512)*512;
 }}finally{await f.close();}await writeFile(path.join(directory,path.basename(file)+'.index.json'),JSON.stringify(index));return index;
}
async function main(){
 const args=Object.fromEntries(process.argv.slice(2).reduce((all,v,i,a)=>v.startsWith('--')?[...all,[v.slice(2),a[i+1]]]:all,[]));
 if(!['k12','eduqs','cjeval'].includes(args.source)||!args.file||!args.out)throw new Error('Usage: node scripts/ingest-reference-pool.mjs --source k12|eduqs|cjeval --file input.parquet|input.jsonl --out private-output.jsonl [--tar images.tar --images private-dir] [--upload yes]');
 await mkdir('work',{recursive:true});await build({entryPoints:['lib/reference-pool.ts'],outfile:'work/reference-adapter.mjs',bundle:true,platform:'node',packages:'external',format:'esm'});
 const {adaptReference}=await import(pathToFileURL(path.resolve('work/reference-adapter.mjs')).href);
 if(args.upload==='yes'&&(!process.env.SUPABASE_URL||!process.env.SUPABASE_SERVICE_ROLE_KEY||!process.env.REVIEW_REFERENCE_OWNER))throw new Error('Reference upload needs server-only credentials and explicit owner');
 if(args.tar)await indexTar(args.tar,args.images??path.dirname(args.out)+'/images');
 const output=await open(args.out,'w'),rejects=await open(args.out+'.rejected.jsonl','w'),seen=new Set();let accepted=0,rejected=0,line=0,batch=[];
 const upload=async()=>{if(!batch.length)return;if(args.upload==='yes'){const url=process.env.SUPABASE_URL,key=process.env.SUPABASE_SERVICE_ROLE_KEY,owner=process.env.REVIEW_REFERENCE_OWNER;if(!url||!key||!owner)throw new Error('Upload needs server-only environment credentials and explicit owner');const response=await fetch(url+'/rest/v1/rpc/review_reference_ingest',{method:'POST',headers:{apikey:key,Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({target_owner:owner,items:batch}),signal:AbortSignal.timeout(60000)});if(!response.ok)throw new Error('Reference upload failed '+response.status);}batch=[];};
 try{for await(const raw of readRows(args.file)){line++;try{const row=await adaptReference(args.source,raw,path.basename(args.file),line);if(seen.has(row.content_hash))continue;seen.add(row.content_hash);await output.write(JSON.stringify(row)+'\n');batch.push(row);accepted++;if(batch.length===50)await upload();}catch(error){if(error.message.startsWith('Reference upload'))throw error;rejected++;await rejects.write(JSON.stringify({line,error:error.message})+'\n');}}await upload();}
 finally{await output.close();await rejects.close();}
 const report={source:args.source,read:line,accepted,rejected,duplicates:line-accepted-rejected,uploaded:args.upload==='yes',at:new Date().toISOString()};await writeFile(args.out+'.report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(fileURLToPath(import.meta.url)))await main();
