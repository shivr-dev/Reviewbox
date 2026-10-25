import type {StudyData,QueueItem,AnswerEvent} from './model';
import {buildQueue} from './engine';
import {studyAgenda} from './study-orchestrator';
import {watchAgenda} from './watch-agenda';
import {watchAnswerEvent,type WatchAnswer} from './watch-answer';
import {wrongQuestions} from './question-tools';
import {objective,reusable} from './learning-intelligence';
import {coursePracticeQuestions,courseCompletionRecords} from './course-lifecycle';
export type NativeSession={id:string;kind:'session';status:'active'|'complete';ownerDeviceId:string;mode:'review'|'test';pressure:boolean;createdAt:string;completedAt?:string;title:string;items:QueueItem[];deadline?:number;eventIds?:string[];courseId?:string;coursePhase?:'practice'|'verify'};
export function startWatchSession(data:StudyData,input:any,deviceId:string,now=Date.now()):NativeSession {
  if(typeof input.sessionId!=='string'||!input.sessionId.startsWith('watch-session:'+deviceId+':')||input.sessionId.length>145)throw new Error('学习会话标识无效');
  const previous=data.jobs?.find(j=>j.id===input.sessionId);
  if(previous) {if(previous.ownerDeviceId!==deviceId)throw new Error('会话属于其他设备');return previous;}
  const protectedTask=data.jobs?.find(j=>
    ((j.kind==='session'&&j.mode==='test')||j.kind==='exam-run'||j.kind==='pressure')&&['active','break'].includes(j.status));
  if(protectedTask)throw new Error('已有未完成测评，请先恢复或完成原测评');
  let items:QueueItem[], mode:NativeSession['mode']='review',pressure=false,title='手表复习';
  const startedAt=input.startedAt?Date.parse(input.startedAt):now;
  if(!Number.isFinite(startedAt)||startedAt>now+300000)throw new Error('学习会话开始时间无效');
  if(input.courseId) {
    const course=data.jobs?.find(j=>j.kind==='course'&&j.id===input.courseId);
    const completion=data.jobs?.find(j=>j.kind==='course-completion'&&j.courseId===input.courseId);
    if(!course||!completion||course.sections.some((s:any)=>!s.completedAt))throw new Error('请先完成课程教学');
    if(input.coursePhase==='verify'&&!completion.verification.some((v:any)=>!v.completedAt&&Date.parse(v.dueAt)<=now))throw new Error('尚未到课程验证时间');
    if(input.coursePhase!=='verify'&&completion.practiceCompletedAt)throw new Error('课程巩固已完成，请等待间隔验证');
    items=coursePracticeQuestions(data,course).map(question=>({question,priority:1,reason:'课程巩固与验证'}));title=course.title+' · '+(input.coursePhase==='verify'?'间隔验证':'当场巩固');
  } else if(input.actionId) {
    const action=(input.assessmentOnly?watchAgenda(data,now,deviceId):studyAgenda(data,now)).actions.find(a=>a.id===input.actionId);
    if(action&&['practice','verify','initial','test','pressure'].includes(action.kind)&&action.items?.length) {
      items=action.items;title=action.title;mode=['initial','test','pressure'].includes(action.kind)?'test':'review';pressure=action.kind==='pressure';
    } else if(Array.isArray(input.questionIds)&&input.questionIds.length&&input.startedAt) {
      items=[];mode=input.requestedMode==='test'?'test':'review';pressure=mode==='test'&&input.pressure===true;title=mode==='test'?'已完成的离线测评':'已选择的离线学习';
    } else throw new Error('学习安排已变化，请重新查看建议');
  } else {
    const wrong=new Set(wrongQuestions(data).map(q=>q.id));
    const eligible={...data,questions:data.questions.filter(q=>(!input.assessmentOnly||objective(q))&&(!input.wrong||wrong.has(q.id))&&(!input.type||q.type===input.type))};
    const limit=Math.max(1,Math.min(16,Number.isInteger(input.limit)?input.limit:5));
    items=buildQueue(eligible,{subject:input.subject==='all'?undefined:input.subject,scope:input.scope,limit,now,practice:true});
  }
  // Offline answers refer to the tasks actually shown, not to a queue re-ranked hours later.
  // This binds content identity; scoring and content availability remain authoritative.
  if(input.questionIds!==undefined) {
    if(!Array.isArray(input.questionIds)||!input.questionIds.length||input.questionIds.length>100||new Set(input.questionIds).size!==input.questionIds.length)throw new Error('离线任务清单无效');
    items=input.questionIds.map((id:string)=>{
      const question=data.questions.find(q=>q.id===id);
      if(!question||!question.verified||!reusable(question,now))throw new Error('离线任务内容已暂停、过期或需要重新核验');
      return {question,priority:1,reason:'已选离线学习任务'};
    });
  }
  if(!items.length)throw new Error('没有符合条件的可用题目，请先导入并同步资料');
  if(input.assessmentOnly)mode='test';
  if(mode==='test'&&items.some(i=>!objective(i.question)))throw new Error('此测试包含无法自动评分的题型，请选择可自动评分题目；原测试与作答仍会保留。');
  const seconds=items.reduce((s,i)=>s+Math.max(15,Math.min(1200,i.question.expectedSeconds||60)),0);
  return {id:input.sessionId,kind:'session',status:'active',ownerDeviceId:deviceId,mode,pressure,title,items,createdAt:new Date(startedAt).toISOString(),...(input.courseId?{courseId:input.courseId,coursePhase:input.coursePhase==='verify'?'verify':'practice'}:{}),...(pressure?{deadline:startedAt+seconds*1000}:{})};
}
export function answerWatchSession(data:StudyData,input:WatchAnswer,deviceId:string,now=Date.now()):AnswerEvent {
  const session=data.jobs?.find(j=>j.id===input.sessionId&&j.kind==='session') as NativeSession|undefined;
  if(!session||session.ownerDeviceId!==deviceId||session.status!=='active')throw new Error('学习会话已结束或属于其他设备，请同步');
  const index=session.items.findIndex((i,n)=>i.question.id===input.questionId&&input.eventId==='watch-event:'+deviceId+':'+session.id+':'+n);
  if(index<0)throw new Error('作答不属于当前学习任务');
  if(session.mode==='test'&&input.revealedAt!==input.occurredAt)throw new Error('测评结束前不能查看参考答案');
  const event=watchAnswerEvent(data,input,now);event.source=session.mode==='test'?'test':'self';
  if(session.pressure) {
    event.learningEvidence!.pressure=true;
    if(Date.parse(input.occurredAt)>(session.deadline??0)) {event.score=0;event.outcome='wrong';event.learningEvidence!.timedOut=true;}
  }
  const item=session.items[index];
  Object.assign(event.learningEvidence!,{verificationOf:item.verificationOf,remediationId:item.remediationId,remediationGroup:item.remediationGroup,remediationPhase:item.remediationPhase,gameRecovery:item.gameRecovery});
  return event;
}
export function finishWatchSession(data:StudyData,sessionId:string,deviceId:string,now=Date.now()):NativeSession {
  const session=data.jobs?.find(j=>j.id===sessionId&&j.kind==='session') as NativeSession|undefined;
  if(!session||session.ownerDeviceId!==deviceId)throw new Error('会话不存在或属于其他设备');
  if(session.status==='complete')return session;
  const ids=session.items.map((_,i)=>'watch-event:'+deviceId+':'+session.id+':'+i);
  if(ids.some(id=>!data.events.some(e=>e.id===id&&e.sessionId===sessionId)))throw new Error('还有未提交的作答，请先完成学习');
  return {...session,status:'complete',completedAt:new Date(now).toISOString(),eventIds:ids};
}
export function watchCompletionRecords(data:StudyData,session:NativeSession) {
  if(!session.courseId)return [];
  const job=data.jobs?.find(j=>j.kind==='course-completion'&&j.courseId===session.courseId);
  if(!job)return [];
  const next=session.coursePhase==='verify'?{...job,verification:job.verification.map((v:any)=>!v.completedAt&&Date.parse(v.dueAt)<=Date.parse(session.createdAt)?{...v,sessionId:session.id}:v)}:{...job,practiceSessionId:session.id};
  return courseCompletionRecords([next],session.id,session.completedAt!,data);
}
