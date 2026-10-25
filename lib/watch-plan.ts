import {projectRecords} from './record-projection';
import {watchAgenda} from './watch-agenda';
import type {LocalRecord} from './model';

/** Use the complete account library for planning, not just questions downloaded on one watch.
 * Cache only the chosen task's questions; browsing a plan does not download every package.
 */
export function watchStudyPlan(records:LocalRecord[],selectedId?:string,now=Date.now(),deviceId?:string) {
  const agenda=watchAgenda(projectRecords(records),now,deviceId);
  const selected=selectedId?agenda.actions.find(a=>a.id===selectedId):agenda.primary;
  if(!selected)throw new Error('学习计划已更新，请同步后选择当前安排');
  const header=(a:typeof selected)=>{
    const {items,...rest}=a;
    return {...rest,questionIds:(items??[]).map(i=>i.question.id)};
  };
  const ids=new Set((selected.items??[]).map(i=>i.question.id));
  if(selected.kind==='resume') {
    const job=records.find(r=>!r.deleted&&r.kind==='job'&&(r.id===selected.target||r.payload?.id===selected.target))?.payload;
    for(const item of job?.items??[])ids.add(item.question.id);
  }
  return {recommendation:header(agenda.primary),actions:agenda.actions.map(header),selected:header(selected),
    questionRecords:records.filter(r=>!r.deleted&&r.kind==='question'&&ids.has(r.id)),
    taskRecords:records.filter(r=>!r.deleted&&r.kind==='job'&&(r.id===selected.target||r.payload?.id===selected.target)),
    capabilities:{practice:false,assessment:true},computedAt:new Date(now).toISOString()};
}
