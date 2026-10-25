import type {AnswerEvent} from './model';

/** Completion markers outlive the single mutable active-session slot. */
export function chestEligibility(sessionId:string,jobs:any[]=[],events:AnswerEvent[]=[]) {
  const session=jobs.find(j=>j.kind==='session'&&j.id===sessionId);
  const completed=jobs.some(j=>j.kind==='study-completion'&&j.sessionId===sessionId&&Number.isFinite(Date.parse(j.completedAt)));
  const reserved=jobs.some(j=>j.kind==='game-chest'&&j.sessionId===sessionId);
  if(session?.mode==='test')return {eligible:false,reason:'测试不会发放练习宝箱，请查看测试报告。'};
  if(!reserved&&!completed&&!(session?.kind==='session'&&session.status==='complete'))
    return {eligible:false,reason:'尚未找到这次练习的完成记录，请先完成练习或同步学习记录。'};
  const valid=events.filter(e=>e.sessionId===sessionId&&!e.voidedBy&&e.source!=='test'&&!e.learningEvidence?.gameRecovery);
  if(!valid.some(e=>(e.activeThinkMs??Date.parse(e.revealedAt)-Date.parse(e.displayedAt))>=1500))
    return {eligible:false,reason:'本次没有可计奖的作答：快速跳过、恢复生命值练习和已撤销作答不产生宝箱。学习记录仍会保留。'};
  return {eligible:true,reason:''};
}
