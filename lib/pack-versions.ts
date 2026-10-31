import type {LocalRecord,Pack} from './model';
export type PackChoices=Record<string,'keep'|'replace'>;
export type PackChange={id:string;kind:'node'|'question';action:'add'|'modify'|'remove'|'same';conflict:boolean;before?:any;after?:any};
export function packVersions(records:LocalRecord[]) {
  const map=new Map(records.filter(r=>!r.deleted).map(r=>[r.id,r]));
  return records.filter(r=>r.kind==='job'&&!r.deleted&&r.payload.kind==='pack-version').map(r=>{
    if(!r.payload.partIds)return r;
    try{const body=JSON.parse(r.payload.partIds.map((id:string)=>{const part=map.get(id);if(part?.payload.versionId!==r.id)throw new Error('missing');return part.payload.text;}).join(''));return {...r,payload:{...r.payload,...body}};}catch{return {...r,payload:{...r.payload,incomplete:true}};}
  });
}
export function stable(value:any):string {
  if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
  if(value&&typeof value==='object')return '{'+Object.keys(value).filter(k=>value[k]!==undefined).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  return JSON.stringify(value);
}
export function content(value:any) {
  if(!value)return value;
  const {verified,verification,reviewStatus,version,source,...rest}=value;return rest;
}
export async function packHash(value:any) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stable(value))))).map(n=>n.toString(16).padStart(2,'0')).join('');
}
export async function previewPack(pack:Pack,records:LocalRecord[]) {
  const manifest=records.filter(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===pack.manifest.id).sort((a,b)=>b.updated_at.localeCompare(a.updated_at))[0]?.payload;
  const versions=packVersions(records).filter(r=>r.payload.packId===pack.manifest.id);
  const baseline=versions.find(r=>r.id===manifest?.installationId)?.payload.source as Pack|undefined;
  if(manifest?.installationId&&!baseline)throw new Error('版本历史尚未完整同步，请同步后再更新，原内容不会改变');
  const ids=[...pack.knowledge,...pack.questions].map(x=>x.id);if(new Set(ids).size!==ids.length)throw new Error('学习包中存在重复的内容标识');
  if(ids.includes('pack:'+pack.manifest.id))throw new Error('题目或知识点标识与学习包清单冲突，请更换标识');
  const current=new Map(records.map(r=>[r.id,r]));
  const changes:PackChange[]=[];
  for(const [kind,list,oldList] of [['node',pack.knowledge,baseline?.knowledge??[]],['question',pack.questions,baseline?.questions??[]]] as const){
    for(const after of list){
      const row=current.get(after.id),before=row&&!row.deleted?row.payload:undefined,old=oldList.find(x=>x.id===after.id);
      if(row&&row.kind!==kind)throw new Error('内容标识与其他记录冲突，请在学习包中更换标识；现有记录会保留');
      const same=!!before&&stable(content(before))===stable(content(after));
      const owned=manifest?.[kind==='node'?'nodeIds':'questionIds']?.includes(after.id);
      const locallyChanged=old?stable(content(before))!==stable(content(old)):!same;
      const foreign=records.some(r=>r.kind==='pack'&&!r.deleted&&r.payload.id!==pack.manifest.id&&r.payload[kind==='node'?'nodeIds':'questionIds']?.includes(after.id));
      changes.push({id:after.id,kind,action:!before?'add':same?'same':'modify',conflict:!!before&&!same&&(row!.kind!==kind||!owned||locallyChanged||foreign),before,after});
    }
    for(const id of manifest?.[kind==='node'?'nodeIds':'questionIds']??[]){
      if(list.some(x=>x.id===id))continue;
      const row=current.get(id);if(!row||row.deleted||row.kind!==kind)continue;
      const old=oldList.find(x=>x.id===id);
      changes.push({id,kind,action:'remove',conflict:!old||stable(content(row.payload))!==stable(content(old)),before:row.payload});
    }
  }
  const hash=await packHash({knowledge:pack.knowledge.map(content),questions:pack.questions.map(content),scoringPolicy:pack.manifest.scoringPolicy});
  return {pack,manifest,hash,changes,status:!manifest?'new':(manifest.sourceContentHash??manifest.contentHash)===hash&&manifest.version===pack.manifest.version&&changes.every(c=>c.action==='same')?'installed':'update',versions};
}
export type PackPreview=Awaited<ReturnType<typeof previewPack>>;
export function planPack(preview:PackPreview,records:LocalRecord[],choices:PackChoices={},now=new Date().toISOString(),id='pack-version:'+crypto.randomUUID(),effectiveHash=preview.hash) {
  const unresolved=preview.changes.filter(c=>c.conflict&&!choices[c.id]);
  if(unresolved.length)throw new Error(`还有 ${unresolved.length} 处内容冲突，请先选择保留或使用新版`);
  const writes:LocalRecord[]=[],before:LocalRecord[]=[],current=new Map(records.map(r=>[r.id,r]));
  const membership={node:[] as string[],question:[] as string[]};
  const counts={added:0,modified:0,archived:0,retained:0,reverify:0};
  function write(kind:LocalRecord['kind'],key:string,payload:any,deleted=false){const old=current.get(key);if(old)before.push(old);writes.push({id:key,kind,payload,deleted,updated_at:now});}
  for(const change of preview.changes){
    const {kind,action}=change;
    if(action==='remove'){
      // Knowledge remains as context for historical evidence and personal notes.
      if(kind==='node')continue;
      const shared=records.some(r=>r.kind==='pack'&&!r.deleted&&r.payload.id!==preview.pack.manifest.id&&r.payload.questionIds?.includes(change.id));
      if(shared||choices[change.id]==='keep'){counts.retained++;continue;}
      write(kind,change.id,change.before,true);counts.archived++;continue;
    }
    if(change.conflict&&choices[change.id]==='keep'){
      if(current.get(change.id)?.kind===kind){membership[kind].push(change.id);counts.retained++;}continue;
    }
    membership[kind].push(change.id);
    if(action==='same')continue;
    const payload=kind==='question'?{...change.after,verified:false,verification:undefined,reviewStatus:'active'}:change.after;
    write(kind,change.id,payload);
    if(kind==='question'){counts[action==='add'?'added':'modified']++;counts.reverify++;}
  }
  const nodes=new Map(records.filter(r=>!r.deleted&&r.kind==='node').map(r=>[r.id,r.payload]));
  writes.filter(r=>r.kind==='node').forEach(r=>nodes.set(r.id,r.payload));
  for(const qid of membership.question){const q=writes.find(r=>r.id===qid)?.payload??current.get(qid)?.payload;const n=nodes.get(q?.nodeId);if(!n||n.subject!==q.subject||!n.skills.some((s:any)=>s.id===q.skillId))throw new Error('保留的知识点与新版题目不兼容，请调整冲突选择');}
  const manifest={...preview.pack.manifest,nodeIds:membership.node,questionIds:membership.question,contentHash:effectiveHash,sourceContentHash:preview.hash,installationId:id,installedAt:now};
  write('pack','pack:'+manifest.id,manifest);
  for(const legacy of records.filter(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===manifest.id&&r.id!=='pack:'+manifest.id))write('pack',legacy.id,legacy.payload,true);
  const after=writes.map(r=>({...r}));
  const snapshot=JSON.stringify({source:preview.pack,before,after}),partIds:string[]=[];
  for(let i=0;i<snapshot.length;i+=100000){const partId=id+':part:'+partIds.length;partIds.push(partId);writes.push({id:partId,kind:'job',payload:{id:partId,kind:'pack-version-part',versionId:id,text:snapshot.slice(i,i+100000)},updated_at:now,deleted:false});}
  writes.push({id,kind:'job',payload:{id,kind:'pack-version',packId:manifest.id,version:manifest.version,at:now,partIds,counts,previousInstallationId:preview.manifest?.installationId},updated_at:now,deleted:false});
  return {writes,counts,id};
}
