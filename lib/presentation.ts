import {tr} from './i18n';
import {SUBJECTS} from './model';
import type {StudyAction} from './study-orchestrator';
export const subjectLabel=(id:string)=>{const s=SUBJECTS.find(s=>s.id===id);return s?tr('subjects:'+s.name):id;};
export function presentAction<T extends StudyAction>(action:T):T{
 const result={...action};for(const field of ['title','reason','label'] as const){const m=action.localization?.[field];if(m)result[field]=tr(m.key,m.values);}return result;
}
export function presentAgenda<T extends {primary:StudyAction;actions:StudyAction[]}>(agenda:T):T{return {...agenda,primary:presentAction(agenda.primary),actions:agenda.actions.map(presentAction)};}
