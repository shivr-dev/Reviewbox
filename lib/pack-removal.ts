import type {LocalRecord} from './model';
import {packVersions,stable,packHash,content} from './pack-versions';
import legacy from './legacy-sample-hashes.json';

export async function previewPackRemoval(packId:string,records:LocalRecord[]){
 const manifest=records.find(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===packId);if(!manifest)throw new Error('学习包已移除或尚未安装');
 const builtIn=['review-framework','review-core'].includes(packId);
 const baseline=packVersions(records).find(r=>r.id===manifest.payload.installationId)?.payload.source;
 let questionIds:string[]=manifest.payload.questionIds??baseline?.questions?.map((q:any)=>q.id)??(builtIn?legacy.questionIds:undefined);
 let nodeIds:string[]=manifest.payload.nodeIds??baseline?.knowledge?.map((n:any)=>n.id)??(builtIn?legacy.nodeIds:undefined);
 if(!questionIds||!nodeIds)throw new Error('旧学习包缺少准确清单，请先导入原版本补全清单，再安全删除');
 if(builtIn){const originals=new Set<string>();for(const r of records)if(['node','question'].includes(r.kind)&&!r.deleted&&legacy.hashes[r.id as keyof typeof legacy.hashes]===await packHash(content(r.payload)))originals.add(r.id);questionIds=questionIds.filter(id=>originals.has(id));nodeIds=nodeIds.filter(id=>originals.has(id));}
 const shared=(id:string,key:string)=>records.some(r=>r.kind==='pack'&&!r.deleted&&r.payload.id!==packId&&r.payload[key]?.includes(id));
 const questions=records.filter(r=>r.kind==='question'&&!r.deleted&&questionIds.includes(r.id)&&!shared(r.id,'questionIds'));
 const removedQ=new Set(questions.map(r=>r.id));
 const courses=records.filter(r=>r.kind==='job'&&!r.deleted&&r.payload.kind==='course'&&(r.payload.packId===packId||(r.payload.nodeIds??[]).some((id:string)=>nodeIds.includes(id))));
 const materials=records.filter(r=>r.kind==='material'&&!r.deleted&&r.payload.packId===packId);
 const nodes=records.filter(r=>r.kind==='node'&&!r.deleted&&nodeIds.includes(r.id)&&!shared(r.id,'nodeIds')&&!records.some(other=>!other.deleted&&(other.kind==='note'&&other.payload.nodeId===r.id||other.kind==='question'&&other.payload.nodeId===r.id&&!removedQ.has(other.id)||other.kind==='job'&&other.payload.kind==='course'&&(other.payload.nodeIds??[]).includes(r.id))));
 const events=records.filter(r=>r.kind==='event'&&questionIds.includes(r.payload.questionId));
 const impacted=[manifest,...questions,...nodes,...materials];
 return {packId,manifest,questions,nodes,materials,courses,eventCount:events.length,sharedQuestionCount:questionIds.length-questions.length,fingerprint:stable(records.map(r=>({id:r.id,payload:r.payload,deleted:r.deleted,updated_at:r.updated_at}))),impacted};
}
export type PackRemovalPreview=Awaited<ReturnType<typeof previewPackRemoval>>;
/** A removal marker survives stale/offline LWW content writes. Only an explicit
 * reinstall that acknowledges this exact operation can expose the content again. */
export function packRemovalGuards(records:LocalRecord[]){
 return records.filter(r=>r.kind==='job'&&!r.deleted&&r.payload.kind==='pack-removal'&&r.payload.status==='removed').map(r=>r.payload).filter(g=>!records.some(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===g.packId&&r.payload.restoredFromRemoval===g.operationId));
}
export function blockedPackRecord(r:LocalRecord,guards:ReturnType<typeof packRemovalGuards>){
 return guards.some(g=>r.kind==='pack'?r.payload.id===g.packId:r.kind==='question'?g.questionIds.includes(r.id):r.kind==='node'?g.nodeIds.includes(r.id):r.kind==='material'?(g.materialIds??[]).includes(r.id):false);
}
export function removalRecords(preview:PackRemovalPreview,records:LocalRecord[],at=new Date().toISOString()){
 const operationId=crypto.randomUUID(),removalId='pack-removal:'+operationId,writes:LocalRecord[]=[],before:LocalRecord[]=[];
 const write=(r:LocalRecord)=>{writes.push({...r,updated_at:at});};
 for(const r of preview.impacted){before.push(r);write({...r,deleted:true,payload:{...r.payload,...(r.kind==='pack'?{removalId,removedAt:at}:{})}});}
 const removed=new Set(preview.questions.map(r=>r.id));
 for(const r of records.filter(r=>r.kind==='job'&&!r.deleted)){
  const j=r.payload;if(j.kind==='course'||['complete','completed','cancelled'].includes(j.status))continue;
  if(j.packId===preview.packId||Array.isArray(j.items)&&j.items.some((i:any)=>removed.has(i.question?.id??i.questionId))||Array.isArray(j.questionIds)&&j.questionIds.some((id:string)=>removed.has(id))){
   before.push(r);const items=j.items?.filter((i:any)=>!removed.has(i.question?.id??i.questionId)),questionIds=j.questionIds?.filter((id:string)=>!removed.has(id));
   write({...r,payload:{...j,...(items?{items}:{}),...(questionIds?{questionIds}:{}),status:j.packId===preview.packId||items?.length===0||questionIds?.length===0?'cancelled':j.status,cancelReason:'pack-removed',removedPackId:preview.packId}});
  }
 }
 // Immutable attempt rows stay untouched. Dedicated snapshots remain available
 // even if an old version's source record is not currently hydrated.
 for(const [i,q] of preview.questions.entries()){const id='history-question:'+operationId+':'+i;write({id,kind:'job',payload:{id,kind:'historical-question',packId:preview.packId,question:q.payload},updated_at:at,deleted:false});}
 const text=JSON.stringify(before),partIds:string[]=[];
 for(let i=0;i<text.length;i+=100000){const id='pack-removal-part:'+operationId+':'+partIds.length;partIds.push(id);write({id,kind:'job',payload:{id,kind:'pack-removal-part',operationId,text:text.slice(i,i+100000)},updated_at:at,deleted:false});}
 write({id:removalId,kind:'job',payload:{id:removalId,kind:'pack-removal',packId:preview.packId,operationId,status:'removed',removedAt:at,undoUntil:new Date(Date.parse(at)+10*60*1000).toISOString(),questionIds:preview.questions.map(r=>r.id),nodeIds:preview.nodes.map(r=>r.id),materialIds:preview.materials.map(r=>r.id),partIds},updated_at:at,deleted:false});
 return {writes,removalId};
}
