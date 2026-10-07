'use client';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useReview } from './review-context';
import { currentNamespace, put, saveRecords } from '@/lib/store';
import { type AnswerEvent, type Question, localDay, uid } from '@/lib/model';
import { objectiveScore } from '@/lib/question-tools';
import {
  pressureQuestions,
  pressureReport,
  learningSchedule,
} from '@/lib/learning-intelligence';
import MatchingInput from './matching-input';
import MathText from './math-text';
import Diagram from './diagram';

type Run = {
  id: string;
  kind: 'pressure';
  status: 'active' | 'complete';
  subject?: string;
  questions: Question[];
  startedAt: string;
  deadline: number;
  answers: Record<string, string>;
  timings: Record<string, number>;
  index: number;
  eventIds?: string[];
};
export default function PressureLab({ subject }: { subject?: string }) {
  const { data, states, refresh, notify } = useReview();
  const [open, setOpen] = useState(false),
    [run, setRun] = useState<Run | null>(null),
    [busy, setBusy] = useState(false),
    [remaining, setRemaining] = useState(0);
  const origin = useRef(currentNamespace()),
    timerStart = useRef(0),
    gate = useRef(false);
  const writes = useRef(Promise.resolve());
  const pressureKey = 'pressure:active:' + (subject ?? 'all');
  const live = useRef<Run | null>(run);
  live.current = run;
  const exam = data.exams
    .filter(
      (e) =>
        (!subject || e.subject === subject) &&
        Date.parse(e.date + 'T23:59:59') >= Date.now(),
    )
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  const available = pressureQuestions(data, states, subject, exam?.scope ?? []);
  const saved = data.jobs?.find(
    (j) =>
      j.kind === 'pressure' && j.status === 'active' && j.subject === subject,
  ) as Run | undefined;
  const q = run?.questions[run.index];
  const save = async (next: Run) => {
    if (currentNamespace() !== origin.current)
      throw new Error('账户已切换，请返回当前学习空间');
    await writes.current.catch(() => {});
    await put('job', next, pressureKey, false, origin.current);
    setRun(next);
  };
  function snapshot() {
    const value = live.current;
    if (!value || value.status !== 'active') return value;
    const question = value.questions[value.index];
    const ms = Math.max(0, performance.now() - timerStart.current);
    return {
      ...value,
      timings: {
        ...value.timings,
        [question.id]: (value.timings[question.id] ?? 0) + ms,
      },
    };
  }
  async function launch() {
    if (gate.current) return;
    origin.current = currentNamespace();
    if (saved) {
      setRun(saved);
      timerStart.current = performance.now();
      setOpen(true);
      return;
    }
    if (!available.length) return;
    gate.current = true;
    setBusy(true);
    const seconds = Math.max(
      120,
      Math.min(
        1200,
        Math.round(available.reduce((s, q) => s + q.expectedSeconds, 0) * 0.8),
      ),
    );
    const next: Run = {
      id: 'pressure:' + uid(),
      kind: 'pressure',
      status: 'active',
      subject,
      questions: available,
      startedAt: new Date().toISOString(),
      deadline: Date.now() + seconds * 1000,
      answers: {},
      timings: {},
      index: 0,
    };
    try {
      await save(next);
      timerStart.current = performance.now();
      setOpen(true);
    } catch (e) {
      notify(e instanceof Error ? e.message : '未能保存测试');
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  async function submit() {
    if (gate.current || !live.current || live.current.status !== 'active')
      return;
    gate.current = true;
    setBusy(true);
    try {
      if (currentNamespace() !== origin.current)
        throw new Error('账户已切换，未写入其他空间');
      await writes.current.catch(() => {});
      const current = snapshot()!,
        occurredAt = new Date().toISOString(),
        expired = Date.now() >= current.deadline;
      const events: AnswerEvent[] = current.questions.map((question, index) => {
        const answer = current.answers[question.id] ?? '',
          score = answer ? objectiveScore(question, answer) : 0;
        const schedule = learningSchedule(data, question);
        return {
          id: current.id + ':' + index,
          questionId: question.id,
          nodeId: question.nodeId,
          skillId: question.skillId,
          subject: question.subject,
          score,
          outcome:
            score >= 0.85 ? 'correct' : score >= 0.4 ? 'unsure' : 'wrong',
          source: 'test',
          answer,
          occurredAt,
          displayedAt: current.startedAt,
          revealedAt: occurredAt,
          activeThinkMs: Math.round(current.timings[question.id] ?? 0),
          expectedSeconds: question.expectedSeconds,
          difficulty: question.difficulty,
          variant: question.variant,
          usedHint: false,
          reason: '考前压力测试',
          sessionId: current.id,
          localDay: localDay(),
          version: 1,
          evidenceWeight: 0.8,
          learningEvidence: {
            version: 1,
            assessment: 'objective',
            pressure: true,
            timedOut: expired && !answer,
            policy: schedule.policy,
            memoryFamily: schedule.family,
            intervalFactor: schedule.factor,
            cognitiveAttributes: schedule.cognitiveAttributes,
            conceptIds: schedule.conceptIds,
            contextId: schedule.contextId,
          },
        };
      });
      const completed: Run = {
        ...current,
        status: 'complete',
        eventIds: events.map((e) => e.id),
      };
      const test = {
        id: 'test:' + current.id,
        title: '考前压力测试',
        subject: subject ?? 'all',
        sessionId: current.id,
        eventIds: events.map((e) => e.id),
        at: occurredAt,
        scope: [...new Set(events.map((e) => e.nodeId))],
      };
      await saveRecords(
        [
          ...events.map((payload) => ({
            id: payload.id,
            kind: 'event' as const,
            payload,
            updated_at: occurredAt,
            deleted: false,
          })),
          {
            id: test.id,
            kind: 'test',
            payload: test,
            updated_at: occurredAt,
            deleted: false,
          },
          {
            id: pressureKey,
            kind: 'job',
            payload: completed,
            updated_at: occurredAt,
            deleted: false,
          },
        ],
        true,
        origin.current,
      );
      setRun(completed);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '交卷未完成，作答已保留');
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  useEffect(() => {
    if (!open || run?.status !== 'active') return;
    const update = () => {
      if (currentNamespace() !== origin.current) {
        setOpen(false);
        return;
      }
      setRemaining(
        Math.max(0, Math.ceil((live.current!.deadline - Date.now()) / 1000)),
      );
      if (Date.now() >= live.current!.deadline) void submit();
    };
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [open, run?.id, run?.status]);
  useEffect(() => {
    if (!open || run?.status !== 'active') return;
    const id = window.setTimeout(() => {
      if (
        currentNamespace() === origin.current &&
        live.current?.status === 'active' &&
        !gate.current
      ) {
        const next = snapshot()!;
        writes.current = writes.current
          .catch(() => {})
          .then(async () => {
            if (!gate.current)
              await put('job', next, pressureKey, false, origin.current);
          })
          .catch(() => notify('自动保存未完成，请保留当前页面'));
      }
    }, 300);
    return () => window.clearTimeout(id);
  }, [run, open]);
  useEffect(() => {
    if (!open || run?.status !== 'active') return;
    const checkpoint = () => {
      if (
        gate.current ||
        currentNamespace() !== origin.current ||
        live.current?.status !== 'active'
      )
        return;
      const next = snapshot()!;
      writes.current = writes.current
        .catch(() => {})
        .then(async () => {
          if (!gate.current)
            await put('job', next, pressureKey, false, origin.current);
        })
        .catch(() => notify('自动保存未完成，请保留当前页面'));
    };
    const interval = window.setInterval(checkpoint, 10000);
    window.addEventListener('pagehide', checkpoint);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('pagehide', checkpoint);
    };
  }, [open, run?.id, run?.status]);
  async function close() {
    try {
      const value = snapshot();
      if (value?.status === 'active') await save(value);
      setOpen(false);
      await refresh();
    } catch (e) {
      notify(e instanceof Error ? e.message : '未能保存');
    }
  }
  const tested = run?.eventIds
    ? data.events.filter((e) => run.eventIds!.includes(e.id))
    : [];
  const report = pressureReport(data, tested);
  const updateAnswer = (id: string, answer: string) => {
    if (
      !run ||
      busy ||
      gate.current ||
      Date.now() >= run.deadline ||
      currentNamespace() !== origin.current
    )
      return;
    setRun({ ...run, answers: { ...run.answers, [id]: answer } });
  };
  return (
    <>
      <div className="intelligence-action-row">
        <div>
          <h3>考前压力测试</h3>
          <p className="muted">
            限时连续作答，交卷后对照同能力、近难度的日常表现。
            {exam ? `范围：${exam.title}` : '优先选择薄弱能力'}
            。退出后计时继续。
          </p>
        </div>
        <button
          className="secondary"
          disabled={busy || (!saved && !available.length)}
          onClick={launch}
        >
          {saved ? '恢复测试' : '开始压力测试'}
        </button>
      </div>
      {!available.length && !saved && (
        <p className="muted">
          导入选择、填空或连线题后可开始。拼音题保持手动核对。
        </p>
      )}
      {open &&
        run &&
        createPortal(
          <div
            className="pressure-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="考前压力测试"
          >
            <header className="pressure-head">
              <b>考前压力测试</b>
              <span>
                {run.status === 'active'
                  ? `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} · ${run.index + 1} / ${run.questions.length}`
                  : '测试报告'}
              </span>
              <button onClick={close}>
                {run.status === 'active' ? '保存并退出' : '关闭报告'}
              </button>
            </header>
            <main className="pressure-content">
              {run.status === 'complete' ? (
                <>
                  <h1>压力下的能力表现</h1>
                  <p className="muted">
                    单次结果用于识别信号，不能证明压力造成失分。缺少跨天的可比日常记录时，不作归因。
                  </p>
                  {report.map((r) => (
                    <article className="pressure-result" key={r.key}>
                      <h3>
                        {r.title} · {r.skill}
                      </h3>
                      <b>{r.status}</b>
                      <p>
                        本次 {Math.round(r.pressured * 100)}% · 日常{' '}
                        {r.normalCount
                          ? `${Math.round(r.ordinary * 100)}%（${r.normalCount} 次）`
                          : '暂无可比记录'}
                        {r.timedOut ? ' · 包含超时未答题' : ''}
                      </p>
                    </article>
                  ))}
                  <h2>逐题对照</h2>
                  {run.questions.map((question) => (
                    <details key={question.id}>
                      <summary>{question.prompt.slice(0, 100)}</summary>
                      <p>
                        本次作答：
                        <MathText>
                          {run.answers[question.id] || '未作答'}
                        </MathText>
                      </p>
                      <p>
                        参考答案：<MathText>{question.answer}</MathText>
                      </p>
                      <MathText>{question.explanation}</MathText>
                    </details>
                  ))}
                </>
              ) : (
                q && (
                  <>
                    <p className="eyebrow">连续作答 · 答案在交卷后公开</p>
                    <h2>
                      <MathText>{q.prompt}</MathText>
                    </h2>
                    {q.passage && (
                      <blockquote>
                        <MathText>{q.passage}</MathText>
                      </blockquote>
                    )}
                    {q.diagram && <Diagram spec={q.diagram} />}
                    <div className="question-options">
                      {q.options?.map((option) => (
                        <button
                          key={option}
                          disabled={busy}
                          className={
                            run.answers[q.id] === option ? 'chosen' : ''
                          }
                          onClick={() => updateAnswer(q.id, option)}
                        >
                          <MathText>{option}</MathText>
                        </button>
                      ))}
                    </div>
                    {q.type === 'blank' && (
                      <label>
                        输入答案
                        <input
                          disabled={busy}
                          value={run.answers[q.id] ?? ''}
                          onChange={(e) => updateAnswer(q.id, e.target.value)}
                        />
                      </label>
                    )}
                    {q.type === 'matching' && (
                      <MatchingInput
                        question={q}
                        disabled={busy}
                        value={run.answers[q.id] ?? ''}
                        onChange={(answer) => updateAnswer(q.id, answer)}
                      />
                    )}
                    <footer className="pressure-actions">
                      <button
                        disabled={busy}
                        className="secondary"
                        onClick={submit}
                      >
                        提前交卷
                      </button>
                      <button
                        disabled={busy}
                        className="primary"
                        onClick={async () => {
                          if (run.index + 1 >= run.questions.length) {
                            await submit();
                            return;
                          }
                          try {
                            const next = {
                              ...snapshot()!,
                              index: run.index + 1,
                            };
                            await save(next);
                            timerStart.current = performance.now();
                          } catch (e) {
                            notify(e instanceof Error ? e.message : '未能保存');
                          }
                        }}
                      >
                        {run.index + 1 >= run.questions.length
                          ? '交卷'
                          : run.answers[q.id]
                            ? '下一题'
                            : '跳过此题'}
                      </button>
                    </footer>
                  </>
                )
              )}
            </main>
          </div>,
          document.body,
        )}
    </>
  );
}
