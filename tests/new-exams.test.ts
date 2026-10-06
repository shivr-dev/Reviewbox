import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseExamPackage} from '../lib/exam-import';
import {createRun,examStages} from '../lib/exam-model';
import {actPackage,actSnapshot,saveActSnapshot} from '../lib/act-native';
import {detPackage,detSnapshot,saveDetSnapshot} from '../lib/det-native';
import {DET_TASKS} from '../lib/det-model';
import {DET_TEMPLATES,detTemplate} from '../lib/det-templates';
import {objectiveScore} from '../lib/question-tools';
import {EXAM_SKILL_EXAMPLES} from '../lib/exam-examples';
import {IMPORT_SKILL} from '../lib/import-skill';
import {validatePack} from '../lib/importer';
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
test('every complete Skill example imports offline and pinyin collection uses spelling skills',async()=>{
 for(const [title,raw] of Object.entries(EXAM_SKILL_EXAMPLES)){const parsed=await parseExamPackage(raw);assert.ok(parsed.questions.length,title);}
 const examples=[...IMPORT_SKILL.matchAll(/```json\n([\s\S]*?)\n```/g)].map(m=>JSON.parse(m[1]));
 const packs=examples.filter(x=>x.knowledge&&x.questions);assert.equal(packs.length,6);
 for(const pack of packs)validatePack(pack);
 const spelling=packs.find(p=>p.questions[0].type==='pinyin');assert.equal(spelling.questions.length,2);assert.equal(spelling.questions[0].collectionId,spelling.questions[1].collectionId);assert.ok(spelling.knowledge.every((n:any)=>n.skills[0].id==='spelling'));
});
test('ACT restores old and partial state without out-of-range pages or null maps',async()=>{
 const parsed=await parseExamPackage(EXAM_SKILL_EXAMPLES['ACT：English、Reading、可选Writing与休息']),run=createRun(parsed.paper);
 for(const native of [{stepIndex:99,qIndex:99},{actVersion:1,section:0,item:99,flags:null,answers:null,eliminated:null,scene:'legacy-screen'}]){
  const restored=actSnapshot({...run,native},parsed.paper,parsed.questions);assert.ok(restored.section>=0&&restored.section<3);assert.equal(restored.item,0);assert.ok(restored.flags);assert.ok(restored.answers);assert.notEqual(restored.scene,'legacy-screen');
 }
});
test('ACT custom stage ids keep candidate, English-only content and answers with locking',async()=>{
 const imported=await parseExamPackage({schemaVersion:1,exam:'ACT',title:'Manual test',flow:[{id:'eng',label:'English',durationSeconds:2100,count:1},{id:'reading',label:'Reading',durationSeconds:2400,count:1},{id:'writing',label:'Writing',durationSeconds:2400,count:1}],sectionsInline:{eng:{questions:[{type:'mcq',prompt:'Choose the correct verb.',choices:['is','are'],answer:'is',explanation:'Singular subject.'}]},reading:{questions:[{type:'mcq',prompt:'Where is the meeting?',passage:'The meeting is in the library.',choices:['Library','Park'],correct:0,explanation:'The passage states the location.'}]},writing:{questions:[{type:'essay',prompt:'Discuss libraries.',answer:'Libraries provide access to knowledge.',explanation:'Develop a reasoned position.'}]}}});
 const {paper,questions}=imported,pack=actPackage(paper,questions,'Kevin');assert.equal(pack.student,'Kevin');assert.equal(pack.sections[2].writing,true);assert.equal(pack.banks.eng[0].answer,undefined);assert.ok(!JSON.stringify(pack).includes('Singular subject'));
 const run=createRun(paper),snap={...actSnapshot(run,paper,questions),section:0,item:0,answers:{'eng:0':0},completed:[]};
 const first=saveActSnapshot(run,paper,questions,snap);assert.equal(first.answers['0-standard-0'],'is');
 assert.throws(()=>saveActSnapshot(first,paper,questions,snap,true),/先结束/);
 const second=saveActSnapshot(first,paper,questions,{...snap,section:1});assert.throws(()=>saveActSnapshot(second,paper,questions,snap),/锁定/);
 const done=saveActSnapshot(second,paper,questions,{...snap,section:2,answers:{'eng:0':0,'writing:0':'My essay'},completed:['eng','reading','writing']},true);assert.equal(done.status,'complete');assert.equal(done.answers['2-standard-0'],'My essay');
});
test('all Duolingo task templates parse offline, with hidden answers and correct missing-letter scoring',async()=>{
 for(const type of Object.keys(DET_TASKS)){
  const raw=JSON.parse(detTemplate(type));const item=raw.sectionsInline.det.questions[0];if(/_photo$/.test(type))item.native.image=png;
  const imported=await parseExamPackage(raw),{paper,questions}=imported,pack=detPackage(paper,questions,[],'Kevin');
  assert.equal(pack.items[0].type,type);assert.equal(pack.student,'Kevin');assert.equal((pack.items[0] as any).answer,undefined);
  const q=questions[0],run=createRun(paper);let response:any=q.type==='choice'?q.options!.indexOf(q.answer):q.answer;
  if(type==='det_fill_blanks')response='rary';if(type==='det_read_complete')response=['eum'];if(['det_reading_sentences','det_listening_complete'].includes(type))response=JSON.parse(q.answer);
  const done=saveDetSnapshot(run,paper,questions,{...detSnapshot(run,paper,questions),cursor:1,answers:{'det:0':response}},true);
  assert.equal(done.status,'complete');if(q.type!=='subjective')assert.equal(objectiveScore(q,done.answers['0-standard-0']),1,type);
  if(type==='det_read_complete')assert.match(pack.items[0].passage,/mus\{xxx\}/);
 }
});
test('Duolingo rejects incomplete tasks, missing audio/image and premature submission',async()=>{
 const raw=JSON.parse(detTemplate('det_listen_type'));delete raw.sectionsInline.det.questions[0].audioText;await assert.rejects(()=>parseExamPackage(raw),/audioText/);
 const photo=JSON.parse(detTemplate('det_write_photo'));await assert.rejects(()=>parseExamPackage(photo),/图片/);
 const parsed=await parseExamPackage(detTemplate('det_read_select'));const run=createRun(parsed.paper);assert.throws(()=>saveDetSnapshot(run,parsed.paper,parsed.questions,detSnapshot(run,parsed.paper,parsed.questions),true),/所有题目/);
});
test('default Duolingo blueprint includes every current task and two reading/listening groups',()=>{
 const stages=examStages('DET',{writing:false}),types=new Set(stages.flatMap(s=>s.slots.map(s=>s.domain)));assert.equal(stages.length,8);for(const t of Object.keys(DET_TASKS))assert.ok(types.has(t),t);assert.equal(stages[3].count,12);assert.equal(stages[4].count,14);
 assert.deepEqual(examStages('ACT',{writing:false}).map(s=>s.count),[50,36]);assert.equal(examStages('ACT',{writing:true})[1].breakAfter,300);
});
