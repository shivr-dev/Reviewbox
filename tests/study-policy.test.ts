import test from 'node:test';
import assert from 'node:assert/strict';
import {studyAgenda} from '../lib/study-orchestrator';
import {dailyStudyPlan} from '../lib/study-assistant';
import {fixture,practiced,schoolExam,importedPaper} from './study-plan-fixtures';
import {persistDecisionTrace,recordRecommendationOutcome,changeStudyPolicy} from '../lib/study-trace-client';
import {loadData,put,switchAccount,currentNamespace,completeActiveSession} from '../lib/store';
const now=new Date(2026,9,17,12).getTime();
test('one diagnostic source, comparable utility factors and a trace for every candidate',()=>{
 const d=fixture();const initial=dailyStudyPlan(d,now).recommendations.find(r=>r.mode==='initial')!;
 const agenda=studyAgenda(d,now);assert.equal(agenda.primary.title,initial.title);assert.deepEqual(agenda.primary.items,initial.questions);
 assert.equal(agenda.decisionTrace.policyId,'learning-v2-balanced');
 for(const c of agenda.decisionTrace.candidates){assert.ok(Number.isFinite(c.utility));assert.equal(c.utility,Math.max(0,Object.values(c.factors).reduce((n,v)=>n+v,0))*c.completionProbability/c.estimatedMinutes);}
 assert.ok(agenda.actions.every(a=>!Object.hasOwn(a,'priority')));
 assert.equal(agenda.decisionTrace.selectedId,agenda.primary.id);
});
test('an active timed examination is a constraint; score entry cannot replace it',()=>{
 const d=fixture('ce'),p=importedPaper(d);d.exams=[schoolExam(d,now,-2)];d.jobs!.push({id:'active-ce',kind:'exam-run',paperId:p.id,status:'active',startedAt:new Date(now-1000).toISOString(),deadline:now+60000});
 const a=studyAgenda(d,now);assert.equal(a.primary.kind,'resume');assert.equal(a.primary.target,'active-ce');assert.ok(a.actions.some(a=>a.kind==='score'));assert.equal(a.decisionTrace.candidates[0].constraint,'active-timed-assessment');
 d.jobs=d.jobs!.filter(j=>j.id!=='active-ce');assert.equal(studyAgenda(d,now).primary.kind,'score');
});
test('decision logs, linked outcomes and parameter rollback persist once within the account',async()=>{
 await switchAccount('policy-trace-check');try{
  const d=practiced(fixture(),now),a=studyAgenda(d,now),ns=currentNamespace();
  await Promise.all([persistDecisionTrace(a.decisionTrace),persistDecisionTrace(a.decisionTrace)]);
  await recordRecommendationOutcome(a.decisionTrace,a.primary.id,'started','session-link');
  await put('job',{id:'session-link',kind:'session',mode:'review',status:'active',recommendationId:a.decisionTrace.id,recommendationActionId:a.primary.id,items:[]},'active-session');
  await completeActiveSession('session-link');await completeActiveSession('session-link');
  const jobs=(await loadData()).jobs!;assert.equal(jobs.filter(j=>j.kind==='study-recommendation').length,1);assert.equal(jobs.filter(j=>j.kind==='study-recommendation-outcome'&&j.choice==='completed').length,1);
  await changeStudyPolicy('learning-v2-retention');assert.equal((await loadData()).settings.studyPolicy?.previousId,'learning-v2-balanced');await changeStudyPolicy('learning-v2-balanced');assert.equal((await loadData()).settings.studyPolicy?.id,'learning-v2-balanced');
  await switchAccount('policy-trace-other');await assert.rejects(recordRecommendationOutcome(a.decisionTrace,a.primary.id,'selected',undefined,ns));assert.equal((await loadData()).jobs!.filter(j=>j.kind==='study-recommendation').length,0);
 }finally{await switchAccount(null);}
});
