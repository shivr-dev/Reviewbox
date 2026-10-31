export type JsonRepairResult={original:string;extracted:string;text:string;value?:unknown;repaired:boolean;requiresConfirmation:boolean;changes:string[];diff?:{prefix:number;removed:string;added:string};error?:string};
export function extractJsonText(raw:string){const trimmed=raw.trim();const fenced=trimmed.match(/^```(?:json|javascript|js|python)?\s*\n?([\s\S]*?)\n?```\s*$/i);return fenced?fenced[1].trim():trimmed;}
/** Lexical guards do not execute content or invent missing values. */
export function inspectRepairInput(raw:string,syntaxRepair=true){
 if(raw.length>15*1024*1024)throw new Error('JSON 内容超过 15 MB，请拆分后导入');
 let quote='',escaped=false,depth=0,maxDepth=0,outside='';
 for(const c of raw){if(quote){outside+=' ';if(escaped)escaped=false;else if(c==='\\')escaped=true;else if(c===quote)quote='';}else if(c==='"'||c==="'"){quote=c;outside+=' ';}else{outside+=c;if(c==='{'||c==='[')maxDepth=Math.max(maxDepth,++depth);else if(c==='}'||c===']')depth--;if(maxDepth>64)throw new Error('JSON 嵌套超过 64 层，不能安全导入');}}
 if(!syntaxRepair)return;
 if(quote)throw new Error('内容在文字字段中截断，无法确认完整答案。请重新复制完整学习包');
 if(/:\s*$/.test(outside)||/\b(?:NaN|Infinity|undefined)\b|\.\.\./.test(outside))throw new Error('缺失或不确定的字段值不能自动补全');
 // Bare property names are syntax. Bare values other than JSON/Python literals
 // are ambiguous content and must not be turned into guessed answer strings.
 const words=outside.matchAll(/[A-Za-z_$][\w$]*/g);
 for(const word of words){const after=outside.slice(word.index!+word[0].length).trimStart(),before=outside.slice(0,word.index);if(after.startsWith(':')||['true','false','null','True','False','None'].includes(word[0]))continue;if(/^e\d+$/i.test(word[0])&&/\d$/.test(before))continue;if(/^[eE]$/.test(word[0])&&/\d$/.test(before)&&/^[+-]\d+(?:\s|,|}|\]|$)/.test(after))continue;throw new Error('发现未加引号或被截断的字段值，请确认原始内容');}
}
function diff(original:string,text:string){let prefix=0,end=0;while(prefix<Math.min(original.length,text.length)&&original[prefix]===text[prefix])prefix++;while(end<Math.min(original.length-prefix,text.length-prefix)&&original[original.length-1-end]===text[text.length-1-end])end++;return {prefix,removed:original.slice(prefix,original.length-end),added:text.slice(prefix,text.length-end)};}
export async function repairJsonCore(original:string):Promise<JsonRepairResult>{
 const extracted=extractJsonText(original),base={original,extracted,text:extracted,repaired:false,requiresConfirmation:false,changes:[] as string[]};
 try{
  inspectRepairInput(extracted,false);
  let strictValue:unknown,strict=false;try{strictValue=JSON.parse(extracted);strict=true;}catch{}
  if(strict)return {...base,value:strictValue};
  inspectRepairInput(extracted);
  const {jsonrepair}=await import('jsonrepair'),text=jsonrepair(extracted),value=JSON.parse(text),changes:string[]=[];
  if(/(^|[{,]\s*)[A-Za-z_$][\w$]*\s*:/.test(extracted))changes.push('为字段名称补充引号');
  if(extracted.includes("'"))changes.push('将单引号转换为 JSON 引号');
  if(/,\s*[}\]]/.test(extracted))changes.push('移除尾随逗号');
  if(/\b(?:True|False|None)\b/.test(extracted))changes.push('转换 Python 布尔值或空值');
  changes.push('修复 JSON 分隔符或闭合符号');
  return {...base,text,value,repaired:true,requiresConfirmation:true,changes,diff:diff(extracted,text)};
 }catch(e){return {...base,error:e instanceof Error?e.message:'JSON 修复失败，请检查原始文件'};}
}
