import {objectiveScore} from './question-tools';
import {objective,guessingSignals,learningSchedule} from './learning-intelligence';
import {errorCauseEstimate} from './learning-evidence';
import type {AnswerEvent,StudyData} from './model';

export type WatchAnswer = {
  eventId: string; sessionId: string; questionId: string; answer: string;
  occurredAt: string; displayedAt: string; revealedAt: string;
  activeThinkMs: number; wallTimeMs: number; idleMs: number;
  confidence?: 'sure' | 'unsure' | 'guess'; selfOutcome?: 'correct' | 'wrong' | 'unsure';
  timeZone?: string;
};
const finite = (v: number, maximum: number) => Number.isFinite(v) && v >= 0 && v <= maximum;
export function watchAnswerEvent(data: StudyData, input: WatchAnswer, now = Date.now()): AnswerEvent {
  const q = data.questions.find(q => q.id === input.questionId);
  if (!q || q.reviewStatus === 'paused') throw new Error('题目不存在或已暂停，请同步后重试');
  if (!/^[\w:-]{1,150}$/.test(input.eventId) || !/^[\w:-]{1,150}$/.test(input.sessionId)) throw new Error('作答标识无效');
  const at = Date.parse(input.occurredAt), start = Date.parse(input.displayedAt), reveal = Date.parse(input.revealedAt);
  if (![at,start,reveal].every(Number.isFinite) || at > now+300000 || start>reveal || reveal>at || at-start>86400000) throw new Error('作答时间无效');
  if (![input.activeThinkMs,input.wallTimeMs,input.idleMs].every(v=>finite(v,86400000)) || input.activeThinkMs>input.wallTimeMs || input.idleMs>input.wallTimeMs) throw new Error('有效作答时间无效');
  if (typeof input.answer !== 'string' || input.answer.length>30000) throw new Error('回答过长');
  if (!objective(q) && !['correct','wrong','unsure'].includes(input.selfOutcome ?? '')) throw new Error('请按解析手动检查这道题');
  const zone=input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  if(typeof zone!=='string'||zone.length>80)throw new Error('时区无效');
  const day=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(at));
  const score = objective(q) ? objectiveScore(q,input.answer) : input.selfOutcome==='correct'?1:input.selfOutcome==='unsure'?.5:0;
  const schedule = learningSchedule(data,q,now);
  const event: AnswerEvent = {
    id: input.eventId, questionId:q.id, nodeId:q.nodeId, skillId:q.skillId, subject:q.subject,
    outcome: score>=.85?'correct':score>=.4?'unsure':'wrong', score, source:'self',
    answer:input.answer,occurredAt:input.occurredAt, displayedAt:input.displayedAt,revealedAt:input.revealedAt,
    activeThinkMs:input.activeThinkMs,wallTimeMs:input.wallTimeMs,idleMs:input.idleMs,
    expectedSeconds:q.expectedSeconds,difficulty:q.difficulty,variant:q.variant,usedHint:false,
    reason:'手表复习',sessionId:input.sessionId,localDay:day,version:1,
    predictedConfidence:input.confidence ?? 'unsure',
    learningEvidence:{version:1,assessment:objective(q)?'objective':'self',policy:schedule.policy,
      intervalFactor:schedule.factor,memoryFamily:schedule.family,cognitiveAttributes:schedule.cognitiveAttributes,
      conceptIds:schedule.conceptIds,contextId:schedule.contextId,transferFrom:schedule.transferFrom},
  };
  if(score<.85) event.errorCause=errorCauseEstimate(event,data.events);
  const signals=guessingSignals(q,event,data.events);
  if(signals.length) {event.learningEvidence!.suspect=true;event.learningEvidence!.signals=signals;event.evidenceWeight=.3;}
  return event;
}

