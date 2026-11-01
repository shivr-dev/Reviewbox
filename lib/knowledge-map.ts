import {keyOf,type StudyData,type Mastery} from './model';
import {aggregateMasteryStatus,dependencyLinks} from './learning-evidence';
export type MapFilter='all'|'weak'|'due';
/** No semantic similarity edges are inferred. Every edge has an authored origin. */
export function knowledgeGraph(data:StudyData,states:Record<string,Mastery>,opts:{subject?:string;query?:string;filter?:MapFilter;skills?:boolean;now?:number}={}){
 const now=opts.now??Date.now(),query=opts.query?.trim().toLocaleLowerCase()??'';
 const selected=data.nodes.filter(n=>!opts.subject||opts.subject==='all'||n.subject===opts.subject).filter(n=>!query||(n.title+' '+n.chapter+' '+n.skills.map(s=>s.title).join(' ')).toLocaleLowerCase().includes(query)).filter(n=>{
  const ss=n.skills.map(s=>states[keyOf(n.id,s.id)]),status=aggregateMasteryStatus(ss);
  return opts.filter==='weak'?status==='不稳定'||status==='学习中':opts.filter==='due'?ss.some(s=>s?.attemptCount&&Date.parse(s.nextReview??"")<=now):true;
 });
 const ids=new Set(selected.map(n=>n.id)),elements:any[]=[],missing=new Set<string>(),groups=new Set<string>(),related=new Set<string>();
 for(const n of selected){const ss=n.skills.map(s=>states[keyOf(n.id,s.id)]),status=aggregateMasteryStatus(ss),due=ss.some(s=>s?.attemptCount&&Date.parse(s.nextReview??"")<=now);
  const chapter=n.chapter?.trim()||n.unit?.trim()||n.course?.trim();
  if(chapter){const group='chapter:'+JSON.stringify([n.subject,n.course,n.unit,chapter]);if(!groups.has(group)){groups.add(group);elements.push({data:{id:group,label:chapter,kind:'chapter'},classes:'chapter'});}elements.push({data:{id:'member:'+n.id,source:group,target:'node:'+n.id,kind:'membership',origin:'authored-chapter'},classes:'membership'});}
  elements.push({data:{id:'node:'+n.id,nodeId:n.id,label:n.title,kind:'knowledge',status,due},classes:status==='不稳定'?'weak':status==='已保持'||status==='已验证'?'retained':'learning'});
  for(const [i,d] of dependencyLinks(n).entries())if(ids.has(d.nodeId))elements.push({data:{id:'dep:'+n.id+':'+i,source:'node:'+d.nodeId,target:'node:'+n.id,kind:d.kind,weight:d.weight,origin:'authored-dependency'},classes:d.kind});else if(!data.nodes.some(x=>x.id===d.nodeId))missing.add(d.nodeId);
  for(const [i,id] of n.relatedNodes.entries())if(ids.has(id)&&id!==n.id){const pair=[n.id,id].sort().join('::');if(!related.has(pair)){related.add(pair);elements.push({data:{id:'related:'+n.id+':'+i,source:'node:'+n.id,target:'node:'+id,kind:'related',origin:'authored-related'},classes:'related'});}}
  if(opts.skills)for(const s of n.skills){const id='skill:'+keyOf(n.id,s.id);elements.push({data:{id,nodeId:n.id,skillId:s.id,label:s.title,kind:'skill'}});elements.push({data:{id:'contains:'+id,source:'node:'+n.id,target:id,kind:'contains',origin:'authored-skill'},classes:'contains'});}
 }
 return {elements,nodes:selected,missingReferences:[...missing]};
}

