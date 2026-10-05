import {nativeExamPackage,applyNativeAnswers} from './exam-native';
import {examStages,type ExamPaper,type ExamRun} from './exam-model';
import {DET_TASKS} from './det-model';
import type {Question} from './model';
export function detPackage(paper:ExamPaper,questions:Question[],assets:any[],name:string){
 const stages=examStages('DET',paper.options),media=nativeExamPackage(paper,questions,assets,name).media;
 const items=stages.flatMap((stage,stageIndex)=>stage.slots.map(slot=>{
  const q=questions.find(q=>q.id===paper.questions[slot.id]);if(!q||!DET_TASKS[q.examTask?.type??''])throw Error('Duolingo 试卷题型缺失，请重新导入。');
  const task=q.examTask!,n=structuredClone(task.native??{});
  // Only missing-letter counts reach the renderer; the answer key remains in the host.
  const passage=task.type==='det_read_complete'?(q.passage??'').replace(/\{([a-z]+)\}/gi,(_,s)=>'{'+ 'x'.repeat(s.length)+'}'):(q.passage??'');
  const previous=stage.slots.slice(0,slot.index).map(s=>questions.find(q=>q.id===paper.questions[s.id]));
  const secondHighlight=task.type==='det_reading_highlight'&&previous.at(-1)?.examTask?.type==='det_reading_highlight';
  const conversations=stage.slots.filter(s=>questions.find(q=>q.id===paper.questions[s.id])?.examTask?.type==='det_conversation');
  n.turnIndex=conversations.findIndex(s=>s.id===slot.id);n.turnCount=conversations.length;
  return {key:stage.id+':'+slot.index,slotId:slot.id,stage:stageIndex,index:slot.index,route:secondHighlight?'reading-highlight-2':DET_TASKS[task.type].route,type:task.type,seconds:task.responseSeconds??DET_TASKS[task.type].seconds,prompt:q.prompt,passage,choices:q.options??[],native:n,group:slot.group,audio:task.audio?media[task.audio]:undefined,audioText:task.audioText??''};
 }));
 return {student:name||'Student Guest',title:paper.title||'Duolingo English Test · Personal Simulation',sections:stages.map(s=>({id:s.id,name:s.section,frequency:String(s.count),time:s.seconds/s.count,displayTime:'Timed by task'})),items};
}
export function detSnapshot(run:ExamRun,paper:ExamPaper,_questions:Question[]){
 if(run.native?.detVersion===1)return run.native;
 return {detVersion:1,cursor:0,route:run.status==='complete'?'complete':'home',state:{},answers:{},times:{},deadline:0,groupDeadline:0,group:'',history:[],initialWriting:'',completed:run.status==='complete',showReport:false};
}
export function saveDetSnapshot(run:ExamRun,paper:ExamPaper,questions:Question[],snapshot:any,complete=false){
 const pack=detPackage(paper,questions,[],'');
 if(snapshot?.detVersion!==1||!Number.isInteger(snapshot.cursor)||snapshot.cursor<0||snapshot.cursor>pack.items.length||!snapshot.answers||typeof snapshot.answers!=='object')throw Error('Duolingo 考试记录无效。');
 if(run.native?.detVersion===1&&snapshot.cursor<run.native.cursor)throw Error('已经提交的题目已锁定。');
 if(complete&&snapshot.cursor!==pack.items.length)throw Error('请先完成所有题目。');
 const clean={...snapshot,finished:complete||run.status==='complete'};
 const next=applyNativeAnswers(run,paper,questions,clean),current=pack.items[Math.min(snapshot.cursor,pack.items.length-1)];
 // Missing letters are joined with the visible prefixes before local scoring.
 for(const item of pack.items){const raw=snapshot.answers[item.key];if(raw===undefined)continue;const q=questions.find(q=>q.id===paper.questions[item.slotId])!;
  if(item.type==='det_fill_blanks')next.answers[item.slotId]=String(item.native.prefix??'')+String(raw);
  if(item.type==='det_read_complete'){const gaps=[...(q.passage??'').matchAll(/([a-z]+)\{[a-z]+\}/gi)];next.answers[item.slotId]=JSON.stringify(gaps.map((g,i)=>g[1]+String(raw?.[i]??'')));}
  if(['det_reading_sentences','det_listening_complete'].includes(item.type))next.answers[item.slotId]=JSON.stringify(raw);
 }
 return {...next,stage:current.stage,index:current.index,deadline:complete?0:snapshot.deadline||0};
}
