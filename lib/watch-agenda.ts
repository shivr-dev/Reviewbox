import {studyAgenda,type StudyAction} from './study-orchestrator';
import {objective} from './learning-intelligence';
import type {StudyData} from './model';

/** Project the shared Director onto native tests; preserve ordering and original exam evidence. */
export function watchAgenda(data:StudyData,now=Date.now(),deviceId?:string) {
  const agenda=studyAgenda(data,now),jobs=data.jobs??[];
  const actions:StudyAction[]=[],unavailable:StudyAction[]=[];
  for(const source of agenda.actions) {
    if(source.kind==='resume') {
      const job=jobs.find(j=>j.id===source.target);
      if(job?.kind==='session'&&deviceId&&job.ownerDeviceId===deviceId)actions.push(source);
      else unavailable.push(source);
    } else if(['practice','verify'].includes(source.kind)) {
      const items=(source.items??[]).filter(i=>objective(i.question));
      if(items.length)actions.push({...source,id:'watch-test:'+source.id,kind:'test',
        title:source.kind==='verify'?'间隔验证测试':'本次巩固测试',label:'开始测试',items});
      else unavailable.push(source);
    } else if(['initial','test','pressure'].includes(source.kind)) {
      // Never silently cut questions from an assessment requiring a complete scope.
      if(source.items?.length&&source.items.every(i=>objective(i.question)))actions.push(source);
      else unavailable.push(source);
    } else if(['simulation','import-exam'].includes(source.kind))unavailable.push(source);
    else actions.push(source);
  }
  const foreignAssessment=jobs.find(j=>['active','break'].includes(j.status)&&
    (j.kind==='exam-run'||j.kind==='pressure'||(j.kind==='session'&&j.mode==='test'&&j.ownerDeviceId!==deviceId)));
  if(foreignAssessment) {
    const primary:StudyAction={id:'watch-assessment-in-progress:'+foreignAssessment.id,kind:'rest',
      title:'已有另一段测试正在进行',label:'查看状态',minutes:0,
      reason:'已保存原测试与作答。为避免重复提交，当前不会另外新建测试；同步后会更新安排。'};
    return {primary,actions:[primary,...actions.filter(a=>['score','report','rest'].includes(a.kind))],unavailable};
  }
  const primary=actions[0]??{id:'watch-no-test',kind:'rest' as const,title:'暂时没有可用测试',label:'查看状态',minutes:0,
    reason:'请同步含有已核验、可自动评分题目的学习包。手表会根据学习情况安排测试。'};
  return {primary,actions:actions.length?actions:[primary],unavailable};
}
