import {tr} from './i18n';
import {SUBJECTS, type QueueItem, type StudyData} from './model';
import type {StudyAction} from './study-orchestrator';
import {questionTopicTitle} from './pinyin-collections';
export const subjectLabel=(id:string)=>{const s=SUBJECTS.find(s=>s.id===id);return s?tr('subjects:'+s.name):id;};
export function presentAction<T extends StudyAction>(action:T):T{
 const result={...action};for(const field of ['title','reason','label'] as const){const m=action.localization?.[field];if(m)result[field]=tr(m.key,m.values);}return result;
}
export function presentAgenda<T extends {primary:StudyAction;actions:StudyAction[]}>(agenda:T):T{return {...agenda,primary:presentAction(agenda.primary),actions:agenda.actions.map(presentAction)};}

/** Lead with the topic of the actual first question, including on resumed sessions. */
export function presentHomeAction(action: StudyAction, data: StudyData) {
  const presented = presentAction(action);
  const session = action.kind === 'resume' &&
    data.jobs?.find(job => job.kind === 'session' && job.id === action.target);
  const answered = session ? new Set(data.events
    .filter(event => event.sessionId === session.id).map(event => event.questionId)) : undefined;
  const resumed = session && Array.isArray(session.items) && (session.items as QueueItem[]).find(({question}) =>
    question && !answered?.has(question.id) &&
    data.questions.some(candidate => candidate.id === question.id && candidate.reviewStatus !== 'paused'));
  const question = action.items?.[0]?.question ?? (resumed ? resumed.question : undefined);
  const node = data.nodes.find(candidate => candidate.id === (question?.nodeId ?? action.scope?.[0]));
  const subject = question?.subject ?? node?.subject ?? action.subject;
  const topic = question && (node || question.collectionTitle) ? questionTopicTitle(question, node) : node?.title;
  const step = action.kind === 'practice' ? tr('subjects:复习') : presented.label;
  return {
    ...presented,
    title: topic ? tr('dashboard:homeActionTopic', {step, topic}) : presented.title,
    subjectName: subject && subject !== 'all' ? subjectLabel(subject) : undefined,
  };
}
