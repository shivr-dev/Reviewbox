'use client';
import { useEffect, useRef, useState } from 'react';
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
import MatchingInput from './matching-input';
import Diagram from './diagram';
export default function AssessmentRoom({
  session,
  finish,
}: {
  session: AssessmentSession;
  finish: () => void;
}) {
  const { data, refresh, notify } = useReview();
  const [draft, setDraft] = useState<AssessmentDraft>(() => ({
      ...(data.jobs?.find((j) => j.id === 'assessment:' + session.id) ??
        newAssessment(session)),
      session,
    })),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [error, setError] = useState('');
  const ref = useRef(draft),
    ns = useRef(currentNamespace()),
    writes = useRef(Promise.resolve()),
    start = useRef(Date.now()),
    gradeLock = useRef(false),
    visible = useRef(true);
  const q = session.items[draft.index]?.question;
  const events = data.events.filter((e) => e.sessionId === session.id);
  function save(d: AssessmentDraft) {
    ref.current = d;
    setDraft(d);
    writes.current = writes.current
      .catch(() => {})
      .then(async () => {
        await put('job', d, d.id, false, ns.current);
        setError('');
      })
      .catch(() => setError('进度未能保存，请检查设备存储后重试。'));
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
      setError('保存未完成，请保留页面并重试。');
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
      finish();
    } catch {}
  }
  if (!q) return null;
  if (draft.status !== 'answering') {
    const pending = session.items.filter(
      ({ question: q }) =>
        !events.some((e) => e.id === assessmentEventId(session.id, q)),
    );
    return (
      <div className="assessment-result">
        <button className="quiet" onClick={() => void exit()}>
          <ArrowLeft size={16} />
          返回工作台
        </button>
        <p className="eyebrow">ASSESSMENT REVIEW</p>
        <h1>{pending.length ? '测试已交卷，完成最后的检查' : '测试已完成'}</h1>
        <p className="muted">
          {session.title} · {events.length}/{session.items.length} 题已评分
        </p>
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
            <span>{pending.length ? '已评分题目得分率' : '本次得分率'}</span>
          </div>
          <div>
            <strong>{session.items.length}</strong>
            <span>题目</span>
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
            {busy ? '正在按评分标准批改…' : '继续批改'}
          </button>
        )}
        {session.items.map(({ question: q }, i) => {
          const e = events.find(
            (e) => e.id === assessmentEventId(session.id, q),
          );
          return (
            <details
              key={q.id}
              className="panel assessment-answer"
              open={isPinyin(q) && !e}
            >
              <summary>
                <span>
                  {i + 1}. <MathText>{q.prompt}</MathText>
                </span>
                <b>
                  {e
                    ? e.outcome === 'correct'
                      ? '答对'
                      : e.outcome === 'unsure'
                        ? '不确定'
                        : '答错'
                    : isPinyin(q)
                      ? '等待手动检查'
                      : '等待评分'}
                </b>
              </summary>
              {q.passage && (
                <blockquote>
                  <MathText>{q.passage}</MathText>
                </blockquote>
              )}
              {!isPinyin(q) && (
                <p>
                  你的答案：
                  <MathText>{draft.answers[q.id] || '未作答'}</MathText>
                </p>
              )}
              <p className="answer-label">参考答案</p>
              <h3>
                <MathText>
                  {q.type === 'matching' ? '配对结果见解析' : q.answer}
                </MathText>
              </h3>
              <p>
                <MathText>{q.explanation}</MathText>
              </p>
              {q.solution?.map((s, i) => (
                <p key={i}>
                  Step {i + 1} · <MathText>{s}</MathText>
                </p>
              ))}
              {isPinyin(q) && !e && (
                <>
                  <p className="muted">
                    对照自己刚才回忆或纸上写下的答案，手动判断。
                  </p>
                  <div className="rating-actions">
                    <button
                      disabled={busy}
                      className="wrong"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'wrong' })
                      }
                    >
                      <X size={16} />
                      答错
                    </button>
                    <button
                      disabled={busy}
                      className="unsure"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'unsure' })
                      }
                    >
                      <Minus size={16} />
                      不确定
                    </button>
                    <button
                      disabled={busy}
                      className="correct"
                      onClick={() =>
                        void grade({ questionId: q.id, outcome: 'correct' })
                      }
                    >
                      <Check size={16} />
                      答对
                    </button>
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
            </details>
          );
        })}
      </div>
    );
  }
  const answer = draft.answers[q.id] ?? '';
  const change = (answer: string) =>
    save({
      ...ref.current,
      answers: { ...ref.current.answers, [q.id]: answer },
    });
  return (
    <div className="assessment-room">
      <header>
        <button onClick={() => void exit()}>
          <ArrowLeft size={16} />
          保存并退出
        </button>
        <div>
          <p>ASSESSMENT</p>
          <h1>{session.title}</h1>
        </div>
        <b>
          {draft.index + 1} / {session.items.length}
        </b>
      </header>
      {error && (
        <p role="alert">
          {error}
          <button onClick={() => save(ref.current)}>重试保存</button>
        </p>
      )}
      <div className="assessment-layout">
        <nav aria-label="测试题目导航">
          {session.items.map(({ question: q }, i) => (
            <button
              key={q.id}
              className={
                (i === draft.index ? 'selected ' : '') +
                (draft.answers[q.id] || draft.completedQuestions.includes(q.id)
                  ? 'answered'
                  : '')
              }
              onClick={() => move(i)}
            >
              {i + 1}
            </button>
          ))}
        </nav>
        <article key={q.id}>
          <p className="eyebrow">QUESTION {draft.index + 1}</p>
          {q.passage && (
            <blockquote>
              <MathText>{q.passage}</MathText>
            </blockquote>
          )}
          <h2>
            <MathText>{q.prompt}</MathText>
          </h2>
          {q.diagram && <Diagram spec={q.diagram} />}{' '}
          {isPinyin(q) ? (
            <div className="pinyin-test-note">
              <p>在心里回忆，或在纸上写下答案。</p>
              <p className="muted">交卷后显示标准答案，由你手动检查。</p>
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
                  ? '已完成回忆'
                  : '完成回忆，下一题'}
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
                  key={i}
                  onClick={() => change(o)}
                >
                  <MathText>{o}</MathText>
                </button>
              ))}
            </div>
          ) : (
            <textarea
              aria-label="测试答案"
              rows={q.type === 'subjective' ? 9 : 3}
              value={answer}
              onChange={(e) => change(e.target.value)}
              maxLength={16000}
              placeholder={
                q.type === 'subjective'
                  ? '组织你的回答，交卷后按评分标准批改。'
                  : '输入答案'
              }
            />
          )}
          <footer>
            <button
              className="secondary"
              disabled={draft.index === 0}
              onClick={() => move(draft.index - 1)}
            >
              上一题
            </button>
            {draft.index < session.items.length - 1 ? (
              <button className="primary" onClick={() => move(draft.index + 1)}>
                下一题
                <ArrowRight size={16} />
              </button>
            ) : (
              <button className="primary" onClick={() => setConfirm(true)}>
                交卷并查看解析
              </button>
            )}
          </footer>
        </article>
      </div>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>交卷并开始检查？</DialogTitle>
          <DialogDescription>
            交卷后不能修改原作答。拼音写字题将在交卷后对照标准答案手动检查。
          </DialogDescription>
          <div className="button-row">
            <button className="secondary" onClick={() => setConfirm(false)}>
              继续作答
            </button>
            <button className="primary" onClick={() => void submit()}>
              确认交卷
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
