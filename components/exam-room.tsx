'use client';
import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Flag,
  Highlighter,
  MoreHorizontal,
  X,
  Check,
  Clock3,
  ChevronDown,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from './ui/dialog';
import { useReview } from './review-context';
import { put, currentNamespace } from '@/lib/store';
import {
  EXAM_FORMAT,
  paperReady,
  examStages,
  stageSlots,
  nextStage,
  expireRun,
  type ExamRun,
  type ExamPaper,
} from '@/lib/exam-model';
import { gradeExam } from '@/lib/exam-client';
import MathText from './math-text';
import NativeExamRoom from './native-exam-room';
import { nativeExamPackage } from '@/lib/exam-native';

function HighlightedPassage({
  text,
  highlights,
}: {
  text: string;
  highlights: string[];
}) {
  const ranges: { start: number; end: number }[] = [];
  for (const h of highlights) {
    if (!h) continue;
    let at = text.indexOf(h);
    while (at >= 0) {
      ranges.push({ start: at, end: at + h.length });
      at = text.indexOf(h, at + h.length);
    }
  }
  ranges.sort((a, b) => a.start - b.start);
  let pos = 0;
  const parts: React.ReactNode[] = [];
  for (const r of ranges) {
    if (r.start < pos) continue;
    parts.push(
      <MathText key={'t' + pos}>{text.slice(pos, r.start)}</MathText>,
      <mark key={'h' + r.start}>{text.slice(r.start, r.end)}</mark>,
    );
    pos = r.end;
  }
  parts.push(<MathText key={'t' + pos}>{text.slice(pos)}</MathText>);
  return <>{parts}</>;
}
const timerText = (seconds: number) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
export default function ExamRoom({ runId }: { runId: string }) {
  const { data } = useReview();
  const run = data.jobs?.find(
    (j) => j.id === runId && j.kind === 'exam-run',
  ) as ExamRun | undefined;
  const paper = data.jobs?.find(
    (j) => j.id === run?.paperId && j.kind === 'exam-paper',
  ) as ExamPaper | undefined;
  if (
    run &&
    paper &&
    ((run.status !== 'complete' && run.native) ||
      (run.native?.finished && !run.native?.showReport))
  )
    return <NativeExamRoom key={runId} run={run} paper={paper} />;
  return <LegacyExamRoom runId={runId} />;
}
function LegacyExamRoom({ runId }: { runId: string }) {
  const { data, refresh, navigate, notify, aiReady } = useReview();
  const initial = data.jobs?.find(
    (j) => j.id === runId && j.kind === 'exam-run',
  ) as ExamRun | undefined;
  const [run, setRun] = useState<ExamRun | undefined>(initial),
    [now, setNow] = useState(Date.now()),
    [tool, setTool] = useState(''),
    [grid, setGrid] = useState(false),
    [confirm, setConfirm] = useState(false),
    [hideTime, setHideTime] = useState(false),
    [zoom, setZoom] = useState(100),
    [reader, setReader] = useState(false),
    [readerY, setReaderY] = useState(150),
    [grading, setGrading] = useState(''),
    [gradeError, setGradeError] = useState(''),
    [saveError, setSaveError] = useState(''),
    [reviewIndex, setReviewIndex] = useState(0);
  const ref = useRef(run),
    namespace = useRef(currentNamespace()),
    writes = useRef(Promise.resolve()),
    timeStart = useRef(Date.now()),
    gradeLock = useRef(false),
    mounted = useRef(true),
    passageRef = useRef<HTMLDivElement>(null),
    visible = useRef(true);
  useEffect(() => {
    if (!ref.current) {
      const found = data.jobs?.find(
        (j) => j.id === runId && j.kind === 'exam-run',
      );
      if (found) {
        ref.current = found;
        setRun(found);
      }
    }
  }, [data.jobs, runId]);
  const paper = data.jobs?.find(
    (j) => j.id === run?.paperId && j.kind === 'exam-paper',
  ) as ExamPaper | undefined;
  const stages = paper ? examStages(paper.exam, paper.options) : [];
  const stage = stages[run?.stage ?? 0];
  const slots = paper && run ? stageSlots(paper, run) : [];
  const slot = slots[run?.index ?? 0];
  const question = data.questions.find(
    (q) => q.id === paper?.questions[slot?.id ?? ''],
  );
  function persist(next: ExamRun) {
    ref.current = next;
    setRun(next);
    const ns = namespace.current;
    writes.current = writes.current
      .catch(() => {})
      .then(() => put('job', next, next.id, false, ns))
      .then(() => {
        if (mounted.current) setSaveError('');
      })
      .catch(() => {
        if (mounted.current)
          setSaveError('本地保存失败，请检查设备空间。请保留此页面后重试。');
      });
  }
  function inTime() {
    const current = ref.current;
    if (!current || !paper || currentNamespace() !== namespace.current)
      return false;
    if (current.status !== 'complete' && Date.now() >= current.deadline) {
      persist(expireRun(paper, current, data.questions));
      timeStart.current = Date.now();
      return false;
    }
    return true;
  }
  function patch(fields: Partial<ExamRun>) {
    const current = ref.current;
    if (!current || !inTime()) return;
    persist({ ...current, ...fields });
  }
  function captureTime() {
    const current = ref.current;
    if (
      !current ||
      !paper ||
      current.status !== 'active' ||
      currentNamespace() !== namespace.current
    )
      return;
    const id = stageSlots(paper, current)[current.index]?.id;
    if (!id) return;
    const delta = !visible.current
      ? 0
      : Math.max(0, Math.min(Date.now(), current.deadline) - timeStart.current);
    timeStart.current = Date.now();
    const timed = {
      ...current,
      times: { ...current.times, [id]: (current.times[id] ?? 0) + delta },
    };
    persist(
      Date.now() >= current.deadline
        ? expireRun(paper, timed, data.questions)
        : timed,
    );
  }
  function move(index: number) {
    if (!inTime()) return;
    captureTime();
    patch({ index });
    setGrid(false);
  }
  function advance() {
    const current = ref.current;
    if (!current || !paper || !inTime()) return;
    captureTime();
    persist(nextStage(paper, ref.current!, data.questions));
    setConfirm(false);
    setGrid(false);
    setTool('');
    timeStart.current = Date.now();
  }
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  useEffect(() => {
    if (!paper || !paperReady(paper, data.questions)) return;
    const id = setInterval(() => {
      const now = Date.now();
      setNow(now);
      const current = ref.current;
      if (!current || current.status === 'complete') return;
      if (now >= current.deadline) {
        captureTime();
        const expired = expireRun(paper, ref.current!, data.questions, now);
        persist(expired);
        setGrid(false);
        setConfirm(false);
        setTool('');
        timeStart.current = now;
      }
    }, 1000);
    const saved = setInterval(captureTime, 10000);
    const pageHide = () => captureTime();
    visible.current = !document.hidden;
    const visibility = () => {
      captureTime();
      visible.current = !document.hidden;
      if (!document.hidden) inTime();
      timeStart.current = Date.now();
    };
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('pagehide', pageHide);
    return () => {
      clearInterval(id);
      clearInterval(saved);
      window.removeEventListener('pagehide', pageHide);
      document.removeEventListener('visibilitychange', visibility);
    };
  }, [paper?.id, data.questions.length]);
  async function flush() {
    await writes.current;
    try {
      const d = ref.current;
      if (d) await put('job', d, d.id, false, namespace.current);
      setSaveError('');
    } catch {
      setSaveError('本地保存尚未完成，请保留页面并重试。');
      throw new Error('保存未完成');
    }
  }
  async function grade() {
    const current = ref.current;
    if (!paper || !current || gradeLock.current) return;
    gradeLock.current = true;
    setGradeError('');
    setGrading('正在整理成绩与解析');
    try {
      await flush();
      const graded = await gradeExam(
        paper,
        current,
        setGrading,
        namespace.current,
      );
      ref.current = graded;
      setRun(graded);
      await refresh();
    } catch (e) {
      setGradeError(e instanceof Error ? e.message : '批改暂未完成');
    } finally {
      setGrading('');
      gradeLock.current = false;
    }
  }
  useEffect(() => {
    if (run?.status === 'complete' && !run.graded) void grade();
  }, [run?.status]);
  if (!run || !paper || paper.format !== EXAM_FORMAT)
    return (
      <div className="exam-empty">
        <h1>未找到这场考试</h1>
        <button className="primary" onClick={() => navigate('subjects', 'ce')}>
          返回 CE
        </button>
      </div>
    );
  const isSAT = paper.exam === 'SAT';
  const remaining = Math.ceil((run.deadline - now) / 1000);
  const all = stages.flatMap((_, i) => stageSlots(paper, run, i));
  const exit = async () => {
    captureTime();
    try {
      await flush();
      await refresh();
      navigate('subjects', 'ce');
    } catch {}
  };
  if (run.status === 'complete') {
    const events = data.events.filter((e) => e.sessionId === run.id);
    const qSlot = all[reviewIndex];
    const q = data.questions.find((q) => q.id === paper.questions[qSlot?.id]);
    const event = events.find((e) => e.questionId === q?.id);
    const correct = events.reduce((n, e) => n + e.score, 0);
    return (
      <main className="exam-report">
        <button className="quiet" onClick={() => void exit()}>
          <ArrowLeft size={16} />
          返回 CE
        </button>
        <p className="eyebrow">TEST COMPLETE</p>
        <h1>{paper.exam} 英语专项模拟报告</h1>
        <p className="muted">
          {events.length}/{all.length} 题已整理 ·{' '}
          {new Date(run.completedAt ?? '').toLocaleString()}
        </p>
        <div className="report-score">
          <strong>
            {events.length ? Math.round((correct / all.length) * 100) : '—'}
            <small>%</small>
          </strong>
          <div>
            本卷得分率
            <p className="muted">本地模拟试卷，不换算官方量表分数。</p>
          </div>
        </div>
        {(grading || gradeError) && (
          <div className="paper-progress" role="status">
            {grading || gradeError}
            {!grading && (
              <button className="secondary" onClick={() => void grade()}>
                继续整理成绩
              </button>
            )}
          </div>
        )}
        <div className="exam-domain-results">
          {stages.map((s, stageIndex) => {
            const stageEvents = events.filter((e) =>
              stageSlots(paper, run, stageIndex).some(
                (x) => paper.questions[x.id] === e.questionId,
              ),
            );
            return (
              <div key={s.id}>
                <b>{s.title}</b>
                <span>
                  {stageEvents.length
                    ? Math.round(
                        (stageEvents.reduce((n, e) => n + e.score, 0) /
                          s.count) *
                          100,
                      ) + '%'
                    : '待整理'}
                </span>
                <small>
                  {s.count} 题 · 用时{' '}
                  {Math.round(
                    stageSlots(paper, run, stageIndex).reduce(
                      (n, x) => n + (run.times[x.id] ?? 0),
                      0,
                    ) / 60000,
                  )}{' '}
                  分钟
                </small>
              </div>
            );
          })}
        </div>
        <section className="exam-review panel">
          <div className="section-head">
            <h2>逐题解析</h2>
            <span>
              {reviewIndex + 1} / {all.length}
            </span>
          </div>
          <div className="exam-question-grid">
            {all.map((s, i) => (
              <button
                key={s.id}
                className={
                  i === reviewIndex
                    ? 'current'
                    : events.find((e) => e.questionId === paper.questions[s.id])
                          ?.score === 1
                      ? 'right'
                      : 'incorrect'
                }
                onClick={() => setReviewIndex(i)}
              >
                {i + 1}
              </button>
            ))}
          </div>
          {q && (
            <article key={q.id}>
              <p className="muted">
                {stages[qSlot.stage].title} · {qSlot.domain}
              </p>
              {q.passage && (
                <blockquote>
                  <MathText>{q.passage}</MathText>
                </blockquote>
              )}
              <h2>
                <MathText>{q.prompt}</MathText>
              </h2>
              {q.options?.map((o, i) => (
                <p key={i} className={q.answer === o ? 'correct-option' : ''}>
                  {String.fromCharCode(65 + i)}. <MathText>{o}</MathText>
                </p>
              ))}
              <p>
                你的回答：
                <MathText>{run.answers[qSlot.id] || '未作答'}</MathText>
              </p>
              <p>
                {q.type === 'subjective' && (
                  <span className="oral-review">
                    <audio
                      controls
                      src={
                        nativeExamPackage(
                          paper,
                          data.questions,
                          data.jobs ?? [],
                          '',
                        ).media[
                          'exam-recording:' +
                            run.id +
                            ':' +
                            stages[qSlot.stage].id +
                            ':' +
                            qSlot.index
                        ]
                      }
                    />
                    <span>对照参考答案自评（有录音时先回听）：</span>
                    {[
                      ['答错', 0],
                      ['不确定', 0.5],
                      ['答对', 1],
                    ].map(([label, score]) => (
                      <button
                        key={label}
                        disabled={!!event || !!grading}
                        className="secondary"
                        onClick={async () => {
                          const next = {
                            ...run,
                            selfScores: {
                              ...run.selfScores,
                              [qSlot.id]: Number(score),
                            },
                          };
                          ref.current = next;
                          setRun(next);
                          await put(
                            'job',
                            next,
                            next.id,
                            false,
                            namespace.current,
                          );
                          await grade();
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </span>
                )}
                <b>参考答案：</b>
                <MathText>{q.answer}</MathText>
              </p>
              <p>
                <MathText>{q.explanation}</MathText>
              </p>
              {q.solution?.map((s, i) => (
                <p key={i}>
                  <b>Step {i + 1} </b>
                  <MathText>{s}</MathText>
                </p>
              ))}
              {event?.grade && (
                <div>
                  <h3>
                    写作反馈 · {event.grade.score}/{event.grade.maxScore}
                  </h3>
                  {event.grade.criteria.map((c) => (
                    <p key={c.id}>
                      <b>
                        {q.rubric?.find((r) => r.id === c.id)?.title} ·{' '}
                        {c.score}
                      </b>
                      <br />
                      {c.missing} {c.suggestion}
                    </p>
                  ))}
                  <p>{event.grade.feedback}</p>
                </div>
              )}
            </article>
          )}
        </section>
        <section className="panel">
          <h2>下一步优先练什么</h2>
          {[...new Set(all.map((s) => s.domain))].map((domain) => {
            const ds = all.filter((s) => s.domain === domain);
            const es = events.filter((e) =>
              ds.some((s) => paper.questions[s.id] === e.questionId),
            );
            if (!es.length) return null;
            const score = es.reduce((n, e) => n + e.score, 0) / es.length;
            return score >= 0.85 ? null : (
              <div className="service-row" key={domain}>
                <span>{domain}</span>
                <b>{Math.round(score * 100)}%</b>
              </div>
            );
          })}
          <p className="muted">
            作答已反馈到对应知识点与能力，错题也已加入错题本。
          </p>
        </section>
      </main>
    );
  }
  if (run.status === 'break')
    return (
      <main className={'exam-break ' + (isSAT ? 'sat-room' : 'act-room')}>
        <p className="eyebrow">{paper.exam} · BREAK</p>
        <h1>Take a break</h1>
        <strong>{timerText(remaining)}</strong>
        <p>The next section will begin automatically when the break ends.</p>
        <p className="muted">上一部分已锁定。休息结束后自动进入下一部分。</p>
        <button className="quiet" onClick={() => void exit()}>
          离开考场（计时继续）
        </button>
      </main>
    );
  if (!question || !slot)
    return (
      <main className="exam-empty">
        <h1>正在读取本地试题</h1>
        <p>同步完整试卷后再继续。计时按照已保存的考场时间计算。</p>
        <button onClick={() => void exit()}>返回 CE</button>
      </main>
    );
  const answer = run.answers[slot.id] ?? '';
  const flags = run.flags[slot.id];
  const eliminated = run.eliminated[slot.id] ?? [];
  const setAnswer = (v: string) =>
    patch({ answers: { ...ref.current!.answers, [slot.id]: v } });
  const mark = () =>
    patch({
      flags: { ...ref.current!.flags, [slot.id]: !ref.current!.flags[slot.id] },
    });
  const saveHighlight = () => {
    const selection = window.getSelection();
    if (
      !selection?.anchorNode ||
      !passageRef.current?.contains(selection.anchorNode)
    )
      return;
    const text = selection.toString().trim().slice(0, 1500);
    if (text) {
      patch({
        highlights: {
          ...run.highlights,
          [slot.id]: [...new Set([...(run.highlights?.[slot.id] ?? []), text])],
        },
      });
      selection.removeAllRanges();
    }
  };

  const time = (
    <div className={'exam-timer ' + (remaining <= 300 ? 'urgent' : '')}>
      <strong>
        {!hideTime || remaining <= 300 ? timerText(remaining) : 'Time hidden'}
      </strong>
      <button onClick={() => setHideTime(!hideTime)}>
        {hideTime ? 'Show' : 'Hide'}
      </button>
    </div>
  );
  const tools = (
    <div className="exam-tools">
      {!isSAT && (
        <div className="act-zoom">
          <button
            aria-label="Zoom in"
            onClick={() => setZoom(Math.min(150, zoom + 5))}
          >
            +
          </button>
          <button aria-label="Reset zoom" onClick={() => setZoom(100)}>
            {zoom}%
          </button>
          <button
            aria-label="Zoom out"
            onClick={() => setZoom(Math.max(85, zoom - 5))}
          >
            −
          </button>
        </div>
      )}
      <button onClick={() => setTool('notes')}>
        <Highlighter size={18} />
        <span>{isSAT ? 'Highlights & Notes' : 'Tools'}</span>
      </button>
      <button aria-label="More tools" onClick={() => setTool('more')}>
        <MoreHorizontal size={21} />
        {isSAT && <span>More</span>}
      </button>
    </div>
  );
  return (
    <div className={'exam-room ' + (isSAT ? 'sat-room' : 'act-room')}>
      <header className="exam-header">
        {isSAT ? (
          <>
            <div>
              <b>{stage.title}</b>
              <button onClick={() => setTool('directions')}>
                Directions <ChevronDown size={13} />
              </button>
            </div>
            {time}
            {tools}
          </>
        ) : (
          <>
            <div className="act-top-nav">
              <button
                disabled={run.index === 0}
                onClick={() => move(run.index - 1)}
              >
                ◀ Prev
              </button>
              <button
                disabled={run.index === slots.length - 1}
                onClick={() => move(run.index + 1)}
              >
                Next ▶
              </button>
              <button onClick={() => setGrid(true)}>Nav</button>
              <b>{stage.section}</b>
            </div>
            {time}
            {tools}
          </>
        )}
      </header>
      {saveError && (
        <div className="exam-storage-error" role="alert">
          {saveError}
          <button onClick={() => persist(ref.current!)}>重试保存</button>
        </div>
      )}
      <div
        className={'exam-body ' + (!question.passage ? 'no-passage' : '')}
        style={{ fontSize: zoom + '%' }}
      >
        {question.passage && (
          <div
            className="exam-passage"
            ref={passageRef}
            onMouseMove={(e) => {
              if (reader)
                setReaderY(
                  e.clientY - e.currentTarget.getBoundingClientRect().top,
                );
            }}
          >
            <div className="passage-tools">
              <button
                className="quiet"
                onMouseDown={(e) => e.preventDefault()}
                onClick={saveHighlight}
              >
                <Highlighter size={14} />
                Highlight selection
              </button>
            </div>
            <div className="exam-passage-text">
              <HighlightedPassage
                text={question.passage}
                highlights={run.highlights?.[slot.id] ?? []}
              />
            </div>
            {reader && <div className="line-reader" style={{ top: readerY }} />}
          </div>
        )}
        <article className="exam-question" key={slot.id}>
          <div className="exam-item-toolbar">
            <b>{run.index + 1}</b>
            <button className={flags ? 'flagged' : ''} onClick={mark}>
              <Flag size={17} fill={flags ? 'currentColor' : 'none'} />
              {isSAT ? 'Mark for Review' : 'Flag'}
            </button>
            <span className="exam-format-label">
              {question.type === 'blank' ? 'Student-produced response' : ''}
            </span>
          </div>
          <h2>
            <MathText>{question.prompt}</MathText>
          </h2>
          {question.options ? (
            <div className="exam-options">
              {question.options.map((o, i) => (
                <div className="exam-option-row" key={i}>
                  <button
                    className={
                      'exam-option ' +
                      (answer === o ? 'selected ' : '') +
                      (eliminated.includes(o) ? 'eliminated' : '')
                    }
                    onClick={() => setAnswer(o)}
                    aria-pressed={answer === o}
                  >
                    <b>{String.fromCharCode(65 + i)}</b>
                    <MathText>{o}</MathText>
                  </button>
                  <button
                    className="eliminate-option"
                    title="Eliminate option"
                    aria-label={'Eliminate ' + String.fromCharCode(65 + i)}
                    onClick={() =>
                      patch({
                        eliminated: {
                          ...run.eliminated,
                          [slot.id]: eliminated.includes(o)
                            ? eliminated.filter((x) => x !== o)
                            : [...eliminated, o],
                        },
                      })
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <>
              <textarea
                className="exam-writing"
                rows={17}
                value={answer}
                onChange={(e) => setAnswer(e.target.value)}
                maxLength={16000}
                aria-label="Essay response"
                placeholder="Write your essay here."
              />
              <p className="muted">
                {answer.trim() ? answer.trim().split(/\s+/).length : 0} words
              </p>
            </>
          )}
        </article>
      </div>
      <footer className="exam-footer">
        {isSAT ? (
          <>
            <span>
              {data.settings.name}
              <small>Practice simulation</small>
            </span>
            <button className="question-menu" onClick={() => setGrid(true)}>
              Question {run.index + 1} of {slots.length}
              <ChevronDown size={16} />
            </button>
            <div>
              <button
                className="exam-back"
                disabled={run.index === 0}
                onClick={() => move(run.index - 1)}
              >
                Back
              </button>
              <button
                className="exam-next"
                onClick={() =>
                  run.index < slots.length - 1
                    ? move(run.index + 1)
                    : setGrid(true)
                }
              >
                Next
              </button>
            </div>
          </>
        ) : (
          <>
            <button className={flags ? 'flagged' : ''} onClick={mark}>
              <Flag size={16} />
              Flag
            </button>
            <div className="act-question-strip">
              {slots.map((s, i) => (
                <button
                  key={s.id}
                  onClick={() => move(i)}
                  className={
                    (i === run.index ? 'current ' : '') +
                    (run.answers[s.id] ? 'answered ' : '') +
                    (run.flags[s.id] ? 'flagged' : '')
                  }
                >
                  {i + 1}
                </button>
              ))}
            </div>
            <button onClick={() => setGrid(true)}>Review</button>
          </>
        )}
      </footer>
      <Dialog open={grid} onOpenChange={setGrid}>
        <DialogContent className="exam-nav-dialog">
          <DialogTitle>Check Your Work</DialogTitle>
          <DialogDescription>
            {stage.title} ·{' '}
            {slots.filter((s) => !run.answers[s.id]?.trim()).length} unanswered
          </DialogDescription>
          <div className="exam-question-grid">
            {slots.map((s, i) => (
              <button
                key={s.id}
                onClick={() => move(i)}
                className={
                  (run.index === i ? 'current ' : '') +
                  (run.answers[s.id] ? 'answered ' : '') +
                  (run.flags[s.id] ? 'flagged' : '')
                }
              >
                {i + 1}
                {run.flags[s.id] && <Flag size={10} />}
              </button>
            ))}
          </div>
          <p className="muted">Filled: answered · Flag: marked for review</p>
          <button
            className="exam-next"
            disabled={!isSAT && remaining > 0}
            onClick={() => {
              setGrid(false);
              setConfirm(true);
            }}
          >
            {run.stage === stages.length - 1 ? 'Submit Test' : 'End Module'}
          </button>
          {!isSAT && (
            <p className="muted">
              ACT 部分结束前可检查答案；时间到后自动进入下一部分。
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={confirm} onOpenChange={setConfirm}>
        <DialogContent>
          <DialogTitle>
            {run.stage === stages.length - 1
              ? 'Submit Test?'
              : 'End this module?'}
          </DialogTitle>
          <DialogDescription>
            You will not be able to return to this module.{' '}
            {slots.filter((s) => !run.answers[s.id]).length} questions are
            unanswered.
          </DialogDescription>
          <div className="button-row">
            <button className="secondary" onClick={() => setConfirm(false)}>
              Keep working
            </button>
            <button className="exam-next" onClick={advance}>
              Confirm
            </button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!tool}
        onOpenChange={(v) => {
          if (!v) setTool('');
        }}
      >
        <DialogContent className="exam-tool-dialog">
          <DialogTitle>
            {{
              notes: 'Highlights & Notes',
              directions: 'Directions',
              more: 'More tools',
            }[tool] ?? 'Tools'}
          </DialogTitle>
          <DialogDescription>{stage.title}</DialogDescription>
          {tool === 'notes' && (
            <>
              <p className="muted">
                Select passage text, then use Highlight selection. Your
                highlights and notes are saved automatically.
              </p>
              {run.highlights?.[slot.id]?.map((text, i) => (
                <p key={i} className="saved-highlight">
                  <mark>{text}</mark>
                  <button
                    aria-label="Remove highlight"
                    onClick={() =>
                      patch({
                        highlights: {
                          ...run.highlights,
                          [slot.id]: run.highlights![slot.id].filter(
                            (_, j) => j !== i,
                          ),
                        },
                      })
                    }
                  >
                    <X size={13} />
                  </button>
                </p>
              ))}
              <textarea
                rows={9}
                value={run.notes[slot.id] ?? ''}
                onChange={(e) =>
                  patch({ notes: { ...run.notes, [slot.id]: e.target.value } })
                }
                placeholder="Notes for this question"
                maxLength={6000}
              />
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={reader}
                  onChange={(e) => setReader(e.target.checked)}
                />
                Line reader
              </label>
            </>
          )}
          {tool === 'directions' && (
            <>
              <p>
                {stage.section === 'Writing'
                  ? 'Write an essay developing your perspective and its relationship to the perspectives provided.'
                  : 'Read each passage and question carefully, then select the best answer.'}
              </p>
              <p>
                You may revisit questions in the current{' '}
                {isSAT ? 'module' : 'section'}. Answers are saved automatically.
                When time expires, the current {isSAT ? 'module' : 'section'} is
                locked.
              </p>
              <p>
                Explanations are available after the entire test has been
                submitted.
              </p>
            </>
          )}
          {tool === 'more' && (
            <>
              <label>
                Text size · {zoom}%
                <input
                  type="range"
                  min="85"
                  max="150"
                  step="5"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
              </label>
              <label className="check-inline">
                <input
                  type="checkbox"
                  checked={reader}
                  onChange={(e) => setReader(e.target.checked)}
                />
                Line reader
              </label>
              <button className="secondary" onClick={() => void exit()}>
                离开考场（计时继续）
              </button>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
