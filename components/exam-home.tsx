'use client';

import {ArrowRight, CalendarDays, Clock3, Target} from 'lucide-react';
import {useTranslation} from 'react-i18next';
import {tr, formatDate, formatNumber} from '@/lib/i18n';
import {localDay} from '@/lib/model';
import {subjectLabel} from '@/lib/presentation';
import {planExamSprint, sprintJobs, sprintSummary, upcomingSchoolExams} from '@/lib/exam-sprint';
import {completedExams, pendingExamScores, validResult} from '@/lib/exam-outcomes';
import {studyAgenda} from '@/lib/study-orchestrator';
import {presentAction} from '@/lib/presentation';
import {useReview} from './review-context';
import HomeView from './home-view';

const t=(key:string,values?:Record<string,unknown>)=>tr('dashboard:sprint.'+key,values);
export default function ExamHome() {
  useTranslation();
  const {data,navigate}=useReview();
  const [exam]=upcomingSchoolExams(data);
  const sprints=sprintJobs(data);
  const active=sprints.find(s=>s.status!=='complete');
  const pending=pendingExamScores(data)[0];
  const recent=completedExams(data).find(e=>validResult(e.result));
  const today=localDay();
  const minutes=data.settings.sprintPreferences?.minutes??30;
  const goal=data.settings.sprintPreferences?.goal??'review';
  const agenda=studyAgenda(data);
  const next=presentAction(agenda.primary);
  const keepCurrent=agenda.primary.kind==='resume';
  const topics=exam?data.nodes.filter(n=>n.subject===exam.subject&&(!exam.scope.length||exam.scope.includes(n.id))):[];
  const scope=topics.slice(0,3).map(n=>n.title).join(' · ');
  const covered=new Set(sprints.filter(s=>s.examId===exam?.id).flatMap(s=>sprintSummary(data,s).nodeIds));
  const plan=exam&&!active?planExamSprint(data,exam,minutes,goal):null;
  const practice=plan?.phases.find(p=>p.kind==='practice')??plan?.phases.find(p=>p.kind==='check');
  const focusId=practice&&data.questions.find(q=>q.id===practice.ids[0])?.nodeId;
  const focus=data.nodes.find(n=>n.id===focusId)?.title;
  const days=exam?Math.round((Date.parse(exam.date)-Date.parse(today))/86400000):0;
  return <>
    {exam||active?<section className="exam-home learning-frame">
      <div className="exam-home-main">
        <div className="exam-home-kicker"><CalendarDays size={16}/>{t(active?'resumeTitle':'upNext')}</div>
        <h1>{active?.examTitle??exam?.title}</h1>
        <p className="exam-home-meta">{subjectLabel(active?.subject??exam?.subject??'all')}
          {exam&&(!active||active.examId===exam.id)&&<> · {formatDate(exam.date+'T12:00:00')} · {days===0?t('today'):t('countdown',{count:days})}</>}
        </p>
        {exam&&(!active||active.examId===exam.id)&&<dl className="exam-home-detail">
          <div><dt>{t('target')}</dt><dd>{formatNumber(exam.target)}%</dd></div>
          <div><dt>{t('scope')}</dt><dd>{scope||t(exam.scope.length?'scopeMissing':'wholeSubject')}{topics.length>3&&<small> +{topics.length-3}</small>}</dd></div>
          <div><dt>{t('coverage')}</dt><dd>{t('coveredTopics',{count:topics.filter(n=>covered.has(n.id)).length,total:topics.length})}</dd></div>
          {focus&&<div><dt>{t('focus')}</dt><dd>{focus}</dd></div>}
        </dl>}
        <div className="learning-actions">
          {keepCurrent?<button className="primary" onClick={()=>navigate('plan','all','launch:'+next.id)}>{next.label}<ArrowRight size={17}/></button>:
          <button className="primary" onClick={()=>navigate('sprint',active?.id??exam?.id)}>
            {active?t('resume'):t('startMinutes',{minutes})}<ArrowRight size={17}/>
          </button>}
          {keepCurrent&&<button className="quiet" onClick={()=>navigate('sprint',active?.id??exam?.id)}>{t('title')}</button>}
          {!active&&!keepCurrent&&<button className="quiet" onClick={()=>navigate('results','all','schedule')}>{t('schedule')}</button>}
        </div>
      </div>
      <div className="exam-home-aside">
        <Clock3 size={19}/><h2>{t('todayStudy')}</h2>
        <strong>{next.title}</strong><p>{next.reason}</p>
        {next.minutes>0&&<small>{t('minutes',{minutes:next.minutes})}</small>}
        <button className="quiet" onClick={()=>navigate('plan')}>{t('plan')}<ArrowRight size={15}/></button>
      </div>
    </section>:<HomeView direct/>}
    {(pending||recent)&&<section className="exam-home-followup learning-frame">
      <Target size={18}/><div><h2>{t('followUp')}</h2><p>{pending?.title??recent!.title} · {t(pending?'scorePending':'scoreSaved')}</p></div>
      <button className="quiet" onClick={()=>navigate('results','all',(pending?'score:':'report:')+(pending?.id??recent!.id))}>
        {t(pending?'enterScore':'report')}<ArrowRight size={16}/>
      </button>
    </section>}
  </>;
}
