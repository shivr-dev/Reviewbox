import test from 'node:test';
import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import {corePack} from '../lib/seed';
import {installPack,allRecords,inspectPackRemoval,removeInstalledPack,undoPackRemoval,put,loadData,switchAccount,currentNamespace} from '../lib/store';
import {projectRecords} from '../lib/record-projection';
import type {Pack} from '../lib/model';
function fixture(id:string):Pack {const n=structuredClone(corePack.knowledge[0]),q=structuredClone(corePack.questions.find(q=>q.nodeId===n.id)!);n.id=id+':n';q.id=id+':q';q.nodeId=n.id;return {schemaVersion:1,manifest:{...corePack.manifest,id,version:'1'},knowledge:[n],questions:[q]};}
test('remove preserves history, scores, private notes and node context; cancels active queue; undo is real',async()=>{
 const ns=currentNamespace(),p=fixture('remove-safe');await installPack(p);await put('note',{id:'own-note',nodeId:p.knowledge[0].id,text:'我的笔记'});await put('exam',{id:'own-grade',score:91});await put('event',{id:'history-event',questionId:p.questions[0].id,score:1});await put('job',{id:'queue-removal',kind:'session',status:'active',items:[{question:p.questions[0]}]});
 const preview=await inspectPackRemoval(p.manifest.id);assert.equal(preview.nodes.length,0);assert.equal(preview.eventCount,1);const id=await removeInstalledPack(preview);let d=await loadData();assert.ok(!d.packs.some(p=>p.id==='remove-safe'));assert.ok(!d.questions.some(q=>q.id===p.questions[0].id));assert.ok(d.historicalQuestions?.some(q=>q.id===p.questions[0].id));assert.ok(d.notes.some(n=>n.id==='own-note'));assert.ok(d.exams.some(e=>e.id==='own-grade'));assert.equal(d.jobs?.find(j=>j.id==='queue-removal').status,'cancelled');
 await undoPackRemoval(id);d=await loadData();assert.ok(d.questions.some(q=>q.id===p.questions[0].id));assert.equal(d.jobs?.find(j=>j.id==='queue-removal').status,'active');assert.equal(currentNamespace(),ns);
});
test('stale offline writes cannot resurrect a removed pack; explicit reinstall can',async()=>{
 const p=fixture('no-resurrection');await installPack(p);const old=structuredClone(await allRecords());await removeInstalledPack(await inspectPackRemoval(p.manifest.id));const current=await allRecords();const incoming=old.filter(r=>['question','node','pack'].includes(r.kind)&&[p.questions[0].id,p.knowledge[0].id,'pack:'+p.manifest.id].includes(r.id)).map(r=>({...r,updated_at:'2099-01-01T00:00:00.000Z',deleted:false}));const rows=[...current.filter(r=>!incoming.some(i=>i.id===r.id)),...incoming];assert.ok(!projectRecords(rows).questions.some(q=>q.id===p.questions[0].id));
 await installPack(p);assert.ok((await loadData()).questions.some(q=>q.id===p.questions[0].id));
});
test('shared questions survive removal; changed previews and account switches fail atomically',async()=>{
 const p=fixture('shared-remove');await installPack(p);await put('pack',{...p.manifest,id:'second-owner',nodeIds:p.knowledge.map(n=>n.id),questionIds:p.questions.map(q=>q.id)},'pack:second-owner');let preview=await inspectPackRemoval(p.manifest.id);assert.equal(preview.questions.length,0);assert.equal(preview.sharedQuestionCount,1);await put('note',{id:'changed-since-preview',text:'new'});await assert.rejects(()=>removeInstalledPack(preview),/变化/);preview=await inspectPackRemoval(p.manifest.id);const ns=currentNamespace();await switchAccount('other-removal-account');await assert.rejects(()=>removeInstalledPack(preview),/账户/);await switchAccount(ns==='local'?null:ns);assert.ok((await loadData()).packs.some(x=>x.id===p.manifest.id));
});

