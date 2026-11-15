'use client';
import {formatDate, tr} from '@/lib/i18n';
import { ArrowRight, Clock3 } from 'lucide-react';
import { useState } from 'react';
import { useReview } from './review-context';
import { studyAgenda, type StudyAction } from '@/lib/study-orchestrator';
import {presentHomeAction} from '@/lib/presentation';
import { localDay } from '@/lib/model';
export default function HomeView({
  direct = false, planned, onLaunch, blocked = false,
}: { direct?: boolean; planned?: ReturnType<typeof studyAgenda>; onLaunch?: (action: StudyAction) => void; blocked?: boolean } = {}) {
  const { data, navigate } = useReview();
  const [selection, setSelection] = useState('');
  const agenda = planned ?? studyAgenda(data);
  const options = [agenda.primary, ...agenda.actions.filter(action => action.id !== agenda.primary.id)]
    .slice(0, 3).map(action => presentHomeAction(action, data));
  const next = options.find(action => action.id === selection) ?? options[0];
  const today = localDay();
  return (
    <section className="now-home" aria-label={tr("dashboard:现在应该做什么")}>
      <header className="rb-home-task-heading">
        <h1>{tr("dashboard:sprint.todayStudy")}</h1>
        <time dateTime={today}>{formatDate(today+'T12:00:00', {month:'short',day:'numeric'})}</time>
        {next.subjectName && <span className="rb-home-task-subject">{next.subjectName}</span>}
      </header>
      <div className="rb-home-task">
        <div className="rb-home-task-copy" aria-live="polite">
          {options.map(action => <div key={action.id} className="rb-home-copy-option"
            aria-hidden={action.id !== next.id || undefined}>
            <h2 title={action.title}>{action.title}</h2>
            <p title={action.reason}>{action.reason}</p>
          </div>)}
        </div>
        <div className="rb-home-task-controls">
          <button className="primary" disabled={blocked} onClick={() => onLaunch
            ? onLaunch(next) : direct ? navigate('plan', 'all', 'launch:' + next.id) : navigate('plan')}>
            {direct ? <span className="rb-home-action-labels">
              {options.map(action => <span key={action.id}
                aria-hidden={action.id !== next.id || undefined}>{action.label}</span>)}
            </span> : tr("dashboard:进入学习计划")}
            <ArrowRight size={19} aria-hidden="true" />
          </button>
          {options.some(action => action.minutes > 0) && <span className="rb-home-duration"
            aria-hidden={next.minutes <= 0 || undefined}>
            <Clock3 size={16} />{tr('dashboard:sprint.minutes', {minutes:next.minutes})}
          </span>}
        </div>
      </div>
      {options.length > 1 && <div className="rb-home-task-choices" role="group" aria-label={tr('planner:接下来的安排')}>
        {options.map(action => <button type="button" key={action.id} aria-pressed={action.id === next.id}
          onClick={() => setSelection(action.id)}>{action.label}</button>)}
      </div>}
    </section>
  );
}
