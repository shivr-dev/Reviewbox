import type {LocalRecord,StudyData} from './model';
import {courseNode,courseQuestions,type Course} from './course-model';
import {courseRevisionKey,coursePracticeQuestions} from './course-lifecycle';
import {watchAnswerEvent} from './watch-answer';

/** Native writes are interpreted from intents, never accepted as arbitrary records. */
export function watchLearningCommand(data:StudyData,c:any,device:string,now=Date.now()):LocalRecord[] {
 const at=new Date(now).toISOString();
 const row=(kind:LocalRecord['kind'],payload:any):LocalRecord=>({id:payload.id,kind,payload,updated_at:at,deleted:false});
 if(c.kind==='preferences') {
  if(c.previousMode!==(data.settings.studyMode??'guided')||c.previousMinutes!==data.settings.dailyMinutes)throw new Error('学习偏好已在其他设备修改，请同步后重试');
  if(!['auto','guided','manual'].includes(c.mode)||!Number.isInteger(c.minutes)||c.minutes<5||c.minutes>180)throw new Error('学习偏好无效');
  return [row('setting',{id:'settings',...data.settings,studyMode:c.mode,dailyMinutes:c.minutes,
   assistant:data.settings.assistant?{...data.settings.assistant,dailyMinutes:c.minutes}:undefined,
   studyAutoStart:{enabled:false,acknowledgedAt:at}})];
 }
 if(c.kind==='note') {
  if(typeof c.text!=='string'||!c.text.trim()||c.text.length>50000||!data.nodes.some(n=>n.id===c.nodeId))throw new Error('笔记内容无效');
  const id=c.noteId??('watch-note:'+device+':'+c.id);
  if(c.noteId&&!data.notes.some(n=>n.id===c.noteId))throw new Error('原笔记不存在');
  if(c.noteId&&data.notes.find(n=>n.id===c.noteId)?.body!==c.previousBody)throw new Error('笔记已在其他设备修改，请同步后重试');
  return [row('note',{id,nodeId:c.nodeId,body:c.text.trim()})];
 }
 const course=data.jobs?.find(j=>j.kind==='course'&&j.id===c.courseId) as Course|undefined;
 if(!course)throw new Error('课程不存在，请先同步');
 const section=course.sections.find(s=>s.id===c.sectionId);
 if(!section?.content)throw new Error('此课程小节尚未编制完成');
 if(c.revision!==section.revision)throw new Error('课程已修订，请同步后重新学习');
 const checks=courseQuestions(course,section,'checks');
 let next={...section},events:LocalRecord[]=[];
 if(c.kind==='course-check') {
  const q=checks.find(q=>q.id===c.questionId);
  if(!q?.verified||!q.options?.includes(c.answer))throw new Error('课程检验题尚未核验或回答无效');
  const attempts=data.events.filter(e=>e.questionId===q.id&&e.sessionId===course.id);
  const previous=attempts.at(-1);
  const id='course-event:'+device+':'+c.id;
  const event=watchAnswerEvent({...data,questions:[q,...data.questions.filter(x=>x.id!==q.id)]},{...c.timing,
    eventId:id,sessionId:course.id,questionId:q.id,answer:c.answer},now);
  Object.assign(event,{source:'test',reason:'课程理解检验',attemptNumber:attempts.length+1,previousAttemptId:previous?.id,
   usedHint:!!previous,hintLevel:previous?'answer':undefined});
  events=[row('event',event)];
  if(event.score===1)next.passed=[...new Set([...section.passed,q.id])];
 } else if(c.kind==='course-section') {
  if(checks.some(q=>!section.passed.includes(q.id)))throw new Error('请先通过本节理解检验');
  next.completedAt=section.completedAt??at;
 } else throw new Error('不支持的学习修改');
 // Keep split course storage intact, including revisions and interactive state.
 const split=data.jobs?.find(j=>j.id==='course-section:'+section.id);
 const sectionRow=split?row('job',{...split,section:{...split.section,...next,history:split.section.history}}):row('job',{...course,sections:course.sections.map(s=>s.id===section.id?next:s),updatedAt:at});
 const result=[...events,sectionRow];
 const updated={...course,sections:course.sections.map(s=>s.id===section.id?next:s)};
 if(c.kind==='course-section'&&updated.sections.every(s=>s.content&&s.completedAt)) {
  const old=data.jobs?.find(j=>j.id==='course-completion:'+course.id),revisionKey=courseRevisionKey(updated);
  if(old?.revisionKey!==revisionKey)result.push(row('job',{id:'course-completion:'+course.id,kind:'course-completion',courseId:course.id,
   revisionKey,title:course.title,subject:course.subject,stage:'practice',teachingCompletedAt:at,
   questionIds:coursePracticeQuestions(data,updated).map(q=>q.id),verification:[]}));
 }
 return result;
}

export function watchCoursePages(content:any):string[] {
 if(!content)return [];
 if(content.html)return [String(content.html)];
 return [content.title,...(content.objectives??[]),...(content.concepts??[]).flatMap((c:any)=>[
  c.title,c.explanation,c.why,c.example?.prompt,...(c.example?.steps??[]),c.example?.answer,
  c.misconception?'易错处：'+c.misconception:'',c.correction]),
 content.comparison?.title,...(content.comparison?.rows??[]).map((r:any)=>r.join(' · ')),
 content.process?.title,...(content.process?.steps??[]).map((s:any)=>s.title+'\n'+s.explanation),...(content.recall??[])]
 .filter(x=>typeof x==='string'&&x.trim());
}
