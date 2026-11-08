'use client';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import { lazy,Suspense,useRef, useState } from 'react';
import { useReview } from './review-context';
import SubjectsView from './subjects-view';
import LibraryView from './library-view';
import CourseHub from './course-hub';
import AnalyticsView from './analytics-view';
import ExamResults from './exam-results';
import { FullExamHub } from './exam-hub';
import {SUBJECTS,type Subject} from '@/lib/model';
import { examGpa } from '@/lib/exam-outcomes';
import { weeklyLearningGpa } from '@/lib/study-assistant';
import { currentNamespace } from '@/lib/store';
import { EQUIPMENT_SUPPLIES } from '@/lib/equipment-catalog';
import { learningGame } from '@/lib/learning-game';
import { buyGameItem } from '@/lib/game-client';
import { GameProfile } from './learning-game';
import { AdventureShop } from './adventure-panels';
import { MaterialArt } from './equipment-art';
import ExamSchedule from './exam-schedule';
export { default as ExamSchedule } from './exam-schedule';
const LearningPackStudio=lazy(()=>import('./learning-pack-studio'));
const ExamPublishingStudio=lazy(()=>import('./exam-publishing-studio'));
const KnowledgeMap=lazy(()=>import('./knowledge-map'));

export function ProductSubjects({
  initialView = 'subjects',
}: { initialView?: string } = {}) {
  const { subject, section, navigate } = useReview();
  const view = section || initialView,
    selected = SUBJECTS.some((s) => s.id === subject) ? subject : 'all';
  if(view==='studio')return <Suspense fallback={<p role="status">制作台加载中…</p>}><LearningPackStudio key={selected}/></Suspense>;
  if(view==='publish')return <Suspense fallback={<p role="status">排版工作台加载中…</p>}><ExamPublishingStudio key={selected}/></Suspense>;
  return (
    <section className="alpha-workspace">
      {view === 'courses' && (
        <div className="alpha-workspace-heading">
          <h1>{tr("library:课程")}</h1>
          <p>{tr("common:按学科创建课程，或继续已有课程。")}</p>
        </div>
      )}
      <nav className="alpha-secondary" aria-label={tr("common:学科与资料功能")}>
        {[
          ['subjects', tr("common:学科")],
          ['courses', tr("common:课程")],
          ['materials', tr("common:资料与导入")],
          ['questions', tr("common:题库管理")],
          ['map',tr("common:知识地图")],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => navigate('subjects', selected, id)}
          >
            {tr('library:'+label)}
          </button>
        ))}
      </nav>
      {view==='map'?<Suspense fallback={<p role="status">{tr("common:地图加载中…")}</p>}><KnowledgeMap/></Suspense>:view === 'subjects' ? (
        <SubjectsView key={selected} />
      ) : view === 'courses' ? (
        <>
          <label className="alpha-subject-select">{tr("common:课程所属学科")}<select
              aria-label={tr("common:课程所属学科")}
              value={selected}
              onChange={(e) => navigate('subjects', e.target.value, 'courses')}
            >
              <option value="all">{tr("common:请选择一门学科")}</option>
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {tr('subjects:'+s.name)}
                </option>
              ))}
            </select>
          </label>
          {selected === 'all' ? (
            <div className="alpha-subject-grid">
              {SUBJECTS.map((s) => (
                <button
                  className="secondary"
                  key={s.id}
                  onClick={() => navigate('subjects', s.id, 'courses')}
                >
                  {tr('subjects:'+s.name)}
                </button>
              ))}
            </div>
          ) : (
            <CourseHub key={selected} subject={selected as Subject} />
          )}
        </>
      ) : (
        <LibraryView
          key={selected + view}
          initialTab={view === 'questions' ? 'questions' : ['packs','discover'].includes(view)?'content':'materials'}
        />
      )}
    </section>
  );
}
export function ProductResults({
  initialView = 'scores',
}: { initialView?: string } = {}) {
  const { data, section, navigate } = useReview();
  const view = section || initialView,
    real = examGpa(data),
    weekly = weeklyLearningGpa(data);
  return (
    <section className="alpha-workspace">
      <div className="alpha-workspace-heading">
        <h1>{tr("common:成绩与考试")}</h1>
        <p>{tr("common:真实成绩、学习表现与考试准备，清楚分开。")}</p>
      </div>
      <nav className="alpha-secondary" aria-label={tr("common:成绩与考试功能")}>
        {[
          ['scores', tr("common:成绩与 GPA")],
          ['schedule', tr("common:考试安排")],
          ['simulations', tr("common:模拟考试")],
          ['analysis', tr("common:学习分析")],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => navigate('results', 'all', id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'scores' ? (
        <>
          <div className="alpha-gpa-summary">
            <div>
              <span>{tr("common:真实考试 GPA")}</span>
              <strong>
                {real.value === null ? '—' : real.value.toFixed(2)}{' '}
                <small>/ {real.config.scale}</small>
              </strong>
              <p>
                {real.rows.length
                  ? tr("common:基于 {{v0}} 场已录入真实考试",{v0:(real.rows.length)})
                  : tr("common:还没有真实成绩；考试结束后录入。")}
              </p>
              <ExamResults />
            </div>
            <div>
              <span>{tr("common:每周学习 GPA · 非官方成绩")}</span>
              <strong>
                {weekly.value === null ? '—' : weekly.value.toFixed(2)}{' '}
                <small>/ 4</small>
              </strong>
              <p>
                {weekly.value === null
                  ? tr("common:跨日验证证据还不足，暂不估分。")
                  : tr("common:来自跨日学习与验证，不计入真实 GPA。")}
              </p>
              <small>{tr("common:知识掌握情况单独见「学习分析」。")}</small>
            </div>
          </div>
          {real.rows.length > 0 && (
            <div className="alpha-table-scroll">
              <table className="alpha-results-table">
                <caption>{tr("common:真实成绩历史")}</caption>
                <thead>
                  <tr>
                    <th>{tr("common:考试 / 学科")}</th>
                    <th>{tr("common:日期")}</th>
                    <th>{tr("common:真实分数")}</th>
                    <th>{tr("common:GPA 点数")}</th>
                  </tr>
                </thead>
                <tbody>
                  {real.rows.map((r) => (
                    <tr key={r.exam.id}>
                      <td>
                        {r.exam.title}
                        <small>{subjectName(r.exam.subject)}</small>
                      </td>
                      <td>{r.exam.date}</td>
                      <td>
                        {r.exam.result!.score} / {r.exam.result!.maxScore}
                      </td>
                      <td>{r.point.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : view === 'schedule' ? (
        <ExamSchedule />
      ) : view === 'simulations' ? (
        <FullExamHub />
      ) : (
        <AnalyticsView />
      )}
    </section>
  );
}
export function ProductShop() {
  const { data, navigate, refresh, notify } = useReview(),
    game = learningGame(data);
  const [busy, setBusy] = useState(''),
    [tab, setTab] = useState('materials');
  const lock = useRef(false);
  async function buy(id: string) {
    if (lock.current) return;
    lock.current = true;
    setBusy(id);
    const ns = currentNamespace();
    try {
      await buyGameItem(id, ns);
      if (currentNamespace() !== ns) return;
      await refresh();
      notify(tr("common:材料已加入工坊库存"));
    } catch (e) {
      notify(e instanceof Error ? e.message : '购买未完成');
    } finally {
      lock.current = false;
      setBusy('');
    }
  }
  return (
    <>
      <div className="alpha-workspace-heading">
        <h1>{tr("common:企鹅补给站")}</h1>
        <p>{tr("common:用认真学习获得的点数，补给下一段冒险。当前")}{game.coins}{tr("common:点数。")}</p>
      </div>
      <div className="alpha-shop-links">
        <button className="secondary" onClick={() => navigate('redeem')}>{tr("common:兑换码")}</button>
        <button className="secondary" onClick={() => navigate('super')}>
          SuperReview
        </button>
      </div>
      <nav className="alpha-secondary" aria-label={tr("common:商店分类")}>
        {[
          ['materials', tr("common:锻造材料")],
          ['partner', tr("common:伙伴与补给")],
          ['legacy', tr("common:道具与旧藏品")],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={tab === id ? 'page' : undefined}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'materials' ? (
        <div className="alpha-supplies">
          {EQUIPMENT_SUPPLIES.map((p, i) => (
            <article key={p.id}>
              <MaterialArt kind={['ore', 'ink', 'thread'][i]} />
              <h2>{p.name}</h2>
              <p>{p.description}</p>
              <button
                className="primary"
                disabled={!!busy || game.coins < p.cost}
                onClick={() => void buy(p.id)}
              >
                {busy === p.id ? tr("common:正在补给…") : tr("common:{{v0}} 点数购买",{v0:(p.cost)})}
              </button>
            </article>
          ))}
        </div>
      ) : tab === 'partner' ? (
        <GameProfile shopOnly />
      ) : (
        <>
          <AdventureShop />
        </>
      )}
    </>
  );
}
