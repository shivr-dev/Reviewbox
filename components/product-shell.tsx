'use client';
import {MembershipPromo} from './membership-view';

import { tr } from '@/lib/i18n';
import { useEffect, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronDown,
  GraduationCap,
  Hammer,
  Home,
  Layers3,
  LibraryBig,
  Compass,
  ArrowUpRight,
} from 'lucide-react';
import {
  MAIN_NAV,
  workspaceSection,
  parseWorkspaceRoute,
} from '@/lib/workspace-route';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import { Penguin } from './learning-game';
import HomeView from './home-view';
import { examGpa } from '@/lib/exam-outcomes';
import { equipmentState, equipmentEffects } from '@/lib/equipment';
import { EQUIPMENT_TEMPLATES } from '@/lib/equipment-catalog';
import { learningGame } from '@/lib/learning-game';
import { openPageNavi, composeNavi } from './navi-workspace';

const icons = {
  home: Home,
  plan: BookOpen,
  subjects: LibraryBig,
  results: GraduationCap,
  workshop: Hammer,
};
export default function ProductShell({
  page,
  children,
}: {
  page: string;
  children: ReactNode;
}) {
  const { navigate, subject, section, data } = useReview();
  const [menu, setMenu] = useState(false);
  const active = workspaceSection(page),
    ns = currentNamespace();
  useEffect(() => {
    setMenu(false);
    if (
      active === 'workshop' &&
      ['forge', 'enchant', 'equipment', 'shop', 'redeem'].includes(page)
    )
      try {
        sessionStorage.setItem('review-workshop:' + ns, location.hash);
      } catch {}
    if (active === 'subjects' && page !== 'course')
      try {
        sessionStorage.setItem('review-subjects:' + ns, location.hash);
      } catch {}
  }, [page, subject, section, ns, active]);
  function go(id: string) {
    if (id === 'workshop' || id === 'subjects') {
      try {
        const saved = sessionStorage.getItem(
          'review-' + (id === 'workshop' ? 'workshop' : 'subjects') + ':' + ns,
        );
        if (saved) {
          const r = parseWorkspaceRoute(saved);
          if (workspaceSection(r.page) === id) {
            navigate(r.page, r.subject, r.section);
            return;
          }
        }
      } catch {}
    }
    navigate(id === 'workshop' ? 'forge' : id);
  }
  const label =
    active === 'you'
      ? '我的'
      : (MAIN_NAV.find((n) => n.id === active)?.label ?? 'Reviewbox');
  return (
    <div className={'alpha-product rb-brand-studio alpha-page-' + page}>
      <aside className="alpha-rail" aria-label={tr('common:主要功能')}>
        <button
          className="alpha-logo"
          aria-label={tr('common:Reviewbox 首页')}
          onClick={() => navigate('home')}
        >
          <Layers3 size={24} />
        </button>
        <nav aria-label={tr('common:五个主功能')}>
          {MAIN_NAV.map(({ id, label }) => {
            const Icon = icons[id];
            return (
              <button
                key={id}
                className={
                  'alpha-nav-button ' +
                  (active === id ? 'selected' : '') +
                  (id === 'workshop' ? ' game-group' : '')
                }
                aria-label={tr('navigation:' + label)}
                aria-current={active === id ? 'page' : undefined}
                aria-describedby={'alpha-tip-' + id}
                onClick={() => go(id)}
              >
                <Icon size={22} strokeWidth={1.9} />
                <span
                  className="alpha-navtip"
                  role="tooltip"
                  id={'alpha-tip-' + id}
                >
                  {tr('navigation:' + label)}
                </span>
              </button>
            );
          })}
        </nav>
        <button
          className={'alpha-profile ' + (active === 'you' ? 'selected' : '')}
          aria-label={tr('navigation:我的')}
          aria-current={active === 'you' ? 'page' : undefined}
          onClick={() => navigate('you')}
        >
          <Penguin skin={data.settings.gameSkin} />
          <span className="alpha-navtip" role="tooltip">
            {tr('navigation:我的')}
          </span>
        </button>
      </aside>
      <div className="alpha-product-main">
        <header className="alpha-product-header">
          <button
            className="alpha-mobile-menu"
            onClick={() => setMenu((v) => !v)}
            aria-expanded={menu}
            aria-label={tr('common:打开页面导航')}
          >
            {tr('navigation:' + label)}
            <ChevronDown size={15} />
          </button>
          <span className="alpha-desktop-location">
            {tr('navigation:' + label)}
          </span>
          <span className="product-version">2.0</span>
          <button
            type="button"
            className="navi-header-entry"
            onClick={openPageNavi}
            aria-controls="navi-workspace"
          >
            <Compass size={18} />
            <span>Navi</span>
          </button>
          {menu && (
            <nav
              className="alpha-touch-menu"
              aria-label={tr('common:触摸页面导航')}
            >
              {MAIN_NAV.map((n) => (
                <button key={n.id} onClick={() => go(n.id)}>
                  {tr('navigation:' + n.label)}
                </button>
              ))}
              <button onClick={() => navigate('you')}>
                {tr('common:我的 · 个人中心')}
              </button>
            </nav>
          )}
        </header>
        <div className="alpha-product-content">{children}</div>
      </div>
    </div>
  );
}
export function ProductHome() {
  const [question, setQuestion] = useState('');
  const { data, navigate } = useReview(),
    gpa = examGpa(data),
    gear = equipmentState(data, learningGame(data).accepted),
    item = gear.items.find((i) => i.id === gear.equipped.penblade),
    fx = equipmentEffects(gear);
  return (
    <section className="alpha-home">
      <HomeView direct /><MembershipPromo/>
      <div className="alpha-home-strip">
        <button
          onClick={() => navigate('results')}
          aria-label={tr('common:查看真实考试 GPA')}
        >
          {tr('common:真实 GPA')}{' '}
          <b>
            {gpa.value === null
              ? tr('common:尚无成绩')
              : `${gpa.value.toFixed(2)} / ${gpa.config.scale}`}
          </b>
        </button>
        <span aria-hidden="true">·</span>
        <button onClick={() => navigate('equipment')}>
          {item
            ? tr(
                'workshop:' +
                  (EQUIPMENT_TEMPLATES.find((t) => t.id === item.templateId)
                    ?.name ?? ''),
              )
            : tr('common:未装配装备')}
          {fx.synergies[0]
            ? ' · ' + tr('workshop:' + fx.synergies[0].name)
            : ''}
        </button>
      </div>
      <form
        className="navi-home-entry"
        onSubmit={(e) => {
          e.preventDefault();
          composeNavi(question);
          setQuestion('');
        }}
      >
        <Compass size={21} aria-hidden="true" />
        <input
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={2500}
          aria-label={tr('study:navi.message')}
          placeholder={tr('study:navi.home.placeholder')}
        />
        <button type="submit" aria-label={tr('study:navi.home.open')}>
          <ArrowUpRight size={19} />
        </button>
      </form>
    </section>
  );
}
