'use client';
import {tr} from '@/lib/i18n';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowLeft, ArrowRight, Flag, Check, Minus, X } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import { put, currentNamespace } from '@/lib/store';
import { isPinyin } from '@/lib/question-tools';
import {
  newAssessment,
  scoreAssessment,
  assessmentEventId,
  type AssessmentSession,
  type AssessmentDraft,
} from '@/lib/assessment';
import MathText from './math-text';
import GuidedFocusHeader from './guided-focus-header';
import MatchingInput from './matching-input';
import QuestionVisual from './question-visual';
import QuestionReviewButton from './question-review';
import { RemediationLauncher } from './remediation-course';

function AssessmentFocus({
  title, total, position, progress, onExit, exitLabel, children, actions, busy,
}: {
  title: string;
  total: number;
  position: number;
  progress: number;
  onExit: () => void;
  exitLabel: string;
  children: ReactNode;
  actions: ReactNode;
  busy?: boolean;
}) {
  return (
    <section className="guided-practice guided-assessment" aria-label={title}>
      <GuidedFocusHeader onExit={onExit} exitLabel={exitLabel}
        progress={progress} progressLabel={title} position={`${position} / ${total}`} busy={busy} />
      <div className="guided-canvas">
        {children}
        <footer className="assessment-focus-footer">{actions}</footer>
      </div>
    </section>
  );
}

export default function AssessmentRoom({
  session,
  finish,
  savedExit = finish,
}: {
  session: AssessmentSession;
  finish: () => void;
  savedExit?: () => void;
}) {
  const { data, refresh, notify } = useReview();
  const [draft, setDraft] = useState<AssessmentDraft>(() => ({
      ...(data.jobs?.find((j) => j.id === 'assessment:' + session.id) ??
        newAssessment(session)),
      session,
    })),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState(''),
    [reviewIndex, setReviewIndex] = useState<number | null>(null);
  const ref = useRef(draft),
    ns = useRef(currentNamespace()),
    writes = useRef(Promise.resolve()),
    start = useRef(Date.now()),
    gradeLock = useRef(false),
    visible = useRef(true);
  const q = session.items[draft.index]?.question;
  const events = data.events.filter((e) => e.sessionId === session.id);
  const focusStage = useRef<HTMLDivElement>(null);
  const reviewedIndex = reviewIndex ?? session.items.findIndex(({ question }) =>
    isPinyin(question) && !events.some((e) => e.id === assessmentEventId(session.id, question)));
  const resultIndex = Math.max(0, reviewedIndex);
  useEffect(() => {
    if (session.sprint) return;
    focusStage.current?.scrollTo?.({ top: 0 });
    focusStage.current?.querySelector<HTMLElement>('[data-assessment-heading]')?.focus({ preventScroll: true });
  }, [draft.index, draft.status, session.sprint]);
  function save(d: AssessmentDraft) {
    ref.current = d;
    setDraft(d);
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        await put('job', d, d.id, false, ns.current);
        setError('');
      })
      .catch(() => setError(tr("study:进度未能保存，请检查设备存储后重试。")));
  }
  function capture() {
    const d = ref.current;
    if (d.status !== 'answering') return d;
    const id = session.items[d.index]?.question.id;
    if (!id) return d;
    const next = {
      ...d,
      times: {
        ...d.times,
        [id]:
          (d.times[id] ?? 0) +
          (visible.current ? Math.max(0, Date.now() - start.current) : 0),
      },
    };
    start.current = Date.now();
    return next;
  }
  function move(index: number) {
    save({ ...capture(), index });
  }
  useEffect(() => {
    visible.current = !document.hidden;
    save(ref.current);
    const id = setInterval(() => {
      if (ref.current.status === 'answering') save(capture());
    }, 10000);
    const hide = () => save(capture());
    const visibility = () => {
      if (ref.current.status === 'answering') save(capture());
      visible.current = !document.hidden;
      start.current = Date.now();
    };
    window.addEventListener('pagehide', hide);
    document.addEventListener('visibilitychange', visibility);
    return () => {
      clearInterval(id);
      window.removeEventListener('pagehide', hide);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, []);
  async function flush() {
    await writes.current;
    try {
      await put('job', ref.current, ref.current.id, false, ns.current);
      setError('');
    } catch {
      setError(tr("study:保存未完成，请保留页面并重试。"));
      throw new Error('保存未完成');
    }
  }
  async function grade(manual?: Parameters<typeof scoreAssessment>[2]) {
    if (gradeLock.current) return;
    gradeLock.current = true;
    setBusy(true);
    setError('');
    try {
      await flush();
      const next = await scoreAssessment(
        session,
        ref.current,
        manual,
        ns.current,
      );
      ref.current = next;
      setDraft(next);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '批改暂未完成，可稍后继续');
      await refresh();
    } finally {
      setBusy(false);
      gradeLock.current = false;
    }
  }
  useEffect(() => {
    if (draft.status === 'grading') void grade();
  }, []);
  async function submit() {
    const next = {
      ...capture(),
      status: 'grading',
      submittedAt: new Date().toISOString(),
    } as AssessmentDraft;
    save(next);
    setConfirm(false);
    try {
      await flush();
      await grade();
    } catch {}
  }
  async function exit() {
    if (ref.current.status === 'answering') save(capture());
    try {
      await flush();
      await refresh();
      if (ref.current.status === 'complete') finish();
      else savedExit();
    } catch {}
  }
  if (!q) return null;
  if (draft.status !== 'answering') {
    const pending = session.items.filter(
      ({ question: q }) =>
        (!session.sprint || draft.answers[q.id]?.trim()) &&
        !events.some((e) => e.id === assessmentEventId(session.id, q)),
    );
    const exitLabel = tr(session.sprint && draft.status === 'complete'
      ? 'dashboard:sprint.next' : 'study:返回工作台');
    const summary = (
      <>
        <h1 data-assessment-heading tabIndex={-1}>{pending.length ? tr("study:测试已交卷，完成最后的检查") : tr("study:测试已完成")}</h1>
        <p className="muted">
          {session.title} · {events.length}/{session.items.length}{tr("study:题已评分")}</p>
        <div className="summary-stats">
          <div>
            <strong>
              {events.length
                ? Math.round(
                    (events.reduce((n, e) => n + e.score, 0) / events.length) *
                      100,
                  )
                : '—'}
              %
            </strong>
            <span>{pending.length ? tr("study:已评分题目得分率") : tr("study:本次得分率")}</span>
          </div>
          <div>
            <strong>{session.items.length}</strong>
            <span>{tr("study:题目")}</span>
          </div>
        </div>
        {error && (
          <p role="alert" className="inline-hint">
            {error}
          </p>
        )}
        {pending.some((i) => !isPinyin(i.question)) && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => void grade()}
          >
            {busy ? tr("study:正在按评分标准批改…") : tr("study:继续批改")}
          </button>
        )}
        {!session.sprint && !pending.length && (
          <RemediationLauncher sessionId={session.id} title={session.title} />
        )}
      </>
    );
    const renderAnswer = (i: number) => {
          const { question: q } = session.items[i];
          const e = events.find(
            (e) => e.id === assessmentEventId(session.id, q),
          );
          const status = tr(e
            ? e.outcome === 'correct' ? 'common:答对' : e.outcome === 'unsure' ? 'common:不确定' : 'common:答错'
            : isPinyin(q) ? 'common:等待手动检查' : 'common:等待评分');
          const prompt = (
            <span>
                  {i + 1}. <MathText>{q.prompt}</MathText>
            </span>
          );
          const details = (
            <>
              {q.passage && (
                <blockquote>
                  <MathText>{q.passage}</MathText>
                </blockquote>
              )}
              {!isPinyin(q) && (
                <p>{tr("study:你的答案：")}<MathText>{draft.answers[q.id] || '未作答'}</MathText>
                </p>
              )}
              {e?.voidedBy && (
                <p className="muted">{tr("study:旧题证据已撤销：")}{e.voidedBy.reason}{tr("study:。原作答与分数保留用于追溯。")}</p>
              )}
              <QuestionReviewButton question={q} />
              <p className="answer-label">{tr("study:参考答案")}</p>
              <h3>
                <MathText>
                  {q.type === 'matching' ? tr("study:配对结果见解析") : q.answer}
                </MathText>
              </h3>
              <p>
                <MathText>{q.explanation}</MathText>
              </p>
              {!!q.solution?.length && <ol className="teaching-steps">
                {q.solution.map((s, i) => <li key={i}><MathText>{s}</MathText></li>)}
              </ol>}
              {isPinyin(q) && !e && (
                <>
                  <p className="muted">{tr("study:对照自己刚才回忆或纸上写下的答案，手动判断。")}</p>
                  <div className="rating-actions">
                    <button
                      disabled={busy}
                      className="wrong"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'wrong' })
                      }
                    >
                      <X size={16} />{tr("study:答错")}</button>
                    <button
                      disabled={busy}
                      className="unsure"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'unsure' })
                      }
                    >
                      <Minus size={16} />{tr("study:不确定")}</button>
                    <button
                      disabled={busy}
                      className="correct"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'correct' })
                      }
                    >
                      <Check size={16} />{tr("study:答对")}</button>
                  </div>
                </>
              )}
              {e?.grade && (
                <>
                  <h3>
                    {e.grade.score}/{e.grade.maxScore}
                  </h3>
                  {e.grade.criteria.map((c) => (
                    <p key={c.id}>
                      <b>{q.rubric?.find((r) => r.id === c.id)?.title}</b>：
                      {c.score} · {c.missing} {c.suggestion}
                    </p>
                  ))}
                  <p>{e.grade.feedback}</p>
                </>
              )}
            </>
          );
          return session.sprint ? (
            <details key={q.id} className="panel assessment-answer" open={isPinyin(q) && !e}>
              <summary>{prompt}<b>{status}</b></summary>
              {details}
            </details>
          ) : (
            <article className="assessment-focus-review" key={q.id}>
              <header><h2>{prompt}</h2><b data-outcome={e?.outcome}>{status}</b></header>
              <QuestionVisual question={q} solution />
              {details}
            </article>
          );
    };
    const exitButton = <button type="button" className={session.sprint ? 'quiet' : 'primary'}
      onClick={() => void exit()}>{session.sprint && <ArrowLeft size={16} />}{exitLabel}</button>;
    if (session.sprint) return (
      <div className="assessment-result">
        {exitButton}
        <p className="eyebrow">ASSESSMENT REVIEW</p>
        {summary}
        {session.items.map((_, i) => renderAnswer(i))}
      </div>
    );
    return (
      <AssessmentFocus title={session.title} total={session.items.length} position={events.length}
        progress={(events.length / session.items.length) * 100} onExit={() => void exit()} exitLabel={exitLabel}
        actions={exitButton}>
        <div className="guided-stage" ref={focusStage}>
          <div className="assessment-focus-reading assessment-focus-results">
            {summary}
            <nav className="assessment-focus-index" aria-label={tr('study:测试报告')}>
              {session.items.map(({question}, i) => (
                <button type="button" key={question.id} aria-current={i === resultIndex ? 'true' : undefined}
                  onClick={() => setReviewIndex(i)}>{i + 1}</button>
              ))}
            </nav>
            {renderAnswer(resultIndex)}
          </div>
        </div>
      </AssessmentFocus>
    );
  }
  const answer = draft.answers[q.id] ?? '';
  const change = (answer: string) =>
    save({
      ...ref.current,
      answers: { ...ref.current.answers, [q.id]: answer },
    });
  const saveError = error && (
        <p role="alert">
          {error}
          <button onClick={() => save(ref.current)}>{tr("study:重试保存")}</button>
        </p>
  );
  const answered = (id: string) => !!draft.answers[id]?.trim() || draft.completedQuestions.includes(id);
  const answeredCount = session.items.filter(({question}) => answered(question.id)).length;
  const navigation = (
        <nav className={session.sprint ? undefined : 'assessment-focus-index'} aria-label={tr("study:测试题目导航")}>
          {session.items.map(({ question: q }, i) => (
            <button
              type="button"
              key={q.id}
              aria-current={i === draft.index ? 'step' : undefined}
              aria-label={`${i + 1} / ${session.items.length} · ${tr(answered(q.id)
                ? 'dashboard:sprint.attempts' : 'study:navi.live.noAnswer')}`}
              className={
                (i === draft.index ? 'selected ' : '') +
                (answered(q.id)
                  ? 'answered'
                  : '')
              }
              onClick={() => move(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
  );
  const question = (
        <>
          {session.sprint && <p className="eyebrow">QUESTION {draft.index + 1}</p>}
          {q.passage && (
            <blockquote>
              <MathText>{q.passage}</MathText>
            </blockquote>
          )}
          <h2 data-assessment-heading tabIndex={-1}>
            <MathText>{q.prompt}</MathText>
          </h2>
          <QuestionVisual question={q}/>{' '}
          {isPinyin(q) ? (
            <div className="pinyin-test-note">
              <p>{tr("study:在心里回忆，或在纸上写下答案。")}</p>
              <p className="muted">{tr("study:交卷后显示标准答案，由你手动检查。")}</p>
              <button
                className={
                  draft.completedQuestions.includes(q.id)
                    ? 'secondary'
                    : 'primary'
                }
                onClick={() => {
                  const d = capture();
                  save({
                    ...d,
                    completedQuestions: [
                      ...new Set([...d.completedQuestions, q.id]),
                    ],
                    index: Math.min(d.index + 1, session.items.length - 1),
                  });
                }}
              >
                {draft.completedQuestions.includes(q.id)
                  ? tr("study:已完成回忆")
                  : tr("study:完成回忆，下一题")}
                <ArrowRight size={16} />
              </button>
            </div>
          ) : q.type === 'matching' ? (
            <MatchingInput question={q} value={answer} onChange={change} />
          ) : q.options ? (
            <div className="question-options">
              {q.options.map((o, i) => (
                <button
                  className={answer === o ? 'chosen' : ''}
                  aria-pressed={answer === o}
                  key={i}
                  onClick={() => change(o)}
                >
                  <MathText>{o}</MathText>
                </button>
              ))}
            </div>
          ) : (
            <textarea
              aria-label={tr("study:测试答案")}
              rows={q.type === 'subjective' ? 9 : 3}
              value={answer}
              onChange={(e) => change(e.target.value)}
              maxLength={16000}
              placeholder={
                q.type === 'subjective'
                  ? tr("study:组织你的回答，交卷后按评分标准批改。")
                  : tr("study:输入答案")
              }
            />
          )}
        </>
  );
  const actions = (
    <>
            <button
              className="secondary"
              disabled={draft.index === 0}
              onClick={() => move(draft.index - 1)}
            >{tr("study:上一题")}</button>
            {draft.index < session.items.length - 1 ? (
              <button className="primary" onClick={() => move(draft.index + 1)}>{tr("study:下一题")}<ArrowRight size={16} />
              </button>
            ) : (
              <button className="primary" onClick={() => setConfirm(true)}>{tr("study:交卷并查看解析")}</button>
            )}
    </>
  );
  const submission = (
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>{tr("study:交卷并开始检查？")}</DialogTitle>
          <DialogDescription>{session.sprint ? tr('dashboard:sprint.checkSubmit') : tr("study:交卷后不能修改原作答。拼音写字题将在交卷后对照标准答案手动检查。")}</DialogDescription>
          <div className="button-row">
            <button className="secondary" onClick={() => setConfirm(false)}>{tr("study:继续作答")}</button>
            <button className="primary" onClick={() => void submit()}>{tr("study:确认交卷")}</button>
          </div>
        </DialogContent>
      </Dialog>
  );
  if (session.sprint) return (
    <div className="assessment-room">
      {saveError}
      <div className="assessment-layout">
        {navigation}
        <article key={q.id}>{question}<footer>{actions}</footer></article>
      </div>
      {submission}
    </div>
  );
  return (
    <>
      <AssessmentFocus title={session.title} total={session.items.length} position={draft.index + 1}
        progress={(answeredCount / session.items.length) * 100}
        onExit={() => void exit()} exitLabel={tr('study:保存并退出')} actions={actions} busy={busy}>
        <div className="guided-stage" ref={focusStage}>
          <div className="assessment-focus-reading">
            <div className="assessment-focus-overview">
              <h1>{session.title}</h1>
              <span>{tr('dashboard:sprint.attempts')} {answeredCount} / {session.items.length}</span>
            </div>
            {navigation}
            {saveError}
            <article className="assessment-focus-question" key={q.id}>{question}</article>
          </div>
        </div>
      </AssessmentFocus>
      {submission}
    </>
  );
}
