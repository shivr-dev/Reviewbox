import {extractJsonText,repairJsonCore,type JsonRepairResult} from './import-json-repair-core';
export type {JsonRepairResult} from './import-json-repair-core';
/** Local worker can be terminated; no user content is sent over a network. */
export async function repairImportJson(rawText:string):Promise<JsonRepairResult>{
 if(rawText.length>15*1024*1024)return {original:rawText,extracted:'',text:'',repaired:false,requiresConfirmation:false,changes:[],error:'JSON 内容超过 15 MB，请拆分后导入'};
 if(typeof Worker==='undefined'){
  if(rawText.length>256000)return {original:rawText,extracted:'',text:'',repaired:false,requiresConfirmation:false,changes:[],error:'此环境不支持大型 JSON 的安全后台修复，请在浏览器导入'};
  return repairJsonCore(rawText);
 }
 return new Promise(resolve=>{
  const worker=new Worker(new URL('./import-json-repair.worker.ts',import.meta.url),{type:'module'});
  const fail=(error:string)=>{worker.terminate();resolve({original:rawText,extracted:extractJsonText(rawText),text:rawText,repaired:false,requiresConfirmation:false,changes:[],error});};
  const timer=setTimeout(()=>fail('修复超时，原文已保留，请拆分文件或重新复制'),4000);
  worker.onmessage=(event:MessageEvent<JsonRepairResult>)=>{clearTimeout(timer);worker.terminate();resolve(event.data);};
  worker.onerror=()=>{clearTimeout(timer);fail('本地修复工具未能加载，原文已保留，请重试');};worker.postMessage(rawText);
 });
}
