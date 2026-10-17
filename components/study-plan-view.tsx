'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Clock3,
  FileText,
  GraduationCap,
  Layers3,
  Settings2,
} from 'lucide-react';
import { useReview } from './review-context';
import { Penguin } from './learning-game';
import {
  studyAgenda,
  inferredSimulation,
  type StudyAction,
} from '@/lib/study-orchestrator';
import {
  beginPlannedSimulation,
  freshStudyAction,
  postponeStudyAction,
} from '@/lib/study-orchestrator-client';
import { currentNamespace, loadData, put } from '@/lib/store';
import { subjectName } from '@/lib/model';
import PressureLab from './pressure-lab';
import ExamResults from './exam-results';
import { FullExamHub } from './exam-hub';
import { reviewStudyMilestone } from '@/lib/study-advice-client';
import { adviceOpportunity } from '@/lib/study-advice';
import { buildRemediation } from '@/lib/remediation';
import { assistantObservations } from '@/lib/study-assistant';
import { reusable } from '@/lib/learning-intelligence';
import { wrongQuestions } from '@/lib/question-tools';
import MathText from './math-text';

export default function StudyPlanView() {
  const { data, navigate, start, refresh, notify, aiReady } = useReview();
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState('agenda'),
    [selected, setSelected] = useState<StudyAction | null>(null),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const gate = useRef(false),
    origin = useRef(currentNamespace());
  const promptedScores = useRef(new Set<string>());
  const now = Math.max(clock, Date.now());
  const agenda = studyAgenda(data, now),
    action = selected ?? agenda.primary,
    info = agenda.insights;
  const dueScore = agenda.actions.find((a) => a.kind === 'score');
  useEffect(() => {
    if (
      ready &&
      mode === 'agenda' &&
      dueScore &&
      !promptedScores.current.has(dueScore.id)
    ) {
      promptedScores.current.add(dueScore.id);
      setSelected(dueScore);
      setMode('scores');
    }
  }, [ready, mode, dueScore?.id]);
  const milestone = adviceOpportunity(data, agenda.actions, now)?.milestone;
  useEffect(() => {
    if (!ready || !aiReady || !milestone) return;
    let alive = true;
    void reviewStudyMilestone(origin.current)
      .then((changed) => {
        if (alive && changed && currentNamespace() === origin.current)
          void refresh();
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [ready, aiReady, milestone]);
  useEffect(() => {
    const id = setTimeout(
      () => {
        setClock(Date.now());
        setReady(true);
      },
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : 450,
    );
    return () => clearTimeout(id);
  }, []);
  useEffect(() => {
    const update = () => {
      if (document.visibilityState === 'visible') {
        setClock(Date.now());
        void refresh();
      }
    };
    const id = setInterval(() => setClock(Date.now()), 60000);
    window.addEventListener('focus', update);
    document.addEventListener('visibilitychange', update);
    return () => {
      clearInterval(id);
      window.removeEventListener('focus', update);
      document.removeEventListener('visibilitychange', update);
    };
  }, [refresh]);
  async function run(fn: () => Promise<void>) {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    try {
      if (currentNamespace() !== origin.current)
        throw new Error('账户已切换，请重新进入学习计划');
      await fn();
    } catch (e) {
      notify(e instanceof Error ? e.message : '学习安排未能打开');
      await refresh();
      setSelected(null);
      setMode('agenda');
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function launch(a: StudyAction) {
    await run(async () => {
      const fresh = await freshStudyAction(a.id, origin.current),
        chosen = fresh.action;
      setSelected(chosen);
      if (chosen.kind === 'score') {
        setMode('scores');
        return;
      }
      if (chosen.kind === 'report') {
        setMode('report');
        return;
      }
      if (chosen.kind === 'pressure') {
        setMode('pressure');
        return;
      }
      if (chosen.kind === 'import-exam') {
        setMode('exam-import');
        return;
      }
      if (chosen.kind === 'simulation') {
        const r = await beginPlannedSimulation(chosen, origin.current);
        await refresh();
        navigate('exam', r.id);
        return;
      }
      if (chosen.kind === 'remedy' && chosen.sourceSessionId) {
        const test = fresh.data.tests.find(
          (t) => t.sessionId === chosen.sourceSessionId,
        );
        if (!test) throw new Error('测试记录已变更，请重新查看计划');
        const job = buildRemediation(
          {
            ...fresh.data,
            events: assistantObservations(fresh.data, Date.now()),
          },
          test.sessionId,
          test.title,
        );
        if (!job.groups.length) throw new Error('当前没有可用的失分题目');
        await put('job', job, job.id, false, origin.current);
        await refresh();
        navigate('remedy', job.id);
        return;
      }
      if (
        chosen.kind === 'resume' ||
        chosen.kind === 'course' ||
        chosen.kind === 'remedy'
      ) {
        navigate(chosen.page!, chosen.target);
        return;
      }
      if (chosen.items?.length) {
        start(
          chosen.items,
          chosen.kind === 'initial' || chosen.kind === 'test'
            ? 'test'
            : 'review',
          chosen.title,
        );
        return;
      }
      if (chosen.kind === 'import') navigate('library');
      else setMode('options');
    });
  }
  async function practiceInstead() {
    await run(async () => {
      await postponeStudyAction(action, 'defer', origin.current);
      await refresh();
      const d = await loadData(origin.current);
      if (currentNamespace() !== origin.current) throw new Error('账户已切换');
      const next = studyAgenda(d);
      setSelected(null);
      if (next.practice.length)
        start(next.practice, 'review', '今日计划 · 继续练习');
      else setMode('options');
    });
  }
  async function revisitErrors() {
    await run(async () => {
      const d = await loadData(origin.current);
      if (currentNamespace() !== origin.current) throw new Error('账户已切换');
      const items = wrongQuestions({
        ...d,
        events: assistantObservations(d, Date.now()),
      })
        .filter((q) => reusable(q))
        .slice(0, 6)
        .map((question) => ({ question, priority: 1, reason: '错题巩固' }));
      if (!items.length) {
        notify('暂时没有可用的错题，可先完成当前学习安排');
        return;
      }
      start(items, 'review', '学习计划 · 错题巩固');
    });
  }
  async function back() {
    setSelected(null);
    setMode('agenda');
    setClock(Date.now());
    await refresh();
  }
  const spec = data.exams.find((e) => e.id === action.examId),
    sim = spec ? inferredSimulation(spec) : undefined;
  const isAssessment = [
    'initial',
    'test',
    'pressure',
    'simulation',
    'import-exam',
  ].includes(action.kind);
  return (
    <main className="study-director">
      <header className="director-header">
        <button className="quiet" onClick={() => navigate('home')}>
          <ArrowLeft size={17} />
          首页
        </button>
        <span>学习计划</span>
        <button
          className="quiet"
          onClick={() => navigate('you')}
          aria-label="管理学习设置"
        >
          <Settings2 size={18} />
        </button>
      </header>
      {!ready ? (
        <div className="director-loading" role="status">
          <Penguin action="thinking" />
          <h1>看看现在适合做什么</h1>
          <p>结合完成情况、复习间隔与考试安排</p>
          <span className="director-loading-dots" aria-hidden="true">
            •••
          </span>
        </div>
      ) : (
        <>
          {mode === 'agenda' && (
            <>
              <section className="director-current" aria-label="当前学习建议">
                <div className="director-companion" aria-hidden="true">
                  <Penguin
                    action={isAssessment ? 'thinking' : 'welcome'}
                    skin={data.settings.gameSkin}
                  />
                </div>
                <span className="now-kicker">
                  {action.kind === 'pressure'
                    ? '考前验证'
                    : action.kind === 'score'
                      ? '考后跟进'
                      : isAssessment
                        ? '下一步，检验一下'
                        : '为你安排的下一步'}
                </span>
                <h1>{action.title}</h1>
                <p>{action.reason}</p>
                {action.minutes > 0 && (
                  <span className="director-duration">
                    <Clock3 size={15} />约 {action.minutes} 分钟
                    {action.subject && action.subject !== 'all'
                      ? ' · ' + subjectName(action.subject)
                      : ''}
                  </span>
                )}
                <div className="director-actions">
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => void launch(action)}
                  >
                    {busy ? '正在打开…' : action.label}
                    <ArrowRight size={18} />
                  </button>
                  {[
                    'initial',
                    'test',
                    'pressure',
                    'simulation',
                    'import-exam',
                    'score',
                    'report',
                    'course',
                    'remedy',
                  ].includes(action.kind) && (
                    <button
                      className="quiet"
                      disabled={busy}
                      onClick={() => void practiceInstead()}
                    >
                      {agenda.practice.length
                        ? '先继续练习'
                        : '暂不参加，查看其他安排'}
                    </button>
                  )}
                </div>
                {agenda.advisor && (
                  <details className="director-ai-note">
                    <summary>关键节点的计划复核</summary>
                    <p>{agenda.advisor.explanation}</p>
                    <p>{agenda.advisor.method}</p>
                    <small>
                      仅关键节点调用 Qwen，最多每日 1 次、滚动七天 2
                      次；日常安排在本地计算。
                    </small>
                  </details>
                )}
              </section>
              <details className="director-details">
                <summary>接下来的安排</summary>
                <ol>
                  {agenda.actions.slice(1, 5).map((a) => (
                    <li key={a.id}>
                      <span>{a.title}</span>
                      <small>
                        {a.minutes > 0
                          ? '约 ' + a.minutes + ' 分钟'
                          : '按需安排'}
                      </small>
                    </li>
                  ))}
                </ol>
                <p>
                  每完成一段都会重新安排。今天已记录约{' '}
                  {Math.round(agenda.plan.completedSeconds / 60)} 分钟，预算{' '}
                  {agenda.plan.settings.dailyMinutes} 分钟。
                </p>
              </details>
              <details className="director-details">
                <summary>全部学习方式与报告</summary>
                <div className="director-options">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void revisitErrors()}
                  >
                    <BookOpen />
                    错题巩固
                  </button>
                  <button
                    className="secondary"
                    onClick={() => setMode('notes')}
                  >
                    <FileText />
                    笔记与资料
                  </button>
                  <button className="secondary" onClick={() => navigate('you')}>
                    <CalendarDays />
                    考试与时间管理
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate('study')}
                  >
                    <BookOpen />
                    自主练习
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate('subjects')}
                  >
                    <Layers3 />
                    学科与互动课程
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('exam-import');
                    }}
                  >
                    <GraduationCap />
                    CE 模拟与试卷导入
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('report');
                    }}
                  >
                    <FileText />
                    GPA 与学习回顾
                  </button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('scores');
                    }}
                  >
                    <CalendarDays />
                    录入现实考试成绩
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate('library')}
                  >
                    <Layers3 />
                    导入学习内容
                  </button>
                </div>
              </details>
            </>
          )}
          {mode === 'pressure' && (
            <PressureLab
              key={action.id}
              subject={action.subject === 'all' ? undefined : action.subject}
              autoStart
              plannedScope={action.scope}
              plannedQuestions={action.items?.map((i) => i.question)}
              onExit={() => void back()}
            />
          )}
          {mode === 'scores' && (
            <section className="director-subpage">
              <h1>考后成绩记录</h1>
              <p>成绩保存后，下一步会结合考试差距与真实作答重新安排。</p>
              <ExamResults
                autoOpen
                initialExamId={action.examId}
                onClosed={() => void back()}
              />
              <button className="quiet" onClick={() => void back()}>
                返回学习计划
              </button>
            </section>
          )}
          {mode === 'exam-import' && (
            <section className="director-subpage">
              <button className="quiet" onClick={() => void back()}>
                <ArrowLeft size={16} />
                返回学习计划
              </button>
              <FullExamHub
                key={action.examKind ?? 'all'}
                initialExam={action.examKind}
                initialMapSection={sim?.mapSection}
                initialGrade={sim?.grade}
              />
              <button className="quiet" onClick={() => navigate('you')}>
                管理考试日期与每日时间
              </button>
            </section>
          )}
          {mode === 'report' && (
            <section className="director-subpage director-report">
              <span className="now-kicker">学习回顾</span>
              <h1>
                {action.id.startsWith('checkpoint:')
                  ? '这一阶段学得怎样'
                  : '看看最近的变化'}
              </h1>
              {action.id.startsWith('checkpoint:') && (
                <div className="director-checkpoint">
                  <p>
                    已完成 {agenda.checkpoint.blocks.length} 段练习 ·{' '}
                    {agenda.checkpoint.events.length} 次作答
                  </p>
                  {agenda.checkpoint.weak.length ? (
                    <>
                      <h2>接下来先巩固这些能力</h2>
                      {agenda.checkpoint.weak.map((w) => (
                        <p key={w.key}>
                          {w.title} · 最近有 {w.count} 次需再巩固
                        </p>
                      ))}
                    </>
                  ) : (
                    <p>
                      暂未发现集中反复出错的能力，接下来通过间隔验证检查保留情况。
                    </p>
                  )}
                </div>
              )}
              <p>
                {info.days} 个学习日 · {info.weekCount} 次有效作答
              </p>
              <div className="director-report-values">
                <article>
                  <span>近七天作答表现</span>
                  <strong>
                    {info.accuracy === null
                      ? '积累中'
                      : Math.round(info.accuracy * 100) + '%'}
                  </strong>
                  <small>
                    {info.change === null
                      ? '记录足够后再比较趋势'
                      : `较此前七天${info.change >= 0 ? '提升' : '下降'} ${Math.abs(info.change * 100).toFixed(0)} 个百分点`}
                  </small>
                </article>
                <article>
                  <span>真实考试 GPA</span>
                  <strong>
                    {info.gpa.value === null
                      ? '待录入成绩'
                      : info.gpa.value.toFixed(2) +
                        ' / ' +
                        info.gpa.config.scale}
                  </strong>
                  <small>
                    {info.gpa.rows.length} 场考试 · 使用你的换算公式
                  </small>
                </article>
                <article>
                  <span>每周学习 GPA</span>
                  <strong>
                    {info.weekly.value === null
                      ? '证据积累中'
                      : info.weekly.value.toFixed(2) + ' / 4.00'}
                  </strong>
                  <small>
                    {info.weekly.period.startDate} —{' '}
                    {info.weekly.period.endDate}
                  </small>
                </article>
              </div>
              <h2>下一步的学习方法</h2>
              <p>{info.method}</p>
              {agenda.actions.find((a) => a.kind !== 'report') && (
                <>
                  <h2>接下来的安排</h2>
                  <p>
                    {agenda.actions.find((a) => a.kind !== 'report')!.title}
                  </p>
                  <p>
                    {agenda.actions.find((a) => a.kind !== 'report')!.reason}
                  </p>
                </>
              )}
              <details>
                <summary>为什么这样建议</summary>
                <p>{info.weekly.reason}</p>
                <p>
                  根据实际作答与间隔保留表现调整，不把同日答对或 XP
                  当作长期掌握。
                </p>
                <a
                  href={info.methodSources[0]}
                  target="_blank"
                  rel="noreferrer"
                >
                  检索练习研究
                </a>{' '}
                ·{' '}
                <a
                  href={info.methodSources[1]}
                  target="_blank"
                  rel="noreferrer"
                >
                  个体复习排程研究
                </a>
              </details>
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    if (action.kind === 'report')
                      await postponeStudyAction(action, 'seen', origin.current);
                    await back();
                  })
                }
              >
                继续下一步
                <ArrowRight size={18} />
              </button>
            </section>
          )}
          {mode === 'notes' && (
            <section className="director-subpage">
              <button className="quiet" onClick={() => void back()}>
                <ArrowLeft size={16} />
                返回学习计划
              </button>
              <h1>笔记与学习资料</h1>
              <p>复习前回看自己的记录，或进入学科补充笔记。</p>
              {!data.notes.length && !data.materials.length && (
                <p>还没有记录。可在学科中记笔记，或导入教材与资料。</p>
              )}
              {data.notes.map((n) => (
                <details className="director-note" key={n.id}>
                  <summary>
                    {data.nodes.find((x) => x.id === n.nodeId)?.title ??
                      '学习笔记'}
                  </summary>
                  <MathText>{n.body}</MathText>
                </details>
              ))}
              {data.materials.map((m) => (
                <details className="director-note" key={m.id}>
                  <summary>
                    {m.name} · {subjectName(m.subject)}
                  </summary>
                  <MathText>{m.text}</MathText>
                </details>
              ))}
              <div className="director-options">
                <button
                  className="secondary"
                  onClick={() => navigate('subjects')}
                >
                  进入学科笔记
                </button>
                <button
                  className="secondary"
                  onClick={() => navigate('library')}
                >
                  管理资料与导入
                </button>
              </div>
            </section>
          )}
          {mode === 'options' && (
            <section className="director-subpage">
              <h1>按自己的节奏继续</h1>
              <p>这次建议已暂缓，不会连续要求你参加同一场测试。</p>
              <button className="primary" onClick={() => void back()}>
                重新查看安排
                <ArrowRight size={18} />
              </button>
              <div className="director-options">
                <button className="secondary" onClick={() => navigate('study')}>
                  自主练习
                </button>
                <button
                  className="secondary"
                  onClick={() => navigate('subjects')}
                >
                  学习课程
                </button>
                <button
                  className="secondary"
                  onClick={() => setMode('exam-import')}
                >
                  CE 模拟与导入
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
