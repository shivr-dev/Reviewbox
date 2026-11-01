import {semanticDiagramSchema,semanticDiagramStructureSchema} from './diagram-spec';
/** Structural, scientific and question alignment results remain distinct. A copied
 * quotation can falsify a binding; it cannot prove the author's semantic mapping. */
export function inspectScientificDiagram(value:unknown,question?:{prompt:string;passage?:string;answer?:string;explanation?:string}){
 const structure=semanticDiagramStructureSchema.safeParse(value);
 if(!structure.success)return {schemaValid:false,physicsValid:false,questionConsistent:'review-required' as const,reviewRequired:true,problems:structure.error.issues.map(i=>i.message),checks:[] as string[]};
 const validation=semanticDiagramSchema.safeParse(value),s=structure.data,problems=validation.success?[]:validation.error.issues.map(i=>i.message),checks:string[]=[];
 const pendingEngine=['chemistry','macromolecule','bioasset'].includes(s.kind);
 if(pendingEngine)checks.push('结构字段通过不等于引擎校验完成；需等待解析、素材校验或远程结构加载。');
 let contradictory=false;
 const source=[question?.passage,question?.prompt].filter(Boolean).join('\n');
 for(const binding of s.evidence??[]){
  const path=binding.path.split('.');let actual:any=s;
  for(const key of path){if(['__proto__','prototype','constructor'].includes(key)){actual=undefined;break;}actual=actual?.[key];}
  if(typeof actual!=='number'||Math.abs(actual-binding.value)>1e-8*Math.max(1,Math.abs(actual))){contradictory=true;problems.push('条件引用与图形数值不同：'+binding.path);}
  if(binding.role==='given'&&(!source||!source.includes(binding.quote))){contradictory=true;problems.push('题干中找不到所引条件：'+binding.quote);}
  else if(binding.role==='given')checks.push('已找到所引原文；仍需确认量名和单位：'+binding.quote);
 }
 if(s.mode==='schematic')checks.push('定性示意：不将布局高度或距离作为题目数值。');
 if(s.kind==='optics'&&!s.objectHeight&&s.opticalElement!=='interface'&&s.view!=='parallel'&&s.view!=='reflection')checks.push('物高未知，仅使用标准物体符号，不输出物高数值。');
 if(s.kind==='circuit')checks.push('已检查引用、导线连通与电源短路；未据此宣称电流、电压测量值正确。');
 if(!s.evidence?.length)checks.push('没有题干条件对应记录，需要人工核对图形条件、单位和待求量。');
 return {schemaValid:true,physicsValid:validation.success&&!pendingEngine,enginePending:pendingEngine,questionConsistent:contradictory?'inconsistent' as const:'review-required' as const,reviewRequired:true,problems:[...new Set(problems)],checks};
}
