import type {StudyData,Mastery} from './model';
import {naviContextSchema,naviContentVersion,type NaviContext} from './navi-context';

/** Consent is explicit per conversation. Input is the active namespace snapshot, never a user ID query. */
export function relatedNaviEvidence(data:StudyData,contexts:NaviContext[],consented:boolean,live?:{questionId:string;answer:string;grade?:unknown;steps?:unknown},states:Record<string,Mastery>={}):NaviContext|undefined{
 if(!consented)return;
 const questionIds=new Set(contexts.flatMap(c=>c.related_question_ids)),nodeIds=new Set(contexts.flatMap(c=>c.knowledge_refs));
 if(!questionIds.size&&!nodeIds.size)return;
 const questions=data.questions.filter(q=>questionIds.has(q.id)),subjects=new Set(questions.map(q=>q.subject));
 const related=data.events.filter(e=>!e.voidedBy&&(questionIds.has(e.questionId)||nodeIds.has(e.nodeId))).sort((a,b)=>b.occurredAt.localeCompare(a.occurredAt)).slice(0,8);
 const attempts=related.map(e=>({id:e.id,questionId:e.questionId,questionVersion:e.matchingSnapshot?.questionVersion,at:e.occurredAt,answer:e.answer?.slice(0,2500),outcome:e.outcome,grade:e.grade,errorCause:e.errorCause,hintLevel:e.hintLevel,source:e.source}));
 const draft=live&&questionIds.has(live.questionId)?live:undefined;
 const exams=data.exams.filter(e=>e.scheduleStatus!=='cancelled'&&subjects.has(e.subject)&&(!e.scope.length||e.scope.some(id=>nodeIds.has(id)))).slice(0,3).map(e=>({id:e.id,title:e.title,date:e.date,target:e.target,result:e.result}));
 const mastery=Object.values(states).filter(s=>nodeIds.has(s.nodeId)).slice(0,6).map(s=>({nodeId:s.nodeId,skillId:s.skillId,nextReview:s.nextReview,evidenceDays:s.evidenceDays,attemptCount:s.attemptCount,notice:'Existing latent evidence, not an independently verified probability.'}));
 const steps=(data.jobs??[]).filter(j=>['process-draft','process-evidence'].includes(j.kind)&&questionIds.has(j.questionId)).slice(-2).map(j=>({questionId:j.questionId,text:j.text?.slice(0,3000),steps:j.steps?.slice(0,15),result:j.result,afterReveal:j.afterReveal}));
 const value={consent:'Explicit current-conversation consent',draft,steps,attempts,exams,mastery,notice:'Formal grading records are read-only. Tutor comments are explanatory, never a new official grade.'};
 return naviContextSchema.parse({context_type:'question',source_id:'evidence:'+contexts[0].source_id,source_version:naviContentVersion(value),title:'Learning evidence',relevant_content:JSON.stringify(value).slice(0,12000),selected_text:'',related_question_ids:[...questionIds].slice(0,6),knowledge_refs:[...nodeIds].slice(0,12),source_location:{},provenance:'learning-evidence'});
}
