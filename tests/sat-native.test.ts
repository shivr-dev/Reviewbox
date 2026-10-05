import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseExamPackage} from '../lib/exam-import';
import {createRun,paperReady,examStages} from '../lib/exam-model';
import {satPackage,satSnapshot,saveSatSnapshot,satRoute} from '../lib/sat-native';
async function imported(){
 const questions=(count:number)=>Array.from({length:count},(_,i)=>({id:'manual-'+i,type:'mcq',prompt:'Select the supported statement.',passage:'This is a manually provided reading passage.',choices:['Supported statement.','Incorrect statement.','Another incorrect statement.','Unsupported statement.'],correct:0,explanation:'The passage supports the first option.',skill:'Text evidence',difficulty:2}));
 return parseExamPackage({schemaVersion:1,exam:'SAT',title:'Manual test fixture',flow:[{id:'rw1',type:'bluebook',label:'Reading and Writing',count:27,durationSeconds:1920},{id:'rw2',type:'bluebook',label:'Reading and Writing',count:27,durationSeconds:1920}],sectionsInline:{rw1:{questions:questions(27)},rw2_easy:{questions:questions(27)},rw2_hard:{questions:questions(27)}}});
}
test('manual SAT import retains all 54 played questions, both adaptive branches and account name without revealing keys',async()=>{
 const {paper,questions}=await imported();assert.equal(paperReady(paper,questions),true);const pack=satPackage(paper,questions,'Kevin');assert.equal(pack.student,'Kevin');assert.equal(pack.modules.length,2);assert.equal(pack.sections.rw1.questions.length,27);assert.equal(pack.sections.rw2_easy.questions.length,27);assert.equal(pack.sections.rw2_hard.questions.length,27);assert.equal(pack.modules[0].minutes,32);assert.equal('answer' in pack.sections.rw1.questions[0],false);assert.equal('correct' in pack.sections.rw1.questions[0],false);
});
test('answers map to Knowledge Skill records and 65 percent routes to higher difficulty',async()=>{
 const {paper,questions}=await imported();let run=createRun(paper,100000);let state=satSnapshot(run,paper,questions,100000);state={...state,module:0,started:true,index:26,deadline:0,answers:Object.fromEntries(Array.from({length:18},(_,i)=>['rw1:'+i,0])),flags:{'rw1:0':true},times:{'rw1:0':2500},notes:{'rw1:0':'My note'}};run=saveSatSnapshot(run,paper,questions,state);assert.equal(satRoute(paper,run,questions),'hard');assert.equal(run.answers['0-standard-0'],'Supported statement.');assert.equal(run.notes['0-standard-0'],'My note');assert.equal(run.times['0-standard-0'],2500);
 state.answers=Object.fromEntries(Array.from({length:17},(_,i)=>['rw1:'+i,0]));run=saveSatSnapshot(run,paper,questions,state);assert.equal(satRoute(paper,run,questions),'easy');assert.equal(run.answers['0-standard-17'],undefined);
});
test('failed submission remains active; completion is sticky and preserves previously scored status',async()=>{
 const {paper,questions}=await imported();let run=createRun(paper,100000);const state={...satSnapshot(run,paper,questions,100000),module:1,route:'submission-error',started:true,routes:{rw2:'hard'},answers:{'rw2:0':1},finished:false};run=saveSatSnapshot(run,paper,questions,state);assert.equal(run.status,'active');assert.equal(run.answers['1-higher-0'],'Incorrect statement.');run=saveSatSnapshot(run,paper,questions,state,true);const completedAt=run.completedAt;run={...run,graded:true};run=saveSatSnapshot(run,paper,questions,state,true);assert.equal(run.status,'complete');assert.equal(run.completedAt,completedAt);assert.equal(run.graded,true);
});
test('old SAT saved answers and wall clock migrate without resetting or exposing imported HTML',async()=>{
 const {paper,questions}=await imported();let run=createRun(paper,100000);run={...run,native:{stepIndex:1,qIndex:3,clockEnd:130000,seconds:30,routes:{rw2:'hard'},answers:{'rw2:3':1}},routes:{1:'higher'}};const state=satSnapshot(run,paper,questions,110000);assert.equal(state.module,1);assert.equal(state.index,3);assert.equal(state.deadline,130000);assert.equal(state.remaining,20);assert.equal(state.answers['rw2:3'],1);const first=examStages('SAT',paper.options)[0].slots[0];const q=questions.find(q=>q.id===paper.questions[first.id])!;q.passage='<img src=x onerror="alert(1)">';assert.match(satPackage(paper,questions,'Kevin').sections.rw1.questions[0].passage,/&lt;img/);
});
