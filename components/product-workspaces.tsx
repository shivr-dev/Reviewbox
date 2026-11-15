'use client';
import NaviSourceWorkspace from './navi-source-workspace';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import { lazy,Suspense } from 'react';
import { useReview } from './review-context';
import SubjectsView from './subjects-view';
import LibraryView from './library-view';
import PublicPackLibrary from './public-pack-library';
import CourseHub from './course-hub';
import AnalyticsView from './analytics-view';
import ExamResults from './exam-results';
import { FullExamHub } from './exam-hub';
import {isExamScheduled,localDay,SUBJECTS} from '@/lib/model';
import { examGpa } from '@/lib/exam-outcomes';
import { completedExams, pendingExamScores, validExamDate, validResult } from '@/lib/exam-outcomes';
import ExamReviewReport from './exam-review-report';
import { weeklyLearningGpa } from '@/lib/study-assistant';
import ExamSchedule from './exam-schedule';
export { default as ExamSchedule } from './exam-schedule';
import { ArrowRight, BarChart3, BookOpen, CalendarDays, ClipboardList, FolderOpen, GraduationCap, LibraryBig, ListChecks, Network } from 'lucide-react';
import SubjectIcon from './subject-icon';
import SubjectOverview from './subject-overview';

const LearningPackStudio=lazy(()=>import('./learning-pack-studio'));
const ExamPublishingStudio=lazy(()=>import('./exam-publishing-studio'));
const KnowledgeMap=lazy(()=>import('./knowledge-map'));

const subjectSections = [
  {id:'subjects', label:'common:学科', icon:LibraryBig},
  {id:'courses', label:'library:课程', icon:BookOpen},
  {id:'materials', label:'library:资料与导入', icon:FolderOpen},
  {id:'questions', label:'library:题库管理', icon:ListChecks},
  {id:'map', label:'library:知识地图', icon:Network},
] as const;

export function ProductSubjects({
  initialView = 'subjects',
}: { initialView?: string } = {}) {
  const { data, subject, section, navigate } = useReview();
  const view = section || initialView;
  const discipline = SUBJECTS.find(item => item.id === subject);
  const selected = discipline?.id ?? 'all';
  const landing = view === 'subjects';
  const inventory = selected === 'all' && ['practice', 'courses'].includes(view);
  const libraryPage = view.startsWith('library-') ? view.slice(8) : undefined;
  const publicCatalog = ['discover', 'discover-pack', 'discover-publish'].includes(view);
  const active = libraryPage || publicCatalog || ['packs','pack','packs-devices','studio','publish','data','import'].includes(view) ? 'materials' : view;
  const switchSubject = (id: string) => navigate('subjects', id, view);
  const current = subjectSections.find(item => item.id === active);
  const sectionLabel = current ? tr(current.label) : view === 'practice' ? tr('subjects:练习') : tr('library:资料库');
  const loading = <p role="status" className="rb-subject-loading">{tr('common:加载中…')}</p>;

  return (
    <NaviSourceWorkspace target={{type:'subject',id:selected}} subject={selected} priority={1}>
      <section className={'alpha-workspace rb-subject-workspace' + (landing ? '' : ' rb-subject-detail')}>
        {landing ? <header className="rb-subject-heading"><h1>{tr('navigation:学科与资料')}</h1></header>
          : <header className="rb-subject-toolbar">
          <nav className="rb-subject-sections" aria-label={tr('common:学科与资料功能')}>
          {subjectSections.map(({id,label,icon:Icon}) => (
            <button type="button" key={id} aria-current={active === id ? 'page' : undefined}
              onClick={() => navigate('subjects', selected, id)}>
              <Icon size={18} aria-hidden="true" />{tr(label)}
            </button>
          ))}
          </nav>
          {!inventory && !publicCatalog && view !== 'map' && <select className="rb-subject-switcher" aria-label={tr('common:学科')} value={selected} onChange={event => switchSubject(event.target.value)}>
            <option value="all">{tr('common:全部学科')}</option>
            {SUBJECTS.map(item => <option key={item.id} value={item.id}>{subjectName(item.id)}</option>)}
          </select>}
        </header>}
        <div className={'rb-subject-layout' + (landing ? ' rb-subject-landing' : '')}>
          {landing && <aside className="rb-subject-index" aria-label={tr('common:学科')}>
            <label className="rb-subject-picker">
              <select aria-label={tr('common:学科')} value={selected} onChange={event => switchSubject(event.target.value)}>
                <option value="all">{tr('common:全部学科')}</option>
                {SUBJECTS.map(item => <option key={item.id} value={item.id}>{subjectName(item.id)}</option>)}
              </select>
            </label>
            <nav aria-label={tr('common:全部学科')}>
              <button type="button" aria-current={selected === 'all' ? 'true' : undefined} onClick={() => switchSubject('all')}>
                <LibraryBig size={19} aria-hidden="true" />{tr('common:全部学科')}
              </button>
              {SUBJECTS.map(item => <button key={item.id} type="button" onClick={() => switchSubject(item.id)}
                aria-current={selected === item.id ? 'true' : undefined}>
                <span style={{color:item.color}}><SubjectIcon subject={item.id} size={18} /></span>{subjectName(item.id)}
              </button>)}
            </nav>
          </aside>}
          <section className="rb-subject-content" aria-label={sectionLabel}>
            {landing ? <SubjectOverview key={selected} selected={selected} /> : inventory ? (
              <div className="rb-subject-inventory">
                {SUBJECTS.map(item => {
                  const knowledge = data.nodes.filter(node => node.subject === item.id).length;
                  const questions = data.questions.filter(question => question.subject === item.id).length;
                  const materials = data.materials.filter(material => material.subject === item.id).length;
                  return <button type="button" key={item.id} onClick={() => switchSubject(item.id)}>
                    <div className="rb-subject-glyph" style={{color:item.color}}>
                      <SubjectIcon subject={item.id} size={25} />
                    </div>
                    <div>
                      <strong>{subjectName(item.id)}</strong>
                      <span>{knowledge} {tr('subjects:个知识点')} · {questions} {tr('subjects:道练习')}
                        {materials > 0 && <> · {materials} {tr('library:学习资料')}</>}</span>
                    </div>
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>;
                })}
              </div>
            ) : publicCatalog ? (
              <PublicPackLibrary key={selected} embedded />
            ) : view === 'studio' ? (
              <Suspense fallback={loading}><LearningPackStudio key={selected} /></Suspense>
            ) : view === 'publish' ? (
              <Suspense fallback={loading}><ExamPublishingStudio key={selected} /></Suspense>
            ) : view === 'map' ? (
              <Suspense fallback={loading}><KnowledgeMap /></Suspense>
            ) : view === 'practice' ? (
              <SubjectsView key={selected} embedded />
            ) : view === 'courses' && discipline ? (
              <CourseHub key={selected} subject={discipline.id} embedded />
            ) : (
              <LibraryView key={selected + view} embedded openImport={view === 'import'} page={libraryPage}
                initialTab={view === 'questions' ? 'questions' : ['packs','pack','packs-devices'].includes(view) || libraryPage === 'export' ? 'content' : view === 'data' || libraryPage ? 'data' : 'materials'}
              />
            )}
          </section>
        </div>
      </section>
    </NaviSourceWorkspace>
  );
}
const resultsSections = [
  { id: 'scores', label: '成绩与 GPA', icon: GraduationCap },
  { id: 'schedule', label: '考试安排', icon: CalendarDays },
  { id: 'simulations', label: '模拟考试', icon: ClipboardList },
  { id: 'analysis', label: '学习分析', icon: BarChart3 },
] as const;

export function ProductResults({ initialView = 'scores' }: { initialView?: string } = {}) {
  const { data, section, navigate } = useReview();
  const route = section || initialView;
  const scoreId = route.startsWith('score:') ? route.slice(6) : undefined;
  const reportId = route.startsWith('report:') ? route.slice(7) : undefined;
  const view = scoreId || reportId ? 'scores' : route;
  const attendance = completedExams(data);
  const scores = attendance.filter(exam => validResult(exam.result));
  const pending = pendingExamScores(data);
  const real = examGpa(data);
  const weekly = weeklyLearningGpa(data);
  const points = new Map(real.rows.map(row => [row.exam.id, row]));
  const today = localDay();
  const nextExam = data.exams.filter(exam => isExamScheduled(exam) && validExamDate(exam.date) && exam.date >= today &&
    !validResult(exam.result)).sort((left, right) => left.date.localeCompare(right.date))[0];
  const featured = pending[0] ?? nextExam;
  const open = (id: string) => navigate('results', 'all', id);
  const focusLabel = pending.length ? tr('results:待录入成绩') : tr('results:desk.next');
  const trustedGpaLabel = tr('dashboard:examReview.' + (real.configured ? 'academicGpa' : 'estimatedGpa'));

  return <section className="alpha-workspace rb-results-desk">
    <header className="rb-results-heading"><h1>{tr('common:成绩与考试')}</h1></header>
    <div className="rb-results-layout">
      <nav className="rb-subject-sections rb-results-index" aria-label={tr('common:成绩与考试功能')}>
        {resultsSections.map(({ id, label, icon: Icon }) => <button type="button" key={id}
          aria-current={view === id ? 'page' : undefined} onClick={() => open(id)}>
          <Icon size={20} aria-hidden="true" /><span>{tr('common:' + label)}</span>
        </button>)}
      </nav>
      <div className="rb-results-main" key={reportId ? route : view}>
        {reportId ? <ExamReviewReport id={reportId} /> : view === 'scores' ? <>
          <div className="rb-results-lead">
            <section className="rb-results-upcoming">
              <h2>{focusLabel}</h2>
              <div className="rb-results-upcoming-main">
                {featured ? <time className="rb-results-date" dateTime={featured.date} aria-label={featured.date}>
                  <span>{featured.date.slice(0, 7)}</span><strong>{featured.date.slice(-2)}</strong>
                </time> : <div className="rb-results-date" aria-hidden="true"><CalendarDays size={29} /></div>}
                <div>
                  <h3>{featured?.title ?? tr('results:desk.noExam')}</h3>
                  {featured && <p>{subjectName(featured.subject)}</p>}
                </div>
              </div>
              <button type="button" className="secondary" onClick={() => open(pending[0] ? 'score:' + pending[0].id : 'schedule')}>
                {pending.length ? tr('common:录入考试成绩') : tr('common:考试安排')}<ArrowRight size={16} />
              </button>
            </section>
            <section className="rb-results-gpa">
              <h2>{trustedGpaLabel}</h2>
              <div className="rb-results-gpa-value">
                <strong>{real.value === null ? '—' : real.value.toFixed(2)}</strong><span>/ {real.config.scale}</span>
              </div>
              {!!real.rows.length && <p>{tr('common:基于 {{v0}} 场已录入真实考试', { v0: real.rows.length })}</p>}
              <ExamResults key={scoreId ?? 'scores'} initialExamId={scoreId} autoOpen={!!scoreId} reviewOnSave
                buttonOnly onClosed={scoreId ? () => open('scores') : undefined} />
            </section>
          </div>
          <section className="rb-results-ledger">
            <h2>{tr('dashboard:examReview.performance')}</h2>
            {scores.length ? <div className="rb-results-records">
              {scores.map(exam => <button type="button" className="rb-results-record" key={exam.id} onClick={() => open('report:' + exam.id)}>
                <span><strong>{exam.title}</strong><small>{subjectName(exam.subject)} · <time dateTime={exam.date}>{exam.date}</time></small></span>
                <span><strong>{exam.result!.score} / {exam.result!.maxScore}</strong>
                  <small>{points.get(exam.id)?.grade || tr('dashboard:examReview.target') + ' ' + exam.target + '%'}</small></span>
                <ArrowRight size={17} aria-hidden="true" />
              </button>)}
            </div> : <p className="rb-results-empty">{tr('common:尚无成绩')}</p>}
          </section>
          <div className="rb-results-week">
            <span>{tr('common:每周学习 GPA · 非官方成绩')}</span>
            <strong>{weekly.value === null ? '—' : weekly.value.toFixed(2)} <small>/ 4</small></strong>
            <button type="button" className="quiet" onClick={() => open('analysis')}>{tr('common:学习分析')}<ArrowRight size={16} /></button>
          </div>
        </> : view === 'schedule' ? <ExamSchedule /> : view === 'simulations' ? <FullExamHub /> : <AnalyticsView embedded />}
      </div>
    </div>
  </section>;
}
