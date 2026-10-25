import { projectRecords } from './record-projection';
import { buildQueue, computeMastery, nodeMastery } from './engine';
import { examGpa, validResult, validExamDate } from './exam-outcomes';
import { weeklyLearningGpa } from './study-assistant';
import { watchAgenda } from './watch-agenda';
import { learningGame } from './learning-game';
import { wrongQuestions, isPinyin } from './question-tools';
import {objective} from './learning-intelligence';
import {startWatchSession,finishWatchSession,answerWatchSession,watchCompletionRecords} from './watch-session';
import { aggregateMasteryStatus } from './learning-evidence';
import { SUBJECTS, keyOf, localDay, type AnswerEvent, type LocalRecord, type StudyData } from './model';

export const WATCH_CORE_VERSION = 'review-watch-1';
export {watchAnswerEvent,type WatchAnswer} from './watch-answer';
import {watchAnswerEvent} from './watch-answer';
import {watchLearningCommand,watchCoursePages} from './watch-learning';
import {courseQuestions} from './course-model';
import {watchPackageCatalog} from './watch-package';

/** The native client invokes this bundled module. No duplicated Kotlin GPA/mastery/XP algorithm. */
export function watchCore(request: {op:string;records:LocalRecord[];now?:number;input?:any}) {
  const now=request.now ?? Date.now(), data=projectRecords(request.records), input=request.input ?? {};
  if(request.op==='snapshot') {
    const gpa=examGpa(data,now),game=learningGame(data,now),states=computeMastery(data.nodes,data.events);
    const agenda=watchAgenda(data,now,input.deviceId);
    return {
      coreVersion:WATCH_CORE_VERSION,name:data.settings.name,mode:data.settings.studyMode ?? 'guided',
      gpa:{value:gpa.value,scale:gpa.config.scale,rows:gpa.rows.length,formula:gpa.config.formula,weighted:gpa.config.weighted},weeklyGpa:weeklyLearningGpa(data,now),
      recommendation:agenda.primary,actions:agenda.actions,
      game:{xp:game.totalXP,level:game.level,hearts:game.hearts,maxHearts:game.maxHearts,coins:game.coins,streak:game.streak,skin:game.skin},
      orbit:{today:game.daily.count,goal:game.goal,
        covered:data.nodes.filter(n=>data.events.some(e=>!e.voidedBy&&e.nodeId===n.id)).length,total:data.nodes.length,
        retained:data.nodes.filter(n=>['已保持','已验证'].includes(aggregateMasteryStatus(n.skills.map(k=>states[keyOf(n.id,k.id)])))).length},
      subjects:SUBJECTS.map(s=>({...s,nodes:data.nodes.filter(n=>n.subject===s.id).map(n=>({id:n.id,title:n.title,chapter:n.chapter,skills:n.skills,mastery:nodeMastery(n,states),status:aggregateMasteryStatus(n.skills.map(k=>states[keyOf(n.id,k.id)]))}))})),
      settings:data.settings,
      exams:data.exams,courses:(data.jobs??[]).filter(j=>j.kind==='course').map(c=>({...c,sections:c.sections.map((s:any)=>({...s,reading:watchCoursePages(s.content),checks:courseQuestions(c,s,'checks')}))})),materials:data.materials,notes:data.notes,tests:data.tests,
      downloads:(data.jobs??[]).filter(j=>j.kind==='watch-download'&&j.packId),
      packages:watchPackageCatalog(data),
    };
  }
  if(request.op==='presentation')return {manualCheck:!objective(input),pinyin:isPinyin(input)};
  if(request.op==='command')return watchLearningCommand(data,input,input.deviceId,now);
  if(request.op==='queue') {
    const wrong=new Set(wrongQuestions(data).map(q=>q.id));
    const eligible={...data,questions:data.questions.filter(q=>(!input.wrong||wrong.has(q.id))&&(!input.type||q.type===input.type))};
    return buildQueue(eligible,{subject:input.subject==='all'?undefined:input.subject,scope:input.scope,limit:input.limit??5,now,practice:input.manual===true});
  }
  if(request.op==='session-start')return startWatchSession(data,input,input.deviceId,now);
  if(request.op==='session-complete')return finishWatchSession(data,input.sessionId,input.deviceId,now);
  if(request.op==='completion-records')return watchCompletionRecords(data,input);
  if(request.op==='answer') return answerWatchSession(data,input,input.deviceId,now);
  if(request.op==='action') {
    const action=watchAgenda(data,now,input.deviceId).actions.find(a=>a.id===input.id);
    if(!action)throw new Error('学习计划已更新，请返回查看当前建议');
    return action;
  }
  if(request.op==='test-report') {
    const result=data.tests.find(t=>t.id===input.id||t.sessionId===input.id);
    if(!result)throw new Error('测评报告尚未同步');
    const events=data.events.filter(e=>result.eventIds.includes(e.id)&&!e.voidedBy);
    return {id:result.id,title:result.title,at:result.at,count:events.length,score:events.length?events.reduce((s,e)=>s+e.score,0)/events.length:null,
      answers:events.map(e=>({question:data.questions.find(q=>q.id===e.questionId),answer:e.answer,score:e.score,outcome:e.outcome}))};
  }
  if(request.op==='grade') {
    if(!validResult(input.result)||!validExamDate(input.date)||input.date>localDay(new Date(now))) throw new Error('请填写有效的已结束考试日期和成绩');
    return {...input,result:{...input.result,recordedAt:new Date(now).toISOString()}};
  }
  throw new Error('不支持的手表操作');
}
