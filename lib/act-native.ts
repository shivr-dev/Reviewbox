import {nativeExamPackage,applyNativeAnswers} from './exam-native';
import {examStages,type ExamPaper,type ExamRun} from './exam-model';
import type {Question} from './model';
const html=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)).replaceAll('\n','<br>');
export function actPackage(paper:ExamPaper,questions:Question[],name:string){
 const pack=nativeExamPackage(paper,questions,[],name);
 const stages=examStages('ACT',paper.options);
 return {student:name||'Student Guest',sections:stages.map((s,i)=>({id:s.id,name:s.section,count:s.count,minutes:s.seconds/60,breakAfter:s.breakAfter,writing:/writing/i.test(s.section)})),banks:Object.fromEntries(stages.map(s=>[s.id,pack.sections[s.id].questions.map((q:any)=>({prompt:q.prompt,passage:html(q.passage),choices:q.choices??[],type:q.type}))]))};
}
export function actSnapshot(run:ExamRun,paper:ExamPaper,questions:Question[]){
 const stages=examStages('ACT',paper.options),old=run.native??{},answers={...old.answers},flags={...old.flags};
 if(!stages.length)throw Error('ACT 试卷没有可用部分，请在 CE 重新选择已保存试卷。');
 stages.forEach(s=>s.slots.forEach(slot=>{const q=questions.find(q=>q.id===paper.questions[slot.id]);if(q&&run.answers[slot.id]!==undefined)answers[s.id+':'+slot.index]=q.options?q.options.indexOf(run.answers[slot.id]):run.answers[slot.id];flags[s.id+':'+slot.index]=run.flags[slot.id];}));
 const started=Object.keys(run.answers).length>0||(!old.fresh&&!!old.clockEnd);
 const rawStage=old.actVersion===1?old.section:old.stepIndex??run.stage;
 const stage=Math.max(0,Math.min(stages.length-1,Number.isInteger(rawStage)?rawStage:0));
 const writing=stages.find(s=>/writing/i.test(s.section));
 const rawItem=old.actVersion===1?old.item:old.qIndex??run.index;
 const item=Math.max(0,Math.min(stages[stage].count-1,Number.isInteger(rawItem)?rawItem:0));
 const result:any={actVersion:1,scene:run.status==='complete'?'complete':started?'exam':'notice',section:stage,item,answers,flags,eliminated:old.eliminated??{},revealed:{},highlights:{},essay:writing?String(answers[writing.id+':0']??''):'',deadline:started?old.clockEnd||run.deadline:null,started,completed:run.status==='complete'?stages.map(s=>s.id):stages.slice(0,stage).map(s=>s.id),expired:false};
 if(old.actVersion===1)Object.assign(result,old,{section:stage,item});
 for(const field of ['answers','flags','eliminated','revealed','highlights','times','tools'])if(!result[field]||typeof result[field]!=='object'||Array.isArray(result[field]))result[field]=field==='answers'?answers:field==='flags'?flags:{};
 if(!Array.isArray(result.completed))result.completed=stages.slice(0,stage).map(s=>s.id);
 if(!['notice','statement','help','information','instructions','exam','review','break','submitting','complete','declined'].includes(result.scene))result.scene=result.started?'exam':'notice';
 result.essay=typeof result.essay==='string'?result.essay:'';
 return result;
}
export function saveActSnapshot(run:ExamRun,paper:ExamPaper,questions:Question[],snapshot:any,complete=false):ExamRun{
 const stages=examStages('ACT',paper.options);
 if(snapshot?.actVersion!==1||!Number.isInteger(snapshot.section)||snapshot.section<0||snapshot.section>=stages.length||!Number.isInteger(snapshot.item)||snapshot.item<0||snapshot.item>=stages[snapshot.section].count)throw Error('ACT 考试记录无效。');
 if(run.native?.actVersion===1&&snapshot.section<run.native.section)throw Error('上一考试部分已锁定。');
 if(complete&&(!stages.every(s=>snapshot.completed?.includes(s.id))))throw Error('请先结束各考试部分。');
 const next=applyNativeAnswers(run,paper,questions,{...snapshot,finished:complete||run.status==='complete'});
 for(const slot of stages[snapshot.section].slots)if(snapshot.answers?.[stages[snapshot.section].id+':'+slot.index]===undefined)delete next.answers[slot.id];
 return {...next,stage:snapshot.section,index:snapshot.item,deadline:complete?0:snapshot.deadline||0};
}
