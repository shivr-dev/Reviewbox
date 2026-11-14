'use client';

import {ArrowLeft, ArrowRight, Check, Clock3, Pause, Play, Target} from 'lucide-react';
import {useEffect, useMemo, useRef, useState} from 'react';
import { useTranslation } from 'react-i18next';
import {tr, formatNumber} from '@/lib/i18n';
import {localDay, type QueueItem} from '@/lib/model';
import {subjectLabel} from '@/lib/presentation';
import {currentNamespace, loadData} from '@/lib/store';
import {SPRINT_GOALS, SPRINT_TIMES, planExamSprint, sprintJobs, sprintPhaseId, sprintSummary, sprintTimeLeft, upcomingSchoolExams, type ExamSprint, type SprintGoal} from '@/lib/exam-sprint';
import {startExamSprint, updateExamSprint, type SprintCommand} from '@/lib/exam-sprint-client';
import {scoreAssessment, type AssessmentDraft} from '@/lib/assessment';
import {useReview} from './review-context';
import StudyView from './study-view';
import AssessmentRoom from './assessment-room';
import MathText from './math-text';

const t = (key: string, values?: Record<string, unknown>) => tr('dashboard:sprint.' + key, values);
const clock = (ms: number) => {
  const seconds = Math.ceil(ms / 1000);
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2,'0');
};

export default function ExamSprintView() {
  const {subject,section,data,navigate} = useReview();
  const active = sprintJobs(data).find(s => s.status !== 'complete');
  const sprint = sprintJobs(data).find(s => s.id === subject);
  if (sprint) return <SprintRoom key={sprint.id} initial={sprint}/>;
  if (active) return <SprintRoom key={active.id} initial={active}/>;
  if (subject.startsWith('exam-sprint:')) return <div className="learning-frame">
    <button className="quiet" onClick={() => navigate('home')}><ArrowLeft size={16}/>{t('home')}</button>
    <p role="status">{t('missing')}</p>
  </div>;
  return <SprintSetup key={subject+section} preferred={subject}/>;
}

function SprintSetup({preferred}: {preferred: string}) {
  const {data,navigate,refresh} = useReview();
  useTranslation();
  const exams = upcomingSchoolExams(data);
  const [examId,setExamId] = useState(exams.find(e=>e.id===preferred)?.id ?? exams[0]?.id ?? '');
  const exam = exams.find(e=>e.id===examId);
  const [minutes,setMinutes] = useState(data.settings.sprintPreferences?.minutes ?? 30);
  const [goal,setGoal] = useState<SprintGoal>(data.settings.sprintPreferences?.goal ?? 'review');
  const [scope,setScope] = useState<string[]>();
  const [busy,setBusy] = useState(false);
  const [error,setError] = useState('');
  const lock = useRef(false);
  const plan = useMemo(() => exam && planExamSprint(data,exam,minutes,goal,scope),[data,exam,minutes,goal,scope]);
  const today = localDay();
  const scopeNodes = exam ? data.nodes.filter(n=>n.subject===exam.subject && (!exam.scope.length || exam.scope.includes(n.id))) : [];
  async function submit() {
    if (!exam || !plan || lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    const ns = currentNamespace();
    try {
      const sprint = await startExamSprint(exam.id,minutes,goal,scope,ns);
      if (ns !== currentNamespace()) return;
      await refresh();
      navigate('sprint',sprint.id);
    } catch (e) {
      setError(t(e instanceof Error && e.message==='empty' ? 'noQuestions' : 'saveError'));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return <section className="learning-frame sprint-setup">
    <button className="quiet" onClick={() => navigate('home')}><ArrowLeft size={16}/>{t('home')}</button>
    <div className="learning-page-heading"><Target size={26}/><h1>{t('title')}</h1></div>
    <p>{t('setup')}</p>
    {!exams.length ? <div className="learning-actions">
      <button className="primary" onClick={() => navigate('results','all','schedule')}>{t('schedule')}</button>
      <button className="quiet" onClick={() => navigate('plan')}>{t('plan')}</button>
    </div> : <>
      <label>{t('exam')}<select value={examId} onChange={e=>{setExamId(e.target.value);setScope(undefined);setError('');}}>
        {exams.map(e=><option key={e.id} value={e.id}>{e.title} · {e.date===today?t('today'):e.date}</option>)}
      </select></label>
      <fieldset className="learning-group"><legend>{t('available')}</legend>
        <div className="learning-chips">{SPRINT_TIMES.map(n=><button type="button" key={n} className="secondary" aria-pressed={n===minutes} onClick={()=>setMinutes(n)}>{formatNumber(n)}</button>)}</div>
        <label>{t('customMinutes')}<input type="number" min="5" max="60" value={minutes || ''} onChange={e=>setMinutes(Number(e.target.value))}/></label>
      </fieldset>
      <label>{t('goal')}<select value={goal} onChange={e=>setGoal(e.target.value as SprintGoal)}>
        {SPRINT_GOALS.map(g=><option key={g} value={g}>{t('goal.'+g)}</option>)}
      </select></label>
      <details className="learning-details">
        <summary>{t('scope')} · {scope===undefined ? t('examScope') : t('topics',{count:scope.length})}</summary>
        <div className="learning-chips">
          {scopeNodes.map(n=><label key={n.id}><input type="checkbox" checked={!scope || scope.includes(n.id)} onChange={e=>{
            const current = scope ?? scopeNodes.map(n=>n.id);
            setScope(e.target.checked ? [...current,n.id] : current.filter(id=>id!==n.id));
          }}/>{n.title}</label>)}
          <button className="quiet" onClick={()=>setScope(undefined)}>{t('resetScope')}</button>
        </div>
      </details>
      {plan ? <ol className="sprint-phases">{plan.phases.map(p=><li key={p.kind}>
        <span>{t('phase.'+p.kind)}</span><small>{t('phaseEstimate',{minutes:Math.ceil(p.seconds/60),count:p.ids.length})}</small>
      </li>)}<li><span>{t('summary')}</span></li></ol> : <p role="status">{t('noQuestions')}</p>}
      {error && <p role="alert">{error}</p>}
      <div className="learning-actions">
        <button className="primary" disabled={!plan || busy} onClick={()=>void submit()}>{busy?tr('planner:正在保存'):t('start')}<ArrowRight size={17}/></button>
        {!plan && <button className="secondary" onClick={()=>navigate('subjects',exam?.subject??'all','materials')}>{t('import')}</button>}
        {!plan && <button className="quiet" onClick={()=>navigate('plan')}>{t('plan')}</button>}
      </div>
    </>}
  </section>;
}

function SprintRoom({initial}: {initial: ExamSprint}) {
  const {data,navigate,refresh} = useReview();
  const [sprint,setSprint] = useState(initial);
  const [now,setNow] = useState(Date.now);
  const [error,setError] = useState('');
  const [pending,setPending] = useState(false);
  const [showRecall,setShowRecall] = useState(false);
  const [endConfirm,setEndConfirm] = useState(false);
  const ns = useRef(currentNamespace());
  const owner = useRef('');
  if (!owner.current) owner.current = crypto.randomUUID();
  const ref = useRef(sprint);
  const writing = useRef(Promise.resolve());
  const unmounted = useRef(false);
  const phase = sprint.phases[sprint.phase];
  const phaseId = sprintPhaseId(sprint);
  const questions = useMemo(()=>new Map(data.questions.map(q=>[q.id,q])),[data.questions]);
  const items: QueueItem[] = (phase?.kind === 'recall' ? [] : phase?.ids ?? []).flatMap(id=>{
    const question = questions.get(id);
    return question && question.reviewStatus !== 'paused' &&
      (!question.expiresAt || Date.parse(question.expiresAt) > Date.now())
      ? [{question,reason:t('title'),priority:0}] : [];
  });
  const currentSession = { id:phaseId, title:t('phase.'+phase?.kind), items, mode:'review' as const };
  const activeHere = sprint.status === 'running' && sprint.timerOwner === owner.current;
  const left = sprintTimeLeft(sprint,now);
  const summary = sprintSummary(data,sprint);
  const checkIndex = sprint.phases.findIndex(p=>p.kind==='check');
  const checkId = checkIndex >= 0 ? sprintPhaseId(sprint,checkIndex) : '';
  const savedCheck = data.jobs?.find(j=>j.id==='assessment:'+checkId) as AssessmentDraft|undefined;
  const checkCanGrade = sprint.status === 'complete' && savedCheck && savedCheck.status !== 'complete' &&
    Object.values(savedCheck.answers).some(a=>a.trim());

  function command(action: SprintCommand) {
    const phaseAtRequest = ref.current.phase;
    const result = writing.current.then(async()=>{
      const next = await updateExamSprint(initial.id,owner.current,action,phaseAtRequest,ns.current);
      ref.current = next;
      if (!unmounted.current) {
        setSprint(next);
        setNow(Date.now());
      }
      return next;
    });
    writing.current = result.then(()=>{},()=>{});
    return result;
  }
  async function act(action: SprintCommand, goHome = false) {
    if (pending) return;
    setPending(true);
    setError('');
    try {
      await command(action);
      if (action==='next') setShowRecall(false);
      if (action !== 'resume') await refresh();
      if (goHome && ns.current===currentNamespace()) navigate('home');
    } catch (e) {
      setError(t(e instanceof Error && e.message==='active' ? 'otherDevice' : 'saveError'));
    } finally {setPending(false);}
  }
  useEffect(()=>{
    unmounted.current=false;
    const tick = window.setInterval(async()=>{
      setNow(Date.now());
      if (document.hidden || ref.current.status!=='running' || ref.current.timerOwner!==owner.current) return;
      if (Date.now() - (ref.current.lastTick ?? 0) < 3900 && sprintTimeLeft(ref.current)>0) return;
      const next = await command('tick').catch(()=>{if(!unmounted.current)setError(t('saveError'));});
      if (next?.status==='complete') await refresh();
    }, 500);
    const pause = () => {
      if (ref.current.status==='running' && ref.current.timerOwner===owner.current)
        void command('pause').catch(()=>{if(!unmounted.current)setError(t('saveError'));});
    };
    const visibility = () => { if (document.hidden) pause(); };
    window.addEventListener('pagehide',pause);
    document.addEventListener('visibilitychange',visibility);
    return ()=>{
      unmounted.current=true;
      clearInterval(tick);
      window.removeEventListener('pagehide',pause);
      document.removeEventListener('visibilitychange',visibility);
      pause();
    };
  }, []);

  async function gradeSavedCheck() {
    if (!savedCheck || !checkCanGrade || pending) return;
    setPending(true);
    setError('');
    try {
      const saved = await loadData(ns.current);
      const latest = saved.jobs?.find(j=>j.id===savedCheck.id) as AssessmentDraft|undefined;
      if (!latest?.session || latest.status==='complete') return;
      const remaining = new Map(saved.questions.filter(q=>q.reviewStatus!=='paused').map(q=>[q.id,q]));
      const session = {...latest.session,sprint:true,items: latest.session.items.filter(i=>remaining.has(i.question.id))};
      if (!session.items.length) return;
      await scoreAssessment(session,{...latest,status:'grading',submittedAt:latest.submittedAt??sprint.endedAt??new Date().toISOString()},undefined,ns.current);
      await refresh();
    } catch {setError(t('saveError'));}
    finally {setPending(false);}
  }

  return <section className="learning-frame sprint-room" aria-label={t('title')}>
    <header className="sprint-room-header">
      <div>
        <button className="quiet" disabled={pending} onClick={()=>void act('pause',true)}><ArrowLeft size={16}/>{t('home')}</button>
        <h1>{sprint.examTitle}</h1><small>{subjectLabel(sprint.subject)} · {t('title')}</small>
      </div>
      {sprint.status!=='complete'&&<div className="sprint-clock"><Clock3 size={18}/><span aria-label={t('remaining')}>{clock(left)}</span>
        <button className="quiet" disabled={pending} onClick={()=>void act(activeHere?'pause':'resume')}>
          {activeHere?<Pause size={17}/>:<Play size={17}/>} {t(activeHere?'pause':'resume')}
        </button>
      </div>}
    </header>
    {error&&<p role="alert">{error}</p>}
    {sprint.status==='complete'?<>
      <h2>{t('summary')}</h2>
      <dl className="sprint-metrics">
        {([
          ['attempts',formatNumber(summary.answers.length)],
          ['covered',formatNumber(summary.nodeIds.length)],
          ['budget',clock(sprint.budgetUsedMs)],
          ['effective',clock(summary.effectiveMs)],
          ['elapsed',clock(summary.elapsedMs)],
          ['away',clock(Math.max(0,summary.elapsedMs-sprint.budgetUsedMs))],
        ] as const).map(([key,value])=><div key={key}><dt>{t(key)}</dt><dd>{value}</dd></div>)}
      </dl>
      {checkCanGrade&&<button className="secondary" disabled={pending} onClick={()=>void gradeSavedCheck()}>{t('gradeSaved')}</button>}
      {!!summary.needsReview.length&&<details className="learning-details" open>
        <summary>{t('needsReview',{count:summary.needsReview.length})}</summary>
        <ul>{summary.needsReview.map(e=><li key={e.id}><MathText>{questions.get(e.questionId)?.prompt??data.historicalQuestions?.find(q=>q.id===e.questionId)?.prompt??e.nodeId}</MathText></li>)}</ul>
      </details>}
      <div className="learning-actions"><button className="primary" onClick={()=>navigate('home')}>{t('home')}</button>
        <button className="quiet" onClick={()=>navigate('results','all','report:'+sprint.examId)}>{t('report')}</button></div>
    </>:<>
      <ol className="sprint-stepper">{sprint.phases.map((p,i)=><li key={p.kind} aria-current={i===sprint.phase?'step':undefined}>{i<sprint.phase?<Check size={16}/>:null}{t('phase.'+p.kind)}</li>)}</ol>
      {!activeHere?<div className="sprint-paused"><h2>{t('phase.'+phase?.kind)}</h2><p>{t('paused')}</p>
        <button className="primary" disabled={pending} onClick={()=>void act('resume')}><Play size={17}/>{t(sprint.budgetUsedMs?'resume':'start')}</button></div>
      :phase?.kind==='recall'?<div className="sprint-recall">
        <h2>{t('phase.recall')}</h2><p>{t('recallPrompt')}</p>
        {phase.ids.map(id=>{const node=data.nodes.find(n=>n.id===id);return node&&<article key={id}>
          <h3>{node.title}</h3>{showRecall&&<MathText>{node.description}</MathText>}
        </article>;})}
        <div className="learning-actions">
          <button className="secondary" onClick={()=>setShowRecall(!showRecall)}>{t(showRecall?'hideRecall':'showRecall')}</button>
          <button className="primary" disabled={pending} onClick={()=>void act('next')}>{t('next')}<ArrowRight size={16}/></button>
        </div>
      </div>:!items.length?<div className="sprint-paused"><p>{t('noQuestions')}</p><button className="secondary" onClick={()=>void act('next')}>{t('next')}</button></div>
      :phase?.kind==='check'?<AssessmentRoom key={phaseId} session={{...currentSession,mode:'test',sprint:true}} finish={()=>void act('next')} savedExit={()=>void act('pause',true)}/>
      :<StudyView key={phaseId} sprint session={currentSession} finish={()=>void act('next')} savedExit={()=>void act('pause',true)}/>}
      <div className="sprint-bottom">
        {activeHere && phase?.kind==='practice' && <button className="quiet" disabled={pending} onClick={()=>void act('next')}>{t('next')}</button>}
        {endConfirm?<div role="group" className="learning-actions" aria-label={t('endPrompt')}>
          <span>{t('endPrompt')}</span>
          <button className="secondary" disabled={pending} onClick={()=>void act('finish')}>{t('end')}</button>
          <button className="quiet" onClick={()=>setEndConfirm(false)}>{tr('common:取消')}</button>
        </div>:<button className="quiet" onClick={()=>setEndConfirm(true)}>{t('end')}</button>}
      </div>
    </>}
  </section>;
}
