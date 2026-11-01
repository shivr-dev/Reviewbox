'use client';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import {presentAction,presentAgenda} from '@/lib/presentation';
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
import { prepareCourseLearningSession } from '@/lib/course-lifecycle';
import {
  persistDecisionTrace,
  recordRecommendationOutcome,
  changeStudyPolicy,
} from '@/lib/study-trace-client';
import { POLICY_REGISTRY, policyFor } from '@/lib/policy-config';
import { TeachingReview } from './teaching-review';
import AutoPracticeStart from './auto-practice-start';

export default function StudyPlanView() {
  const { data, navigate, start, refresh, notify, aiReady, section } =
    useReview();
  const launchIntent = section?.startsWith('launch:') ? section.slice(7) : '';
  const intentStarted = useRef('');
  const [ready, setReady] = useState(false),
    [mode, setMode] = useState('agenda'),
    [selected, setSelected] = useState<StudyAction | null>(null),
    [busy, setBusy] = useState(false),
    [clock, setClock] = useState(Date.now());
  const gate = useRef(false),
    origin = useRef(currentNamespace());
  const promptedScores = useRef(new Set<string>());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (ready && launchIntent && intentStarted.current !== launchIntent) {
      intentStarted.current = launchIntent;
      // Consume the one-shot home intent so browser Back/refresh cannot launch it again.
      if (window.location.hash.includes('launch'))
        window.history.replaceState(
          { ...window.history.state, reviewRoute: '#plan' },
          '',
          '#plan',
        );
      void launch({ id: launchIntent } as StudyAction);
    }
  }, [ready, launchIntent]);
  const now = Math.max(clock, Date.now());
  const agenda = presentAgenda(studyAgenda(data, now)),
    action = presentAction(selected ?? agenda.primary),
    info = agenda.insights;
  const dueScore = agenda.primary.kind === 'score' ? agenda.primary : undefined;
  useEffect(() => {
    if (ready)
      void persistDecisionTrace(agenda.decisionTrace, origin.current).catch(
        () => {},
      );
  }, [ready, agenda.decisionTrace.id]);
  useEffect(() => {
    if (
      ready &&
      mode === 'agenda' &&
      data.settings.studyMode !== 'manual' &&
      dueScore &&
      !promptedScores.current.has(dueScore.id)
    ) {
      promptedScores.current.add(dueScore.id);
      setSelected(dueScore);
      setMode('scores');
    }
  }, [ready, mode, dueScore?.id, data.settings.studyMode]);
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
      if (!mounted.current) return;
      notify(e instanceof Error ? e.message : '学习安排未能打开');
      await refresh();
      setSelected(null);
      setMode('agenda');
    } finally {
      gate.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function launch(a: StudyAction) {
    await run(async () => {
      const fresh = await freshStudyAction(a.id, origin.current),
        chosen = fresh.action;
      await recordRecommendationOutcome(
        fresh.agenda.decisionTrace,
        chosen.id,
        'selected',
        undefined,
        origin.current,
      );
      if (!mounted.current) return;
      setSelected(chosen);
      if (chosen.kind === 'teach') {
        setMode('teach');
        return;
      }
      if (chosen.courseId) {
        const result = await prepareCourseLearningSession(
          chosen.courseId,
          chosen.coursePhase,
          origin.current,
        );
        if (result.missingQuestions)
          throw new Error('这门课程暂缺可用巩固题，请先导入课程练习');
        if (result.session)
          await recordRecommendationOutcome(
            fresh.agenda.decisionTrace,
            chosen.id,
            'started',
            result.session.id,
            origin.current,
          );
        await refresh();
        navigate('study');
        return;
      }
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
        await recordRecommendationOutcome(
          fresh.agenda.decisionTrace,
          chosen.id,
          'started',
          r.id,
          origin.current,
        );
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
          { trace: fresh.agenda.decisionTrace, actionId: chosen.id },
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
      await recordRecommendationOutcome(
        agenda.decisionTrace,
        action.id,
        'deferred',
        undefined,
        origin.current,
      );
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
        notify(tr("planner:暂时没有可用的错题，可先完成当前学习安排"));
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
          <ArrowLeft size={17} />{tr("planner:首页")}</button>
        <span>{tr("planner:学习计划")}</span>
        <button
          className="quiet"
          onClick={() => navigate('you')}
          aria-label={tr("planner:管理学习设置")}
        >
          <Settings2 size={18} />
        </button>
      </header>
      <AutoPracticeStart
        ready={ready}
        pageMode={mode}
        action={agenda.primary}
        launchIntent={launchIntent}
        blocked={busy}
        onStart={() => void launch(agenda.primary)}
      />
      {!ready ? (
        <div className="director-loading" role="status">
          <Penguin action="thinking" />
          <h1>{tr("planner:看看现在适合做什么")}</h1>
          <p>{tr("planner:结合完成情况、复习间隔与考试安排")}</p>
          <span className="director-loading-dots" aria-hidden="true">
            •••
          </span>
        </div>
      ) : (
        <>
          {mode === 'teach' && (
            <TeachingReview action={action} onClose={() => void back()} />
          )}
          {mode === 'agenda' && (
            <>
              <section className="director-current" aria-label={tr("planner:当前学习建议")}>
                <div className="director-companion" aria-hidden="true">
                  <Penguin
                    action={isAssessment ? 'thinking' : 'welcome'}
                    skin={data.settings.gameSkin}
                  />
                </div>
                <span className="now-kicker">
                  {action.kind === 'pressure'
                    ? tr("planner:考前验证")
                    : action.kind === 'score'
                      ? tr("common:考后跟进")
                      : isAssessment
                        ? tr("common:下一步，检验一下")
                        : tr("common:为你安排的下一步")}
                </span>
                <h1>{action.title}</h1>
                <p>{action.reason}</p>
                {action.minutes > 0 && (
                  <span className="director-duration">
                    <Clock3 size={15} />{tr("planner:约")}{action.minutes}{tr("planner:分钟")}{action.subject && action.subject !== 'all'
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
                    {busy ? tr("planner:正在打开…") : action.label}
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
                        ? tr("planner:先继续练习")
                        : tr("planner:暂不参加，查看其他安排")}
                    </button>
                  )}
                </div>
                {agenda.advisor && (
                  <details className="director-ai-note">
                    <summary>{tr("planner:关键节点的计划复核")}</summary>
                    <p>{agenda.advisor.explanation}</p>
                    <p>{agenda.advisor.method}</p>
                    <p>
                      {agenda.advisor.verification.supported
                        ? tr("planner:已有独立证据支持这项假设，仅纳入策略参考。")
                        : tr("planner:本地证据尚不足，不据此改变安排。")}
                      {agenda.advisor.verification.explanation}
                    </p>
                    <small>{tr("planner:仅关键节点调用 Qwen，最多每日 1 次、滚动七天 2 次；日常安排在本地计算。")}</small>
                  </details>
                )}
              </section>
              <details className="director-details">
                <summary>{tr("planner:接下来的安排")}</summary>
                <ol>
                  {agenda.actions.slice(1, 5).map((a) => (
                    <li key={a.id}>
                      <span>{a.title}</span>
                      <button
                        className="quiet"
                        disabled={busy}
                        onClick={() => void launch(a)}
                      >
                        {a.label}
                      </button>
                      <small>
                        {a.minutes > 0
                          ? '约 ' + a.minutes + ' 分钟'
                          : tr("planner:按需安排")}
                      </small>
                    </li>
                  ))}
                </ol>
                <p>{tr("planner:每完成一段都会重新安排。今天已记录约")}{' '}
                  {Math.round(agenda.plan.completedSeconds / 60)}{tr("planner:分钟，预算")}{' '}
                  {agenda.plan.settings.dailyMinutes}{tr("planner:分钟。")}</p>
              </details>
              <details className="director-details">
                <summary>{tr("planner:全部学习方式与报告")}</summary>
                <div className="director-options">
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={() => void revisitErrors()}
                  >
                    <BookOpen />{tr("planner:错题巩固")}</button>
                  <button
                    className="secondary"
                    onClick={() => setMode('notes')}
                  >
                    <FileText />{tr("planner:笔记与资料")}</button>
                  <button className="secondary" onClick={() => navigate('results','all','schedule')}>
                    <CalendarDays />{tr("planner:考试安排")}</button>
                  <button
                    className="secondary"
                    onClick={() => navigate('study')}
                  >
                    <BookOpen />{tr("planner:自主练习")}</button>
                  <button
                    className="secondary"
                    onClick={() => navigate('subjects')}
                  >
                    <Layers3 />{tr("planner:学科与互动课程")}</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('exam-import');
                    }}
                  >
                    <GraduationCap />{tr("planner:CE 模拟与试卷导入")}</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('report');
                    }}
                  >
                    <FileText />{tr("planner:GPA 与学习回顾")}</button>
                  <button
                    className="secondary"
                    onClick={() => {
                      setSelected(null);
                      setMode('scores');
                    }}
                  >
                    <CalendarDays />{tr("planner:录入现实考试成绩")}</button>
                  <button
                    className="secondary"
                    onClick={() => navigate('library')}
                  >
                    <Layers3 />{tr("planner:导入学习内容")}</button>
                </div>
              </details>
              <details className="director-details">
                <summary>{tr("planner:学习方式与策略")}</summary>
                <label>{tr("planner:安排方式")}<select
                    aria-label={tr("planner:安排方式")}
                    value={data.settings.studyMode ?? 'guided'}
                    onChange={(e) =>
                      void run(async () => {
                        const d = await loadData(origin.current);
                        await put(
                          'setting',
                          { ...d.settings, studyMode: e.target.value },
                          'settings',
                          false,
                          origin.current,
                        );
                        await refresh();
                      })
                    }
                  >
                    <option value="auto">{tr("planner:Auto · 按计划连续学习")}</option>
                    <option value="guided">{tr("planner:Guided · 每次确认下一步")}</option>
                    <option value="manual">{tr("planner:Manual · 自主安排")}</option>
                  </select>
                </label>
                <p>{tr("planner:自主模式不扣除奖励，也不改变掌握记录；所有模式都可暂缓建议。计时考试仍遵守原规则。")}</p>
                <label>{tr("planner:策略参数")}<select
                    aria-label={tr("planner:策略参数")}
                    value={policyFor(data).id}
                    onChange={(e) =>
                      void run(async () => {
                        await changeStudyPolicy(e.target.value, origin.current);
                        await refresh();
                      })
                    }
                  >
                    {Object.values(POLICY_REGISTRY).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </label>
                {data.settings.studyPolicy?.previousId && (
                  <button
                    className="quiet"
                    onClick={() =>
                      void run(async () => {
                        await changeStudyPolicy(
                          data.settings.studyPolicy!.previousId!,
                          origin.current,
                        );
                        await refresh();
                      })
                    }
                  >{tr("planner:回滚到上次参数")}</button>
                )}
                <p>{tr("planner:参数版本随推荐记录保存。实验结果不足时不会自动宣称某个策略更好。")}</p>
              </details>
              {process.env.NODE_ENV !== 'production' && (
                <details className="director-details">
                  <summary>{tr("planner:开发：完整决策记录")}</summary>
                  <pre className="director-trace">
                    {JSON.stringify(agenda.decisionTrace, null, 2)}
                  </pre>
                </details>
              )}
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
              <h1>{tr("planner:考后成绩记录")}</h1>
              <p>{tr("planner:成绩保存后，下一步会结合考试差距与真实作答重新安排。")}</p>
              <ExamResults
                autoOpen
                initialExamId={action.examId}
                onClosed={() => void back()}
              />
              <button className="quiet" onClick={() => void back()}>{tr("planner:返回学习计划")}</button>
            </section>
          )}
          {mode === 'exam-import' && (
            <section className="director-subpage">
              <button className="quiet" onClick={() => void back()}>
                <ArrowLeft size={16} />{tr("planner:返回学习计划")}</button>
              <FullExamHub
                key={action.examKind ?? 'all'}
                initialExam={action.examKind}
                initialMapSection={sim?.mapSection}
                initialGrade={sim?.grade}
              />
              <button className="quiet" onClick={() => navigate('you')}>{tr("planner:管理考试日期与每日时间")}</button>
            </section>
          )}
          {mode === 'report' && (
            <section className="director-subpage director-report">
              <span className="now-kicker">{tr("planner:学习回顾")}</span>
              <h1>
                {action.id.startsWith('checkpoint:')
                  ? tr("planner:这一阶段学得怎样")
                  : tr("planner:看看最近的变化")}
              </h1>
              {action.id.startsWith('checkpoint:') && (
                <div className="director-checkpoint">
                  <p>{tr("planner:已完成")}{agenda.checkpoint.blocks.length}{tr("planner:段练习 ·")}{' '}
                    {agenda.checkpoint.events.length}{tr("planner:次作答")}</p>
                  {agenda.checkpoint.weak.length ? (
                    <>
                      <h2>{tr("planner:接下来先巩固这些能力")}</h2>
                      {agenda.checkpoint.weak.map((w) => (
                        <p key={w.key}>
                          {w.title}{tr("planner:· 最近有")}{w.count}{tr("planner:次需再巩固")}</p>
                      ))}
                    </>
                  ) : (
                    <p>{tr("planner:暂未发现集中反复出错的能力，接下来通过间隔验证检查保留情况。")}</p>
                  )}
                </div>
              )}
              <p>
                {info.days}{tr("planner:个学习日 ·")}{info.weekCount}{tr("planner:次有效作答")}</p>
              <div className="director-report-values">
                <article>
                  <span>{tr("planner:近七天作答表现")}</span>
                  <strong>
                    {info.accuracy === null
                      ? tr("planner:积累中")
                      : Math.round(info.accuracy * 100) + '%'}
                  </strong>
                  <small>
                    {info.change === null
                      ? tr("planner:记录足够后再比较趋势")
                      : tr("common:较此前七天{{v0}} {{v1}} 个百分点",{v0:(info.change >= 0 ? '提升' : '下降'),v1:(Math.abs(info.change * 100).toFixed(0))})}
                  </small>
                </article>
                <article>
                  <span>{tr("planner:真实考试 GPA")}</span>
                  <strong>
                    {info.gpa.value === null
                      ? tr("planner:待录入成绩")
                      : info.gpa.value.toFixed(2) +
                        ' / ' +
                        info.gpa.config.scale}
                  </strong>
                  <small>
                    {info.gpa.rows.length}{tr("planner:场考试 · 使用你的换算公式")}</small>
                </article>
                <article>
                  <span>{tr("planner:每周学习 GPA")}</span>
                  <strong>
                    {info.weekly.value === null
                      ? tr("planner:证据积累中")
                      : info.weekly.value.toFixed(2) + ' / 4.00'}
                  </strong>
                  <small>
                    {info.weekly.period.startDate} —{' '}
                    {info.weekly.period.endDate}
                  </small>
                </article>
              </div>
              <h2>{tr("planner:下一步的学习方法")}</h2>
              <p>{info.method}</p>
              {agenda.actions.find((a) => a.kind !== 'report') && (
                <>
                  <h2>{tr("planner:接下来的安排")}</h2>
                  <p>
                    {agenda.actions.find((a) => a.kind !== 'report')!.title}
                  </p>
                  <p>
                    {agenda.actions.find((a) => a.kind !== 'report')!.reason}
                  </p>
                </>
              )}
              <details>
                <summary>{tr("planner:为什么这样建议")}</summary>
                <p>{info.weekly.reason}</p>
                <p>{tr("planner:根据实际作答与间隔保留表现调整，不把同日答对或 XP 当作长期掌握。")}</p>
                <a
                  href={info.methodSources[0]}
                  target="_blank"
                  rel="noreferrer"
                >{tr("planner:检索练习研究")}</a>{' '}
                ·{' '}
                <a
                  href={info.methodSources[1]}
                  target="_blank"
                  rel="noreferrer"
                >{tr("planner:个体复习排程研究")}</a>
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
              >{tr("planner:继续下一步")}<ArrowRight size={18} />
              </button>
            </section>
          )}
          {mode === 'notes' && (
            <section className="director-subpage">
              <button className="quiet" onClick={() => void back()}>
                <ArrowLeft size={16} />{tr("planner:返回学习计划")}</button>
              <h1>{tr("planner:笔记与学习资料")}</h1>
              <p>{tr("planner:复习前回看自己的记录，或进入学科补充笔记。")}</p>
              {!data.notes.length && !data.materials.length && (
                <p>{tr("planner:还没有记录。可在学科中记笔记，或导入教材与资料。")}</p>
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
                >{tr("planner:进入学科笔记")}</button>
                <button
                  className="secondary"
                  onClick={() => navigate('library')}
                >{tr("planner:管理资料与导入")}</button>
              </div>
            </section>
          )}
          {mode === 'options' && (
            <section className="director-subpage">
              <h1>{tr("planner:按自己的节奏继续")}</h1>
              <p>{tr("planner:这次建议已暂缓，不会连续要求你参加同一场测试。")}</p>
              <button className="primary" onClick={() => void back()}>{tr("planner:重新查看安排")}<ArrowRight size={18} />
              </button>
              <div className="director-options">
                <button className="secondary" onClick={() => navigate('study')}>{tr("planner:自主练习")}</button>
                <button
                  className="secondary"
                  onClick={() => navigate('subjects')}
                >{tr("planner:学习课程")}</button>
                <button
                  className="secondary"
                  onClick={() => setMode('exam-import')}
                >{tr("planner:CE 模拟与导入")}</button>
              </div>
            </section>
          )}
        </>
      )}
    </main>
  );
}
