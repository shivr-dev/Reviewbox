'use client';
import MathText from './math-text';
import MatchingInput from './matching-input';
import { objectiveScore, isPinyin } from '@/lib/question-tools';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Clock3,
  Eye,
  Minus,
  PencilLine,
  X,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useReview } from './review-context';
import { buildQueue } from '@/lib/engine';
import {
  type QueueItem,
  type AnswerEvent,
  type Grade,
  uid,
  localDay,
  subjectName,
} from '@/lib/model';
import {
  put,
  saveRecords,
  currentNamespace,
  completeActiveSession,
} from '@/lib/store';
import { gradeAnswer } from '@/lib/ai-client';
import Diagram from './diagram';
import { Empty, Heading, SubjectChoice } from './shared';
export default function StudyView({
  session,
  finish,
}: {
  session: {
    id: string;
    items: QueueItem[];
    mode: 'review' | 'test';
    title: string;
  } | null;
  finish: () => void;
}) {
  const { data, start, refresh, notify, aiReady } = useReview();
  const [index, setIndex] = useState(0),
    [focusMode, setFocusMode] = useState(true),
    [scratchOpen, setScratchOpen] = useState(false),
    [revealed, setRevealed] = useState(false),
    [answerPanelOpen, setAnswerPanelOpen] = useState(false),
    [solution, setSolution] = useState(false),
    [answer, setAnswer] = useState(''),
    [grade, setGrade] = useState<Grade | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [subject, setSubject] = useState('all'),
    [results, setResults] = useState<AnswerEvent[]>([]);
  const [confidence, setConfidence] = useState<
    'sure' | 'unsure' | 'guess' | undefined
  >();
  const lock = useRef(false);
  const answerCloseRef = useRef<HTMLButtonElement>(null);
  const originNamespace = useRef(currentNamespace());
  const timing = useRef({
    displayed: '',
    revealed: '',
    active: 0,
    start: 0,
    visible: true,
  });
  useEffect(() => {
    setFocusMode(localStorage.getItem('review-focus-mode') !== 'classic');
  }, []);
  const toggleFocus = () => {
    setFocusMode((current) => {
      localStorage.setItem('review-focus-mode', current ? 'classic' : 'focus');
      return !current;
    });
  };
  const item = session?.items[index];
  const q = item?.question;
  const node = data.nodes.find((n) => n.id === q?.nodeId);
  const reset = () => {
    setRevealed(false);
    setAnswerPanelOpen(false);
    setSolution(false);
    setAnswer('');
    setGrade(null);
    setConfidence(undefined);
    timing.current = {
      displayed: new Date().toISOString(),
      revealed: '',
      active: 0,
      start: performance.now(),
      visible: !document.hidden,
    };
  };
  useEffect(() => {
    const saved = data.events
      .filter((e) => e.sessionId === session?.id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    setIndex(saved.length);
    setDone(!!session && saved.length >= session.items.length);
    setResults(saved);
    originNamespace.current = currentNamespace();
    reset();
  }, [session?.id]);
  useEffect(() => {
    reset();
    const draft = data.jobs?.find(
      (j) => j.id === 'draft:' + session?.id + ':' + q?.id,
    );
    if (draft) {
      setAnswer(draft.answer ?? '');
      if (draft.grade) {
        setGrade(draft.grade);
        setRevealed(true);
        setAnswerPanelOpen(true);
      }
    }
  }, [index]);
  useEffect(() => {
    const visibility = () => {
      const t = timing.current;
      if (t.visible && !t.revealed) t.active += performance.now() - t.start;
      t.visible = !document.hidden;
      t.start = performance.now();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => document.removeEventListener('visibilitychange', visibility);
  }, []);
  function reveal() {
    const t = timing.current;
    if (!t.revealed) {
      if (t.visible) t.active += performance.now() - t.start;
      t.revealed = new Date().toISOString();
    }
    setRevealed(true);
    setAnswerPanelOpen(true);
  }
  async function record(
    outcome: 'correct' | 'unsure' | 'wrong',
    g?: Grade,
    autoScore?: number,
  ) {
    if (
      !q ||
      !session ||
      lock.current ||
      currentNamespace() !== originNamespace.current
    )
      return;
    lock.current = true;
    setBusy(true);
    try {
      const t = timing.current;
      if (!t.revealed) {
        if (t.visible) t.active += performance.now() - t.start;
        t.revealed = new Date().toISOString();
      }
      if (
        !g &&
        !isPinyin(q) &&
        answer.trim() &&
        ['choice', 'blank', 'matching'].includes(q.type)
      ) {
        const actual = objectiveScore(q, answer);
        autoScore =
          outcome === 'wrong'
            ? 0
            : outcome === 'unsure'
              ? Math.min(0.5, actual)
              : actual;
        outcome =
          autoScore >= 0.85 ? 'correct' : autoScore >= 0.4 ? 'unsure' : 'wrong';
      }
      const e: AnswerEvent = {
        id: 'answer:' + session.id + ':' + index,
        questionId: q.id,
        nodeId: q.nodeId,
        skillId: q.skillId,
        subject: q.subject,
        outcome,
        score: g
          ? g.score / g.maxScore
          : (autoScore ??
            (outcome === 'correct' ? 1 : outcome === 'unsure' ? 0.5 : 0)),
        source: g ? 'rubric' : session.mode === 'test' ? 'test' : 'self',
        grade: g,
        answer: answer || undefined,
        occurredAt: new Date().toISOString(),
        displayedAt: t.displayed,
        revealedAt: t.revealed,
        activeThinkMs: Math.round(t.active),
        expectedSeconds: q.expectedSeconds,
        difficulty: q.difficulty,
        variant: q.variant,
        usedHint: !!item?.scaffold,
        reason: item?.reason ?? '复习',
        sessionId: session.id,
        localDay: localDay(),
        version: 1,
        predictedConfidence: confidence,
      };
      if (g && q.rubric) {
        const groups = new Map<string, { score: number; max: number }>();
        for (const r of q.rubric) {
          const item = g.criteria.find((c) => c.id === r.id);
          if (!node?.skills.some((s) => s.id === r.skillId)) continue;
          const current = groups.get(r.skillId) ?? { score: 0, max: 0 };
          groups.set(r.skillId, {
            score: current.score + (item?.score ?? 0),
            max: current.max + r.max,
          });
        }
        e.targets = Array.from(groups, ([skillId, value]) => ({
          skillId,
          score: value.score / value.max,
          weight: value.max / g.maxScore,
        }));
      }
      await put('event', e, e.id, false, originNamespace.current);
      const all = [...results, e];
      setResults(all);
      if (index + 1 >= session.items.length) {
        if (session.mode === 'test')
          await put(
            'test',
            {
              id: 'test:' + session.id,
              title: session.title,
              subject: all.every((e) => e.subject === all[0].subject)
                ? all[0].subject
                : 'all',
              sessionId: session.id,
              eventIds: all.map((e) => e.id),
              at: new Date().toISOString(),
              scope: [...new Set(all.map((e) => e.nodeId))],
            },
            'test:' + session.id,
            false,
            originNamespace.current,
          );
        await completeActiveSession(session.id, originNamespace.current);
        setAnswerPanelOpen(false);
        setRevealed(false);
        setDone(true);
      } else {
        setAnswerPanelOpen(false);
        setRevealed(false);
        setIndex(index + 1);
      }
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '保存未完成，请重试');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function submitSubjective() {
    if (!q || !answer.trim()) return;
    setBusy(true);
    if (session?.mode !== 'test') reveal();
    try {
      await put(
        'job',
        {
          id: 'draft:' + session!.id + ':' + q.id,
          status: 'grading',
          questionId: q.id,
          answer,
        },
        'draft:' + session!.id + ':' + q.id,
        false,
        originNamespace.current,
      );
      const g = await gradeAnswer(q, answer);
      if (session?.mode === 'test') {
        await record(
          g.score / g.maxScore >= 0.85
            ? 'correct'
            : g.score / g.maxScore >= 0.4
              ? 'unsure'
              : 'wrong',
          g,
        );
        return;
      }
      setGrade(g);
      await put(
        'job',
        {
          id: 'draft:' + session!.id + ':' + q.id,
          status: 'graded',
          questionId: q.id,
          answer,
          grade: g,
        },
        'draft:' + session!.id + ':' + q.id,
        false,
        originNamespace.current,
      );
    } catch (e) {
      setRevealed(false);
      setAnswerPanelOpen(false);
      notify(
        e instanceof Error ? e.message : '批改暂时不可用，答案仍保留在当前页面',
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!answerPanelOpen) return;
    answerCloseRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAnswerPanelOpen(false);
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [answerPanelOpen]);
  useEffect(() => {
    if (!q || done) return;
    const keys = (e: KeyboardEvent) => {
      if (
        ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName) ||
        busy
      )
        return;
      if (
        e.code === 'Space' &&
        !revealed &&
        q.type !== 'subjective' &&
        session?.mode !== 'test'
      ) {
        e.preventDefault();
        reveal();
      }
      if (
        revealed &&
        answerPanelOpen &&
        q.type !== 'subjective' &&
        session?.mode !== 'test' &&
        ['1', '2', '3'].includes(e.key)
      ) {
        e.preventDefault();
        void record(
          ({ '1': 'wrong', '2': 'unsure', '3': 'correct' } as const)[
            e.key as '1'
          ],
        );
      }
    };
    window.addEventListener('keydown', keys);
    return () => window.removeEventListener('keydown', keys);
  });
  if (!session) {
    const queue = buildQueue(data, {
      subject: subject === 'all' ? undefined : subject,
    });
    return (
      <>
        <Heading
          eyebrow="STUDY SESSION"
          title="给回忆，一点专注。"
          description="想一想，揭晓答案，再如实判断自己的掌握情况。"
          action={<SubjectChoice all value={subject} onChange={setSubject} />}
        />
        <section className="panel">
          <div className="section-head">
            <h2>今日复习队列</h2>
            <button
              className="primary"
              disabled={!queue.length}
              onClick={() => start(queue)}
            >
              开始复习 <ArrowRight size={15} />
            </button>
          </div>
          {queue.length ? (
            queue.map((item, i) => (
              <div className="queue-row" key={item.question.id}>
                <span className="index-label">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <div className="grow">
                  <h3>
                    {
                      data.nodes.find((n) => n.id === item.question.nodeId)
                        ?.title
                    }
                  </h3>
                  <p className="muted">
                    {subjectName(item.question.subject)} ·{' '}
                    {
                      data.nodes
                        .find((n) => n.id === item.question.nodeId)
                        ?.skills.find((s) => s.id === item.question.skillId)
                        ?.title
                    }
                  </p>
                </div>
                <span className="reason-pill">{item.reason}</span>
                <span className="muted">
                  约 {item.question.expectedSeconds} 秒
                </span>
              </div>
            ))
          ) : (
            <Empty title="暂无到期复习">你可以到学科中心进行专项练习。</Empty>
          )}
        </section>
      </>
    );
  }
  if (done) {
    const score = results.length
      ? Math.round(
          (results.reduce((a, e) => a + e.score, 0) / results.length) * 100,
        )
      : 0;
    return (
      <div className="session-summary">
        <span className="summary-icon">
          <CheckCheck size={29} />
        </span>
        <p className="eyebrow">SESSION COMPLETE</p>
        <h1>
          {session.mode === 'test' ? '测试已完成' : '今天，又学扎实了一点。'}
        </h1>
        <p className="muted">学习记录已保存，下一次复习安排已更新。</p>
        <div className="summary-stats">
          <div>
            <strong>{results.length}</strong>
            <span>完成题目</span>
          </div>
          <div>
            <strong>{score}%</strong>
            <span>
              {session.mode === 'test' ? '本次得分率' : '本次掌握反馈'}
            </span>
          </div>
          <div>
            <strong>
              {Math.max(
                1,
                Math.round(
                  results.reduce((a, e) => a + e.activeThinkMs, 0) / 60000,
                ),
              )}
            </strong>
            <span>分钟思考</span>
          </div>
        </div>
        <div className="summary-items">
          {results.map((e) => (
            <details key={e.id}>
              <summary>
                <span>{data.nodes.find((n) => n.id === e.nodeId)?.title}</span>
                <span className={'outcome ' + e.outcome}>
                  {e.grade
                    ? `${e.grade.score} / ${e.grade.maxScore}`
                    : e.outcome === 'correct'
                      ? '答对'
                      : e.outcome === 'unsure'
                        ? '不确定'
                        : '答错'}
                </span>
              </summary>
              <p className="muted">
                <MathText>
                  {data.questions.find((q) => q.id === e.questionId)?.prompt}
                </MathText>
              </p>
              <p>
                参考答案：
                <MathText>
                  {data.questions.find((q) => q.id === e.questionId)?.answer}
                </MathText>
              </p>
              <p>
                <MathText>
                  {
                    data.questions.find((q) => q.id === e.questionId)
                      ?.explanation
                  }
                </MathText>
              </p>
              {data.questions
                .find((q) => q.id === e.questionId)
                ?.solution?.map((step, i) => (
                  <p key={i}>
                    <MathText>{step}</MathText>
                  </p>
                ))}
            </details>
          ))}
        </div>
        <button className="primary" onClick={finish}>
          回到学习工作台
          <ArrowRight size={16} />
        </button>
      </div>
    );
  }
  if (!q) return null;
  const isTest = session.mode === 'test';
  return (
    <div
      className={
        'study-surface ' + (isTest ? 'assessment-surface' : 'practice-surface') +
        (!isTest && focusMode ? ' focus-mode' : '')
      }
    >
      <div className="session-top">
        <button className="quiet" onClick={finish}>
          <ArrowLeft size={16} />
          保存并退出
        </button>
        <span>
          {isTest
            ? session.title
            : subjectName(q.subject) + ' · ' + node?.title}
        </span>
        <b>
          {index + 1}
          <span> / {session.items.length}</span>
        </b>
        {!isTest && <div className="study-view-controls">
          <button className="quiet" onClick={() => setScratchOpen((v) => !v)} aria-expanded={scratchOpen}>
            <PencilLine size={15} /> 草稿纸
          </button>
          <button className="quiet" onClick={toggleFocus} aria-pressed={focusMode}>
            {focusMode ? '退出沉浸' : '沉浸模式'}
          </button>
        </div>}
      </div>
      <Progress
        value={(index / session.items.length) * 100}
        className="session-progress"
      />
      <div className="question-meta">
        <span>{node?.skills.find((s) => s.id === q.skillId)?.title}</span>
        <span>难度 {'·'.repeat(q.difficulty)}</span>
        {q.verified && (
          <span className="verified">
            <CheckCheck size={13} />
            解答已核验
          </span>
        )}
      </div>
      {item?.scaffold && !isTest && (
        <aside className="scaffold">
          <BookOpen size={17} />
          <div>
            <b>先找回基础</b>
            <p>{item.scaffold}</p>
          </div>
        </aside>
      )}
      <article className="question-card" key={q.id}>
        <p className="question-number">
          QUESTION {String(index + 1).padStart(2, '0')}
        </p>
        <h2 className="question-prompt">
          <MathText>{q.prompt}</MathText>
        </h2>
        {q.passage && !q.prompt.includes(q.passage) && (
          <blockquote>
            <MathText>{q.passage}</MathText>
          </blockquote>
        )}
        {q.diagram && <Diagram spec={q.diagram} />}
        <div className="question-options">
          {q.options?.map((option) => (
            <button
              key={option}
              disabled={revealed}
              onClick={() => setAnswer(option)}
              className={answer === option ? 'chosen' : ''}
            >
              <MathText>{option}</MathText>
            </button>
          ))}
        </div>
        {q.type === 'matching' && (
          <MatchingInput
            question={q}
            value={answer}
            onChange={setAnswer}
            disabled={revealed}
          />
        )}
        {(q.type === 'subjective' ||
          q.type === 'blank' ||
          (isTest && !q.options && q.type !== 'matching')) &&
          !grade && (
            <label className="answer-input-label">
              {q.type === 'subjective' ? '写下你的回答' : '输入答案'}
              <textarea
                disabled={revealed || busy}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={16000}
                placeholder={
                  q.type === 'subjective'
                    ? '用自己的语言组织答案，尽量给出具体依据。'
                    : '输入你的答案'
                }
                rows={q.type === 'subjective' ? 6 : 2}
              />
            </label>
          )}
        {q.type === 'subjective' && !grade && (
          <div className="rubric-preview">
            {q.rubric?.map((r) => (
              <span key={r.id}>
                {r.title} · {r.max} 分
              </span>
            ))}
          </div>
        )}
        {!revealed && !isTest && (
          <div className="confidence-picker">
            <span>作答前，你有多确定？</span>
            {(
              [
                ['sure', '有把握'],
                ['unsure', '犹豫'],
                ['guess', '猜测'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                className={confidence === id ? 'selected' : ''}
                onClick={() => setConfidence(id)}
              >
                {label}
              </button>
            ))}
          </div>
        )}
        {!revealed && !isTest && q.type !== 'subjective' && (
          <div className="reveal-area">
            <button className="primary" onClick={reveal}>
              <Eye size={17} />
              显示答案
            </button>
            <span>
              先独立思考，再揭晓答案 <kbd>Space</kbd>
            </span>
          </div>
        )}
        {!grade && q.type === 'subjective' && (
          <div className="reveal-area">
            <button
              className="primary"
              disabled={busy || !answer.trim() || !aiReady}
              onClick={submitSubjective}
            >
              {busy ? '正在按评分点批改…' : '提交批改'}
              <ArrowRight size={16} />
            </button>
            {!aiReady && (
              <p className="muted">批改连接待配置；你仍可对照参考答案自评。</p>
            )}
            <button
              className="quiet"
              hidden={isTest}
              disabled={busy}
              onClick={reveal}
            >
              对照参考答案自评
            </button>
          </div>
        )}
        {isTest && !revealed && q.type !== 'subjective' && (
          <div className="reveal-area">
            <button
              className="primary"
              disabled={!answer.trim() || busy}
              onClick={() => {
                const right = objectiveScore(q, answer) >= 0.999;
                void record(
                  right ? 'correct' : 'wrong',
                  undefined,
                  right ? 1 : 0,
                );
              }}
            >
              提交，下一题
              <ArrowRight size={16} />
            </button>
            <p className="muted">
              简答自动比对需要与标准答案一致；复杂表达建议选择主观题批改。
            </p>
          </div>
        )}
        {revealed && !answerPanelOpen && !isTest && (
          <div className="reveal-area">
            <button className="primary" onClick={() => setAnswerPanelOpen(true)}>
              <Eye size={17} /> 查看参考答案
            </button>
          </div>
        )}
        {revealed && answerPanelOpen && createPortal(
          <div className="answer-modal-backdrop" onMouseDown={() => setAnswerPanelOpen(false)}>
            <section
              className="answer-modal"
              role="dialog"
              aria-modal="true"
              aria-label="参考答案与核对"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <header className="answer-modal-head">
                <div><span>核对答案</span><small>第 {index + 1} / {session.items.length} 题</small></div>
                <button ref={answerCloseRef} className="quiet" onClick={() => setAnswerPanelOpen(false)} aria-label="关闭参考答案弹窗"><X size={18} /></button>
              </header>
              <div className="answer-reveal">
            {grade ? (
              <>
                <div className="grade-heading">
                  <div>
                    <p className="eyebrow">RUBRIC FEEDBACK</p>
                    <h3>{grade.label}</h3>
                  </div>
                  <strong>
                    {grade.score}
                    <span> / {grade.maxScore}</span>
                  </strong>
                </div>
                {grade.criteria.map((c) => (
                  <div className="criterion" key={c.id}>
                    <div>
                      <b>{q.rubric?.find((r) => r.id === c.id)?.title}</b>
                      <span>
                        {c.score} / {q.rubric?.find((r) => r.id === c.id)?.max}
                      </span>
                    </div>
                    {c.evidence && (
                      <p className="evidence">命中：{c.evidence}</p>
                    )}
                    {c.missing && <p>遗漏：{c.missing}</p>}
                    <p className="muted">{c.suggestion}</p>
                  </div>
                ))}
                <p>{grade.feedback}</p>
                <details>
                  <summary>查看示例答案</summary>
                  <p>{grade.exampleAnswer}</p>
                </details>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    record(
                      grade.score / grade.maxScore >= 0.85
                        ? 'correct'
                        : grade.score / grade.maxScore >= 0.4
                          ? 'unsure'
                          : 'wrong',
                      grade,
                    )
                  }
                >
                  保存反馈，下一题
                  <ArrowRight size={16} />
                </button>
              </>
            ) : (
              <>
                <p className="answer-label">参考答案</p>
                <h3>
                  <MathText>
                    {q.type === 'matching' ? '配对结果' : q.answer}
                  </MathText>
                </h3>
                {q.type === 'matching' &&
                  q.matching?.left.map((l) => (
                    <p key={l.id}>
                      <MathText>
                        {l.text +
                          ' → ' +
                          (q.matching?.right.find(
                            (r) => r.id === JSON.parse(q.answer)[l.id],
                          )?.text ?? '')}
                      </MathText>
                    </p>
                  ))}
                <p className="answer-explanation">
                  <MathText>{q.explanation}</MathText>
                </p>
                {answer && (
                  <p className="answer-check">
                    本次作答：
                    {objectiveScore(q, answer) === 1
                      ? '正确'
                      : objectiveScore(q, answer) > 0
                        ? '部分正确'
                        : '需要订正'}
                    {confidence === 'sure' && objectiveScore(q, answer) < 0.6
                      ? ' · 已发现一个值得校准的信心盲点'
                      : ''}
                  </p>
                )}
                {q.transferFrom && (
                  <details>
                    <summary>迁移挑战 · 对照原题</summary>
                    <p>
                      <MathText>
                        {
                          data.questions.find((x) => x.id === q.transferFrom)
                            ?.prompt
                        }
                      </MathText>
                    </p>
                    <p className="muted">
                      同一种能力，换了情境。比较两题共同的方法。
                    </p>
                  </details>
                )}
                {q.solution?.length && (
                  <>
                    <button
                      className="quiet solution-toggle"
                      onClick={() => setSolution(!solution)}
                    >
                      <ChevronDown size={15} />
                      查看解题过程
                    </button>
                    {solution && (
                      <ol className="solution-steps">
                        {q.solution.map((step, i) => (
                          <li key={i}>
                            <span>STEP {i + 1}</span>
                            <MathText>{step}</MathText>
                          </li>
                        ))}
                      </ol>
                    )}
                  </>
                )}
                <div className="rating-actions">
                  <button
                    className="wrong"
                    disabled={busy}
                    onClick={() => record('wrong')}
                  >
                    <X size={17} />
                    答错<kbd>1</kbd>
                  </button>
                  <button
                    className="unsure"
                    disabled={busy}
                    onClick={() => record('unsure')}
                  >
                    <Minus size={17} />
                    不确定<kbd>2</kbd>
                  </button>
                  <button
                    className="correct"
                    disabled={busy}
                    onClick={() => record('correct')}
                  >
                    <Check size={17} />
                    答对<kbd>3</kbd>
                  </button>
                </div>
              </>
            )}
              </div>
            </section>
          </div>,
          document.body,
        )}
      </article>
      {!isTest && scratchOpen && <Scratchpad key={q.id} onClose={() => setScratchOpen(false)} />}
      <div className="gentle-note">
        <Clock3 size={14} />
        只和自己的昨天相比。
      </div>
    </div>
  );
}

function Scratchpad({ onClose }: { onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [clearCount, setClearCount] = useState(0);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    const resize = () => {
      const ratio = window.devicePixelRatio || 1;
      const width = element.clientWidth;
      const height = element.clientHeight;
      if (!width || !height) return;
      const saved = document.createElement('canvas');
      saved.width = element.width;
      saved.height = element.height;
      saved.getContext('2d')?.drawImage(element, 0, 0);
      element.width = width * ratio;
      element.height = height * ratio;
      const context = element.getContext('2d');
      context?.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (saved.width && saved.height)
        context?.drawImage(saved, 0, 0, saved.width, saved.height, 0, 0, width, height);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element.getContext('2d')?.clearRect(0, 0, element.clientWidth, element.clientHeight);
  }, [clearCount]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  return <aside className="study-scratchpad" aria-label="草稿纸">
    <div className="scratchpad-head"><span>草稿纸</span><div>
      <button onClick={() => setClearCount((n) => n + 1)}>清空</button>
      <button onClick={onClose} aria-label="关闭草稿纸">关闭</button>
    </div></div>
    <canvas ref={canvas} aria-label="可用鼠标或触控笔书写的草稿纸"
      onPointerDown={(event) => {
        drawing.current = true;
        event.currentTarget.setPointerCapture(event.pointerId);
        const p = point(event), context = event.currentTarget.getContext('2d');
        if (!context) return;
        context.beginPath(); context.moveTo(p.x, p.y);
        context.lineWidth = 2; context.lineCap = 'round'; context.lineJoin = 'round';
        context.strokeStyle = '#324238';
      }}
      onPointerMove={(event) => {
        if (!drawing.current) return;
        const p = point(event), context = event.currentTarget.getContext('2d');
        context?.lineTo(p.x, p.y); context?.stroke();
      }}
      onPointerUp={() => { drawing.current = false; }}
      onPointerCancel={() => { drawing.current = false; }}
    />
    <p>仅作当前题的思考草稿，不计入评分。</p>
  </aside>;
}
