import {SUBJECTS,subjectName,type StudyData,type Pack,type LocalRecord} from './model';
import {corePack} from './seed';

/** Metadata is synced independently of question downloads, so the watch can browse all installed packs. */
export function watchPackageCatalog(data:StudyData) {
  return data.packs.map(manifest=>{
    const core=manifest.id===corePack.manifest.id;
    const nodeIds=manifest.nodeIds??(core?corePack.knowledge.map(n=>n.id):null);
    const questionIds=manifest.questionIds??(core?corePack.questions.map(q=>q.id):null);
    return {packId:manifest.id,title:manifest.title,version:manifest.version,subject:manifest.subject,
      questionCount:questionIds?.length??0,downloadable:!!(nodeIds?.length&&questionIds?.length),
      unavailableReason:nodeIds&&questionIds?'':'旧学习包缺少内容清单，请在网页重新导入原包'};
  });
}

/** Reconstruct only this installed package, never all content from its subject. */
export function installedWatchPackage(data:StudyData,packId:string):Pack {
  const manifest=data.packs.find(p=>p.id===packId);
  if(!manifest)throw new Error('学习包尚未安装，请先在网页导入');
  const nodeIds=manifest.nodeIds??(packId===corePack.manifest.id?corePack.knowledge.map(n=>n.id):null);
  const questionIds=manifest.questionIds??(packId===corePack.manifest.id?corePack.questions.map(q=>q.id):null);
  if(!nodeIds||!questionIds)throw new Error('此旧学习包缺少内容清单，请重新导入原学习包以恢复下载');
  const knowledge=data.nodes.filter(n=>nodeIds.includes(n.id));
  const questions=data.questions.filter(q=>questionIds.includes(q.id)&&knowledge.some(n=>n.id===q.nodeId));
  if(!knowledge.length||!questions.length)throw new Error('学习包内容不完整，请重新导入');
  return {schemaVersion:1,manifest:{...manifest,nodeIds:knowledge.map(n=>n.id),questionIds:questions.map(q=>q.id)},knowledge,questions};
}

export function watchDownloadRequest(pack:Pack) {
  return {id:'watch-download:pack:'+pack.manifest.id,kind:'watch-download',packId:pack.manifest.id,
    title:pack.manifest.title,version:pack.manifest.version,subject:pack.manifest.subject,
    nodeIds:pack.knowledge.map(n=>n.id),questionIds:pack.questions.map(q=>q.id),questionCount:pack.questions.length,
    requestedAt:new Date().toISOString()};
}
/** A content package never contains answer history, identity, grades, tokens or game currency. */
export function buildWatchPackage(data:StudyData,subject:string,scope:string[]=[],now=Date.now()):Pack {
  if(!SUBJECTS.some(s=>s.id===subject))throw new Error('请选择有效学科');
  if(!Array.isArray(scope)||scope.some(id=>!data.nodes.some(n=>n.id===id&&n.subject===subject)))throw new Error('学习包知识点范围无效');
  const selected=new Set(scope.length?scope:data.nodes.filter(n=>n.subject===subject).map(n=>n.id));
  const visit=(id:string)=>{const node=data.nodes.find(n=>n.id===id&&n.subject===subject);if(!node)return;for(const p of [...node.prerequisites,...(node.dependencies??[]).filter(d=>d.kind==='requires'&&(d.weight??.8)>=.8).map(d=>d.nodeId)])if(!selected.has(p)){selected.add(p);visit(p);}};
  [...selected].forEach(visit);
  const knowledge=data.nodes.filter(n=>n.subject===subject&&selected.has(n.id));
  const ids=new Set(knowledge.map(n=>n.id));
  const questions=data.questions.filter(q=>q.subject===subject&&ids.has(q.nodeId)&&q.verified&&q.reviewStatus!=='paused'&&(!q.expiresAt||Date.parse(q.expiresAt)>now));
  if(!questions.length)throw new Error('此范围尚无通过核验的可用题目，请先导入或核验题目');
  return {schemaVersion:1,manifest:{id:'watch-pack-'+subject,title:subjectName(subject)+' · 手表学习包',subject,version:new Date(now).toISOString(),description:'所选学科内容与必要前置知识；不含个人作答和成绩',changelog:'从个人资料库打包',compatibility:'Review 1.x / Watch 1'},knowledge,questions};
}
export function watchPackageRecords(pack:Pack,at:string):LocalRecord[] {
  return [...pack.knowledge.map(payload=>({id:payload.id,kind:'node' as const,payload,updated_at:at,deleted:false})),...pack.questions.map(payload=>({id:payload.id,kind:'question' as const,payload,updated_at:at,deleted:false}))];
}
