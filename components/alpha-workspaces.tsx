'use client';
import { useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { useReview } from './review-context';
import SubjectsView from './subjects-view';
import LibraryView from './library-view';
import CourseHub from './course-hub';
import AnalyticsView from './analytics-view';
import ExamResults from './exam-results';
import { FullExamHub } from './exam-hub';
import { SUBJECTS, subjectName, uid, type Subject } from '@/lib/model';
import { examGpa } from '@/lib/exam-outcomes';
import { weeklyLearningGpa } from '@/lib/study-assistant';
import { currentNamespace, put } from '@/lib/store';
import { EQUIPMENT_SUPPLIES } from '@/lib/equipment-catalog';
import { learningGame } from '@/lib/learning-game';
import { buyGameItem } from '@/lib/game-client';
import { GameProfile } from './learning-game';
import { AdventureShop } from './adventure-panels';
import { MaterialArt } from './equipment-art';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';

export function AlphaSubjects({
  initialView = 'subjects',
}: { initialView?: string } = {}) {
  const { subject, section, navigate } = useReview();
  const view = section || initialView,
    selected = SUBJECTS.some((s) => s.id === subject) ? subject : 'all';
  return (
    <section className="alpha-workspace">
      {view === 'courses' && (
        <div className="alpha-workspace-heading">
          <h1>课程</h1>
          <p>按学科创建课程，或继续已有课程。</p>
        </div>
      )}
      <nav className="alpha-secondary" aria-label="学科与资料功能">
        {[
          ['subjects', '学科'],
          ['courses', '课程'],
          ['materials', '资料与导入'],
          ['questions', '题库管理'],
        ].map(([id, label]) => (
          <button
            key={id}
            aria-current={view === id ? 'page' : undefined}
            onClick={() => navigate('subjects', selected, id)}
          >
            {label}
          </button>
        ))}
      </nav>
      {view === 'subjects' ? (
        <SubjectsView key={selected} />
      ) : view === 'courses' ? (
        <>
          <label className="alpha-subject-select">
            课程所属学科
            <select
              aria-label="课程所属学科"
              value={selected}
              onChange={(e) => navigate('subjects', e.target.value, 'courses')}
            >
              <option value="all">请选择一门学科</option>
              {SUBJECTS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
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
                  {s.name}
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
          initialTab={view === 'questions' ? 'questions' : 'materials'}
        />
      )}
    </section>
  );
}
export function AlphaResults({
  initialView = 'scores',
}: { initialView?: string } = {}) {
  const { data, section, navigate } = useReview();
  const view = section || initialView,
    real = examGpa(data),
    weekly = weeklyLearningGpa(data);
  return (
    <section className="alpha-workspace">
      <div className="alpha-workspace-heading">
        <h1>成绩与考试</h1>
        <p>真实成绩、学习表现与考试准备，清楚分开。</p>
      </div>
      <nav className="alpha-secondary" aria-label="成绩与考试功能">
        {[
          ['scores', '成绩与 GPA'],
          ['schedule', '考试安排'],
          ['simulations', '模拟考试'],
          ['analysis', '学习分析'],
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
              <span>真实考试 GPA</span>
              <strong>
                {real.value === null ? '—' : real.value.toFixed(2)}{' '}
                <small>/ {real.config.scale}</small>
              </strong>
              <p>
                {real.rows.length
                  ? `基于 ${real.rows.length} 场已录入真实考试`
                  : '还没有真实成绩；考试结束后录入。'}
              </p>
              <ExamResults />
            </div>
            <div>
              <span>每周学习 GPA · 非官方成绩</span>
              <strong>
                {weekly.value === null ? '—' : weekly.value.toFixed(2)}{' '}
                <small>/ 4</small>
              </strong>
              <p>
                {weekly.value === null
                  ? '跨日验证证据还不足，暂不估分。'
                  : '来自跨日学习与验证，不计入真实 GPA。'}
              </p>
              <small>知识掌握情况单独见「学习分析」。</small>
            </div>
          </div>
          {real.rows.length > 0 && (
            <div className="alpha-table-scroll">
              <table className="alpha-results-table">
                <caption>真实成绩历史</caption>
                <thead>
                  <tr>
                    <th>考试 / 学科</th>
                    <th>日期</th>
                    <th>真实分数</th>
                    <th>GPA 点数</th>
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
export function AlphaShop() {
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
      notify('材料已加入工坊库存');
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
        <h1>企鹅补给站</h1>
        <p>用认真学习获得的点数，补给下一段冒险。当前 {game.coins} 点数。</p>
      </div>
      <div className="alpha-shop-links">
        <button className="secondary" onClick={() => navigate('redeem')}>
          兑换码
        </button>
        <button className="secondary" onClick={() => navigate('super')}>
          SuperReview
        </button>
      </div>
      <nav className="alpha-secondary" aria-label="商店分类">
        {[
          ['materials', '锻造材料'],
          ['partner', '伙伴与补给'],
          ['legacy', '道具与旧藏品'],
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
                {busy === p.id ? '正在补给…' : `${p.cost} 点数购买`}
              </button>
            </article>
          ))}
        </div>
      ) : tab === 'partner' ? (
        <GameProfile shopOnly />
      ) : (
        <>
          <AdventureShop />
          <details className="alpha-legacy">
            <summary>已保存的家园</summary>
            <p>家园已退出主线；已有家具和布置继续保留。</p>
            <button className="secondary" onClick={() => navigate('habitat')}>
              查看旧版家园
            </button>
          </details>
        </>
      )}
    </>
  );
}

export function ExamSchedule() {
  const { data, refresh, notify } = useReview();
  const [open, setOpen] = useState(false),
    [subject, setSubject] = useState<Subject>('math'),
    [scope, setScope] = useState<string[]>([]),
    [busy, setBusy] = useState(false);
  const gate = useRef(false),
    origin = useRef(currentNamespace());
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    const f = new FormData(e.currentTarget);
    try {
      if (currentNamespace() !== origin.current)
        throw new Error('账户已切换，请重新打开');
      const date = String(f.get('date'));
      if (Date.parse(date + 'T23:59:59') < Date.now())
        throw new Error('考试日期不能早于今天');
      const sim = String(f.get('simulation') || 'auto');
      await put(
        'exam',
        {
          id: uid(),
          title: String(f.get('title')),
          subject,
          date,
          scope,
          target: Number(f.get('target')),
          dailyMinutes: Number(f.get('minutes')),
          simulation:
            subject === 'ce' && sim !== 'auto'
              ? {
                  exam: sim.split(':')[0],
                  mapSection: sim.startsWith('MAP:')
                    ? sim.split(':')[1]
                    : undefined,
                  grade: Number(f.get('grade') || 8),
                }
              : undefined,
        },
        undefined,
        false,
        origin.current,
      );
      await refresh();
      setOpen(false);
      notify('考试已加入学习计划');
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存未完成');
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="alpha-exam-schedule">
      <div className="section-head">
        <h2>真实考试与目标</h2>
        <button
          className="primary"
          onClick={() => {
            origin.current = currentNamespace();
            setScope([]);
            setOpen(true);
          }}
        >
          <Plus size={17} /> 添加考试
        </button>
      </div>
      <ExamResults />
      {data.exams.length ? (
        data.exams
          .slice()
          .sort((a, b) => a.date.localeCompare(b.date))
          .map((e) => (
            <article className="alpha-exam-row" key={e.id}>
              <div>
                <h3>{e.title}</h3>
                <p>
                  {subjectName(e.subject)} · {e.date} · 目标 {e.target}%
                </p>
                <small>
                  {e.scope.length ? `${e.scope.length} 个知识点` : '全学科范围'}{' '}
                  · 每日建议 {e.dailyMinutes} 分钟
                </small>
              </div>
              <span>
                {e.result
                  ? `${e.result.score} / ${e.result.maxScore}`
                  : '尚未录入成绩'}
              </span>
              <button
                className="quiet"
                onClick={() => void put('exam', e, e.id, true).then(refresh)}
              >
                移出安排
              </button>
            </article>
          ))
      ) : (
        <p className="alpha-empty">
          添加考试日期、范围与目标，Study Director 会据此安排。
        </p>
      )}
      <Dialog
        open={open}
        onOpenChange={(v) => {
          if (!busy) setOpen(v);
        }}
      >
        <DialogContent className="editor-dialog">
          <DialogTitle>添加考试</DialogTitle>
          <DialogDescription>范围和目标会反馈给学习计划。</DialogDescription>
          <form onSubmit={save}>
            <label>
              考试名称
              <input name="title" required maxLength={100} />
            </label>
            <div className="form-grid">
              <label>
                学科
                <select
                  value={subject}
                  onChange={(e) => {
                    setSubject(e.target.value as Subject);
                    setScope([]);
                  }}
                >
                  {SUBJECTS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                考试日期
                <input type="date" name="date" required />
              </label>
              <label>
                目标得分率（%）
                <input
                  name="target"
                  type="number"
                  min={1}
                  max={100}
                  defaultValue={85}
                  required
                />
              </label>
              <label>
                每日建议时间
                <input
                  name="minutes"
                  type="number"
                  min={5}
                  max={180}
                  defaultValue={20}
                  required
                />
              </label>
            </div>
            {subject === 'ce' && (
              <div className="form-grid">
                <label>
                  配套模拟考试
                  <select name="simulation">
                    <option value="auto">根据考试名称识别</option>
                    {[
                      'SAT',
                      'ACT',
                      'TOEFL',
                      'MAP:Reading',
                      'MAP:Language Usage',
                      'DET',
                    ].map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  MAP 年级
                  <input
                    type="number"
                    name="grade"
                    min={2}
                    max={12}
                    defaultValue={8}
                  />
                </label>
              </div>
            )}
            <fieldset className="scope-list">
              <legend>考试范围（不选为全学科）</legend>
              {data.nodes
                .filter((n) => n.subject === subject)
                .map((n) => (
                  <label key={n.id}>
                    <input
                      type="checkbox"
                      checked={scope.includes(n.id)}
                      onChange={(e) =>
                        setScope((x) =>
                          e.target.checked
                            ? [...x, n.id]
                            : x.filter((id) => id !== n.id),
                        )
                      }
                    />
                    {n.title}
                  </label>
                ))}
            </fieldset>
            <button className="primary" type="submit" disabled={busy}>
              {busy ? '正在保存…' : '保存考试安排'}
            </button>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
