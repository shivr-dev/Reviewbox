import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {corePack} from '../lib/seed';
import {allRecords,installPack,previewInstallPack,commitPackUpdate,undoPackUpdate,put,database} from '../lib/store';
import {previewPack,planPack,packVersions} from '../lib/pack-versions';
import {projectRecords} from '../lib/record-projection';
import {installedWatchPackage} from '../lib/watch-package';
import type {Pack} from '../lib/model';
const copy=<T>(v:T):T=>JSON.parse(JSON.stringify(v));
function pack(id:string,version='1'):Pack {const n=copy(corePack.knowledge[0]),q=copy(corePack.questions.find(q=>q.nodeId===n.id)!);n.id=id+':n';q.id=id+':q';q.nodeId=n.id;q.verified=false;return {schemaVersion:1,manifest:{...corePack.manifest,id,title:'我的语文包',version},knowledge:[n],questions:[q]};}
test('repeat installation preserves verification, events, grades and creates no duplicate version',async()=>{
 const p=pack('repeat');await installPack(p);await put('question',{...p.questions[0],verified:true});await put('exam',{id:'grade',score:95});
 const before=await allRecords();const v=await previewInstallPack(p);assert.equal(v.status,'installed');await installPack(p);
 const after=await allRecords();assert.equal(after.find(r=>r.id===p.questions[0].id)?.payload.verified,true);assert.equal(after.length,before.length);assert.ok(after.some(r=>r.id==='grade'));
});
test('upgrade previews add/change/remove, archives retired questions and preserves history',async()=>{
 const p=pack('upgrade');const old={...p.questions[0],id:'upgrade:old'};p.questions.push(old);await installPack(p);
 await put('question',{...p.questions[0],verified:true});await put('event',{id:'old-event',questionId:old.id,score:1});
 const next=copy(p);next.manifest.version='2';next.questions=[{...p.questions[0],prompt:'新的题干'},{...p.questions[0],id:'upgrade:new'}];
 const preview=await previewInstallPack(next);assert.equal(preview.changes.filter(c=>c.action==='remove').length,1);assert.equal(preview.changes.some(c=>c.conflict),false);
 const result=await commitPackUpdate(preview);assert.deepEqual([result.added,result.modified,result.archived],[1,1,1]);
 const rows=await allRecords();assert.equal(rows.find(r=>r.id===old.id)?.deleted,true);assert.ok(rows.some(r=>r.id==='old-event'));assert.equal(rows.find(r=>r.id===p.questions[0].id)?.payload.verified,false);
 assert.equal(projectRecords(rows).questions.some(q=>q.id===old.id),false);
 const exported=installedWatchPackage(projectRecords(rows),p.manifest.id);assert.equal(exported.manifest.version,'2');assert.deepEqual(exported.questions.map(q=>q.id).sort(),next.questions.map(q=>q.id).sort());
 const version=rows.find(r=>r.kind==='pack'&&r.payload.id===p.manifest.id)!.payload.installationId;await undoPackUpdate(version);
 const reverted=await allRecords();assert.equal(reverted.find(r=>r.id===old.id)?.deleted,false);assert.equal(reverted.find(r=>r.id===p.questions[0].id)?.payload.verified,true);assert.equal(reverted.find(r=>r.id==='upgrade:new')?.deleted,true);
});
test('local edits require an explicit choice and manifests reference actual retained contents',async()=>{
 const p=pack('edited');await installPack(p);await put('question',{...p.questions[0],prompt:'我的修改',verified:true});
 const next=copy(p);next.manifest.version='2';next.questions[0].prompt='出版社修改';
 const preview=await previewInstallPack(next);assert.equal(preview.changes.find(c=>c.kind==='question')?.conflict,true);
 await assert.rejects(()=>commitPackUpdate(preview),/冲突/);await commitPackUpdate(preview,{[p.questions[0].id]:'keep'});
 const rows=await allRecords();assert.equal(rows.find(r=>r.id===p.questions[0].id)?.payload.prompt,'我的修改');assert.equal(rows.find(r=>r.id===p.questions[0].id)?.payload.verified,true);
});
test('same IDs from a different source are never silently skipped or overwritten',async()=>{
 const p=pack('foreign');await put('question',{...p.questions[0],prompt:'原有个人题目',source:'私有笔记'});
 const preview=await previewInstallPack(p);assert.ok(preview.changes.some(c=>c.conflict));await assert.rejects(()=>commitPackUpdate(preview),/冲突/);
});
test('stale previews and storage failures leave all records and queue unchanged',async()=>{
 const p=pack('failure');await installPack(p);const next=copy(p);next.manifest.version='2';next.questions[0].prompt='新版';
 const stale=await previewInstallPack(next);await put('question',{...p.questions[0],prompt:'并发修改'});const snapshot=await allRecords();await assert.rejects(()=>commitPackUpdate(stale),/发生变化/);assert.deepEqual(await allRecords(),snapshot);
 const fresh=await previewInstallPack(next),db=await database(),queueBefore=await db.getAll('queue'),original=IDBObjectStore.prototype.put;
 IDBObjectStore.prototype.put=function(value:any,...args:any[]){if(this.name==='queue'&&value.id===p.questions[0].id)throw new Error('模拟磁盘写入失败');return original.call(this,value,...args as [any]);};
 try{await assert.rejects(()=>commitPackUpdate(fresh,{[p.questions[0].id]:'replace'}),/磁盘/);}finally{IDBObjectStore.prototype.put=original;}
 assert.deepEqual(await allRecords(),snapshot);assert.deepEqual(await db.getAll('queue'),queueBefore);
});
test('history does not contain event, grade or game records',async()=>{
 const p=pack('safe');const preview=await previewPack(p,await allRecords());const plan=planPack(preview,await allRecords());assert.ok(plan.writes.every(r=>['node','question','pack','job'].includes(r.kind)));assert.ok(packVersions(plan.writes)[0].payload.before.every((r:any)=>!['event','exam'].includes(r.kind)));assert.ok(plan.writes.every(r=>new TextEncoder().encode(JSON.stringify(r)).length<1900000));
});
test('pack IDs cannot overwrite immutable answer events or grades',async()=>{
 const p=pack('event-collision');await put('event',{id:p.questions[0].id,questionId:'old',score:1});const before=await allRecords();await assert.rejects(()=>installPack(p),/标识/);assert.deepEqual(await allRecords(),before);
});
test('unfinished tasks block changes to the questions they are using',async()=>{
 const p=pack('active-guard');await installPack(p);await put('job',{id:'active-test',kind:'session',status:'active',items:[{question:p.questions[0]}]});const next=copy(p);next.manifest.version='2';next.questions[0].prompt='changed';const before=await allRecords();await assert.rejects(()=>installPack(next),/未完成/);assert.deepEqual(await allRecords(),before);
});
test('reserved manifest IDs are rejected and legacy manifest aliases are normalized safely',async()=>{
 const p=pack('legacy-id');p.questions[0].id='pack:legacy-id';await assert.rejects(()=>installPack(p),/清单冲突/);
 p.questions[0].id='legacy-id:q';await put('pack',{...p.manifest,questionIds:[],nodeIds:[]},'legacy-manifest');await installPack(p);const rows=await allRecords();assert.equal(rows.filter(r=>r.kind==='pack'&&!r.deleted&&r.payload.id===p.manifest.id).length,1);assert.equal(rows.find(r=>r.id==='legacy-manifest')?.deleted,true);
});
