'use client';
import {MembershipPromo} from './membership-view';

import { tr } from '@/lib/i18n';
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import {
  GraduationCap,
  Home,
  LibraryBig,
  BookOpen,
  ArrowUpRight,
  ArrowRight,
} from 'lucide-react';
import {
  MAIN_NAV,
  workspaceSection,
  parseWorkspaceRoute,
} from '@/lib/workspace-route';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import ExamHome from './exam-home';
import { examGpa } from '@/lib/exam-outcomes';
import NaviAvatar from './navi-avatar';
import { openPageNavi, composeNavi } from './navi-workspace';
import { sprintJobs } from '@/lib/exam-sprint';
import StudyPlanView from './study-plan-view';

const icons = {
  home: Home,
  subjects: LibraryBig,
  results: GraduationCap,
};

function previewHomeDestination(nav: HTMLElement, target: EventTarget | null) {
  const option = target instanceof Element ? target.closest('button') : null;
  if (!option || !nav.contains(option)) return;
  const bounds = option.getBoundingClientRect();
  nav.toggleAttribute('data-preview-sliding', nav.hasAttribute('data-preview'));
  nav.style.setProperty('--home-nav-preview-x', (bounds.left - nav.getBoundingClientRect().left - nav.clientLeft) + 'px');
  nav.style.setProperty('--home-nav-preview-width', bounds.width + 'px');
  nav.toggleAttribute('data-preview', !option.hasAttribute('aria-current'));
}
export default function ProductShell({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}) {
  const { navigate, subject, section } = useReview();
  const content = useRef<HTMLDivElement>(null);
  const lastRoute = useRef<string | null>(null);
  const workspace = workspaceSection(page);
  const active = workspace === 'plan' ? 'home' : workspace,
    ns = currentNamespace();
  const dailyWorkspace = page === 'home' || page === 'plan';
  const showsNavi = !dailyWorkspace && page !== 'sprint';
  useLayoutEffect(() => {
    const route = typeof window === 'undefined' ? '' : window.location.hash;
    const previous = lastRoute.current;
    lastRoute.current = route;
    if (previous === null || previous === route || page === 'study' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const transition = content.current?.animate([
      { opacity: .65, translate: '0 5px' },
      { opacity: 1, translate: '0 0' },
    ], { duration: 250, easing: 'cubic-bezier(.2,.65,.3,1)' });
    return () => transition?.cancel();
  }, [page, subject, section]);
  useEffect(() => {
    if (active === 'subjects' && page !== 'course')
      try {
        sessionStorage.setItem('review-subjects:' + ns, location.hash);
      } catch {}
  }, [page, subject, section, ns, active]);
  function go(id: string) {
    if (id === 'subjects') {
      try {
        const saved = sessionStorage.getItem(
          'review-subjects:' + ns,
        );
        if (saved) {
          const r = parseWorkspaceRoute(saved);
          if (workspaceSection(r.page) === id) {
            navigate(r.page, r.subject, r.section, r.target);
            return;
          }
        }
      } catch {}
    }
    navigate(id);
  }
  return (
    <div className={'alpha-product rb-brand-studio rb-dock-shell alpha-page-' + (dailyWorkspace ? 'home' : page)}
      data-ui-mode="workspace">
      <header className="rb-home-masthead" data-navi={showsNavi || undefined}>
        <button type="button" className="alpha-logo" aria-label={tr('common:Reviewbox 首页')} onClick={() => navigate('home')}>
          <span className="rb-nav-wordmark" lang="en" aria-hidden="true">Reviewbox<i>.</i></span>
        </button>
        <nav aria-label={tr('common:主要功能')}
          onPointerOver={event => {
            if (event.pointerType !== 'touch') previewHomeDestination(event.currentTarget, event.target);
          }}
          onPointerLeave={event => event.currentTarget.removeAttribute('data-preview')}
          onFocus={event => {
            if ((event.target as HTMLElement).matches(':focus-visible')) previewHomeDestination(event.currentTarget, event.target);
          }}
          onBlur={event => {
            if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.removeAttribute('data-preview');
          }}>
          <span className="rb-home-dock-preview" aria-hidden="true" />
          {MAIN_NAV.map(({ id, label }) => {
            const Icon = icons[id];
            return <button type="button" key={id} className={'alpha-nav-button ' + (active === id ? 'selected' : '')}
              aria-label={tr('navigation:' + label)} aria-current={active === id ? 'page' : undefined} onClick={() => go(id)}>
              <Icon size={22} strokeWidth={1.9} aria-hidden="true" />
              <span className="rb-nav-label" aria-hidden="true">{tr('navigation:' + label)}</span>
            </button>;
          })}
        </nav>
        <button type="button" className={'alpha-profile ' + (active === 'you' ? 'selected' : '')}
          aria-label={tr('navigation:我的')} aria-current={active === 'you' ? 'page' : undefined} onClick={() => navigate('you')}>
          <span className="rb-home-profile-label">{tr('navigation:我的')}</span>
        </button>
        {showsNavi && <button type="button" className="navi-header-entry rb-dock-navi" onClick={openPageNavi} aria-controls="navi-workspace">
          <span>Navi</span>
        </button>}
      </header>
      <div className="alpha-product-main">
        <div className="alpha-product-content" ref={content}>{children}</div>
      </div>
    </div>
  );
}
export function ProductHome({enterPlan = false}: {enterPlan?: boolean} = {}) {
  const [question, setQuestion] = useState('');
  const { data, navigate } = useReview(),
    gpa = examGpa(data);
  return (
    <section className="alpha-home rb-home">
      <StudyPlanView enterPlan={enterPlan} renderToday={today => <div className="rb-home-learning">
        <div><ExamHome {...today} /></div>
        <aside className="rb-home-coach" aria-label="Navi">
          <button className="rb-home-navi-scene" type="button"
            aria-label={tr('study:navi.home.open')} onClick={openPageNavi}>
            <span className="rb-home-navi-grid" aria-hidden="true" />
            <NaviAvatar label={null} size={258} />
          </button>
        <form
        className="navi-home-entry"
        onSubmit={(e) => {
          e.preventDefault();
          composeNavi(question);
          setQuestion('');
        }}
      >
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2500}
          aria-label={tr('study:navi.message')}
          placeholder={tr('study:navi.home.placeholder')}
        />
        <button type="submit" aria-label={tr('study:navi.send')}>
          <ArrowUpRight size={19} />
        </button>
        </form>
        </aside>
      </div>} />
      <section className="rb-home-utility" aria-label={tr('common:主要功能')}>
          <div className="rb-home-links">
            <button type="button" onClick={() => navigate('results')}>
              <GraduationCap size={20} aria-hidden="true" />
              <span>
                {tr('dashboard:examReview.'+(gpa.configured?'academicGpa':'estimatedGpa'))}
                <strong>{gpa.value === null ? tr('common:尚无成绩') : `${gpa.value.toFixed(2)} / ${gpa.config.scale}`}</strong>
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
            <button type="button" onClick={() => navigate('subjects', 'all', 'materials')}>
              <BookOpen size={19} aria-hidden="true" />
              <span>{tr('library:资料与导入')}</span>
              <ArrowRight size={17} aria-hidden="true" />
            </button>
          </div>
      </section>
      {!sprintJobs(data).some(s=>s.status!=='complete') && <MembershipPromo />}
    </section>
  );
}
