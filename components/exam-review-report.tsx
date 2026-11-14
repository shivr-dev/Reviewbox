'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {formatDate,formatNumber,tr} from '@/lib/i18n';
import {sprintJobs,sprintSummary} from '@/lib/exam-sprint';
import {validResult} from '@/lib/exam-outcomes';
import {EXAM_REVIEW_CAUSES, saveExamReview} from '@/lib/exam-outcome-client';
import {currentNamespace} from '@/lib/store';
import type {Exam} from '@/lib/model';
import {useReview} from './review-context';

const t=(key:string,values?:Record<string,unknown>)=>tr('dashboard:examReview.'+key,values);
type Review=NonNullable<Exam['review']>;
export default function ExamReviewReport({id}:{id:string}) {
  const {data,navigate,refresh}=useReview();
  useTranslation();
  const exam=data.exams.find(e=>e.id===id);
  if(!exam)return <p role="status">{t('missing')}</p>;
  return <ReviewReport key={id} exam={exam} refresh={refresh}/>;
}
function ReviewReport({exam,refresh}:{exam:Exam;refresh:()=>Promise<void>}) {
  const {data,navigate}=useReview();
  const [editing,setEditing]=useState(!exam.review);
  const [form,setForm]=useState<Omit<Review,'updatedAt'>>(exam.review??{
    expectation:'',causes:[],nodeIds:[],followUp:false,
  });
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState('');
  const [error,setError]=useState('');
  const lock=useRef(false);
  const sprints=sprintJobs(data).filter(s=>s.examId===exam.id);
  const summaries=sprints.map(s=>sprintSummary(data,s));
  const covered=new Set(summaries.flatMap(s=>s.nodeIds));
  const practice= sprints.reduce((sum,s)=>sum+s.budgetUsedMs,0);
  const effective=summaries.reduce((sum,s)=>sum+s.effectiveMs,0);
  const percent=validResult(exam.result)?100*exam.result.score/exam.result.maxScore:null;
  const nodes=data.nodes.filter(n=>n.subject===exam.subject&&(!exam.scope.length||exam.scope.includes(n.id)));
  const suggestions=exam.review?.followUp?exam.review.causes:[];
  async function save() {
    if(lock.current)return;
    lock.current=true;setBusy(true);setError('');setMessage('');
    const ns=currentNamespace();
    try {
      await saveExamReview(exam.id,form,ns);
      if(ns!==currentNamespace())return;
      await refresh();setEditing(false);setMessage(t('saved'));
    } catch {setError(t('saveError'));}
    finally {lock.current=false;setBusy(false);}
  }
  const toggle=<T,>(items:T[],value:T)=>items.includes(value)?items.filter(v=>v!==value):[...items,value];
  return <section className="learning-frame exam-review-report">
    <button className="quiet" onClick={()=>navigate('results','all','scores')}><ArrowLeft size={16}/>{t('back')}</button>
    <h2>{exam.title}</h2><p>{t('title')} · {formatDate(exam.date+'T12:00:00')}</p>
    <dl className="sprint-metrics">
      <div><dt>{t('target')}</dt><dd>{exam.target}%</dd></div>
      <div><dt>{t('score')}</dt><dd>{percent===null?t('unreleased'):`${exam.result!.score} / ${exam.result!.maxScore} · ${formatNumber(percent,{maximumFractionDigits:1})}%`}</dd></div>
      <div><dt>{t('coverage')}</dt><dd>{covered.size}</dd></div>
      <div><dt>{t('time')}</dt><dd>{t('minutes',{minutes:formatNumber(practice/60000,{maximumFractionDigits:1})})}</dd></div>
      <div><dt>{t('effective')}</dt><dd>{t('minutes',{minutes:formatNumber(effective/60000,{maximumFractionDigits:1})})}</dd></div>
    </dl>
    {percent!==null&&<p>{t(percent>=exam.target?'targetMet':'targetBelow')}</p>}
    {!!covered.size&&<ul className="sprint-phases">{[...covered].map(id=><li key={id}>{data.nodes.find(n=>n.id===id)?.title??id}</li>)}</ul>}
    {!!sprints.length&&<ul className="sprint-phases">{sprints.map(s=><li key={s.id}>
      <button className="quiet" onClick={()=>navigate('sprint',s.id)}>{formatDate(s.startedAt)} · {t('sprint')}<ArrowRight size={15}/></button>
    </li>)}</ul>}
    {percent===null?<button className="primary" onClick={()=>navigate('results','all','score:'+exam.id)}>{t('enterScore')}</button>:
    editing?<form className="check-in-subsection" onSubmit={e=>{e.preventDefault();void save();}}>
      <div><h3>{t('reflection')}</h3><p>{t('reflectionHelp')}</p></div>
      <label>{t('expectation')}<select value={form.expectation} onChange={e=>setForm({...form,expectation:e.target.value as Review['expectation']})}>
        {['','below','met','above'].map(v=><option key={v} value={v}>{t('expectation.'+(v||'skip'))}</option>)}
      </select></label>
      <fieldset className="learning-group"><legend>{t('causes')}</legend><div className="learning-chips">
        {EXAM_REVIEW_CAUSES.map(c=><label key={c}><input type="checkbox" checked={form.causes.includes(c)} onChange={()=>setForm({...form,causes:toggle(form.causes,c)})}/>{t('cause.'+c)}</label>)}
      </div></fieldset>
      {!!nodes.length&&<details className="learning-details"><summary>{t('selectTopics')} · {form.nodeIds.length}</summary><div className="learning-chips">
        {nodes.map(n=><label key={n.id}><input type="checkbox" checked={form.nodeIds.includes(n.id)} onChange={()=>setForm({...form,nodeIds:toggle(form.nodeIds,n.id)})}/>{n.title}</label>)}
      </div></details>}
      <label className="feedback-check"><input type="checkbox" checked={form.followUp} onChange={e=>setForm({...form,followUp:e.target.checked})}/>{t('followUp')}</label>
      <div className="learning-actions"><button className="primary" disabled={busy}>{busy?tr('planner:正在保存'):t('save')}</button>
      <button className="quiet" type="button" disabled={busy} onClick={()=>setEditing(false)}>{t('skip')}</button></div>
    </form>:<div className="check-in-subsection">
      <h3>{t('reflection')}</h3>
      {exam.review?.causes.length?<p>{exam.review.causes.map(c=>t('cause.'+c)).join(' · ')}</p>:null}
      {!!suggestions.length&&<ul>{suggestions.map(c=><li key={c}>{t('advice.'+c)}</li>)}</ul>}
      <div className="learning-actions">
        <button className="secondary" onClick={()=>setEditing(true)}>{t(exam.review?'edit':'add')}</button>
        <button className="quiet" onClick={()=>navigate('plan')}>{t('plan')}<ArrowRight size={15}/></button>
      </div>
    </div>}
    {message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}
  </section>;
}
