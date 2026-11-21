'use client';
import {NaviButton,openNavi} from './navi-workspace';
import NaviLearningWorkspace from './navi-learning-workspace';
import {subjectLabel as subjectName} from '@/lib/presentation';
import {tr} from '@/lib/i18n';
import MathText from './math-text';
import GuidedQuestionPrompt from './guided-question-prompt';
import MatchingInput from './matching-input';
import {matchingSignature} from '@/lib/matching';
import MathAnswerComposer from './math-answer-input';
import {supportsMathInput,type MathAnswerFormat} from '@/lib/math-input-format';
import {verifyMathAnswer,type MathVerification} from '@/lib/math-verification';
import { objectiveScore, isPinyin } from '@/lib/question-tools';
import { questionTopicTitle } from '@/lib/pinyin-collections';
import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronDown,
  Eye,
  Minus,
  MoreHorizontal,
  PencilLine,
  X,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useReview } from './review-context';
import { buildQueue } from '@/lib/engine';
import {
  guessingSignals,
  learningSchedule,
  objective,
  verificationCandidate,
} from '@/lib/learning-intelligence';
import {type QueueItem,type AnswerEvent,type Grade,uid,localDay,SUBJECTS} from '@/lib/model';
import {
  put,
  saveRecords,
  currentNamespace,
  completeActiveSession,
} from '@/lib/store';
import { gradeAnswer } from '@/lib/ai-client';
import QuestionVisual from './question-visual';
import { Empty, Heading } from './shared';
import QuestionReviewButton from './question-review';
import ProcessNotebook from './process-notebook';
import { RemediationLauncher } from './remediation-course';
import { createLearningTimer } from '@/lib/learning-timer';
import { errorCauseEstimate } from '@/lib/learning-evidence';
import { trackProductEvent } from '@/lib/product-insights';
export default function StudyView({
  session,
  finish,
  sprint = false,
  savedExit = finish,
}: {
  session: {
    id: string;
    items: QueueItem[];
    mode: 'review' | 'test';
    title: string;
  } | null;
  finish: () => void;
  sprint?: boolean;
  savedExit?: () => void;
}) {
  const { data, start, refresh, notify, aiReady, navigate } = useReview();
  const [processHint, setProcessHint] = useState(false);
  const [hintLevel, setHintLevel] = useState<AnswerEvent['hintLevel']>();
  const activeTimer = useRef(createLearningTimer(performance.now()));
  const [index, setIndex] = useState(0),
    [focusMode, setFocusMode] = useState(!sprint),
    [scratchOpen, setScratchOpen] = useState(false),
    [revealed, setRevealed] = useState(false),
    [answerPanelOpen, setAnswerPanelOpen] = useState(false),
    [solution, setSolution] = useState(false),
    [answer, setAnswer] = useState(''),
    [answerFormat,setAnswerFormat]=useState<MathAnswerFormat>('text'),
    [grade, setGrade] = useState<Grade | null>(null),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [selectedSubjects, setSelectedSubjects] = useState<string[]>([]),
    [results, setResults] = useState<AnswerEvent[]>([]);
  const [confidence, setConfidence] = useState<
    'sure' | 'unsure' | 'guess' | undefined
  >();
  const lock = useRef(false);
  const [mathCheck,setMathCheck]=useState<MathVerification|null>(null),[mathChecking,setMathChecking]=useState(false);
  const [confirmedRating, setConfirmedRating] = useState<AnswerEvent['outcome'] | null>(null);
  const [leavingFeedback, setLeavingFeedback] = useState(false);
  const feedbackShownAt = useRef<number | null>(null);
  const mathToken=useRef(0);
  const stageRef = useRef<HTMLElement>(null);
  const completionTitle = useRef<HTMLHeadingElement>(null);
  const answerCloseRef = useRef<HTMLButtonElement>(null);
  const solutionId = useId();
  const originNamespace = useRef(currentNamespace());
  const [extraItems, setExtraItems] = useState<QueueItem[]>([]);
  const sessionItems = extraItems.length ? extraItems : (session?.items ?? []);
  const timing = useRef({
    displayed: '',
    revealed: '',
    active: 0,
    wall: 0,
    idle: 0,
    start: 0,
    visible: true,
  });
  useEffect(() => {
    setFocusMode(!sprint && localStorage.getItem('review-focus-mode') !== 'classic');
  }, [sprint]);
  const toggleFocus = () => {
    if (sprint) return;
    setFocusMode((current) => {
      localStorage.setItem('review-focus-mode', current ? 'classic' : 'focus');
      return !current;
    });
  };
  const item = sessionItems[index];
  const q = item?.question;
  const node = data.nodes.find((n) => n.id === q?.nodeId);
  const reset = () => {
    mathToken.current++;setMathCheck(null);setMathChecking(false);
    setProcessHint(false);
    setHintLevel(undefined);
    activeTimer.current = createLearningTimer(performance.now());
    setRevealed(false);
    setAnswerPanelOpen(false);
    setSolution(false);
    setAnswer('');
    setAnswerFormat(q&&supportsMathInput(q.subject,q.type)&&q.type==='blank'?'latex':'text');
    setGrade(null);
    setConfidence(undefined);
    timing.current = {
      displayed: new Date().toISOString(),
      revealed: '',
      active: 0,
      wall: 0,
      idle: 0,
      start: performance.now(),
      visible: !document.hidden,
    };
  };
  useEffect(() => {
    const persisted = data.jobs?.find(
      (j) =>
        j.kind === 'session' && j.id === session?.id && Array.isArray(j.items),
    );
    const restoredItems: QueueItem[] = persisted?.items ?? session?.items ?? [];
    setExtraItems(restoredItems);
    const saved = data.events
      .filter((e) => e.sessionId === session?.id)
      .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    if (sprint) {
      const answered = new Set(saved.map(e => e.questionId));
      const next = restoredItems.findIndex(i => !answered.has(i.question.id));
      setIndex(Math.max(0, next));
      setDone(next < 0);
    } else {
      setIndex(saved.length);
      setDone(!!session && saved.length >= restoredItems.length);
    }
    setResults(saved);
    originNamespace.current = currentNamespace();
    reset();
  }, [session?.id]);
  useEffect(() => {
    reset();
    const draft = data.jobs?.find(
      (j) => j.id === 'draft:' + session?.id + ':' + q?.id,
    );
    if (draft&&(q?.type!=='matching'||!draft.matchingSignature||draft.matchingSignature===matchingSignature(q))) {
      setAnswer(draft.answer ?? '');
      setAnswerFormat(draft.answerFormat??'text');
      if (draft.grade) {
        setGrade(draft.grade);
        setRevealed(true);
        setAnswerPanelOpen(true);
      }
    }
  }, [index,q?.id,session?.id]);
  const draftWrite=useRef<{timer:ReturnType<typeof setTimeout>;save:()=>void}|null>(null);
  useEffect(()=>()=>{if(draftWrite.current){clearTimeout(draftWrite.current.timer);draftWrite.current.save();draftWrite.current=null;}},[q?.id]);
  function changeAnswer(value:string,format:MathAnswerFormat=answerFormat){
    setAnswer(value);setAnswerFormat(format);
    if(!q||!session||currentNamespace()!==originNamespace.current)return;
    if(draftWrite.current)clearTimeout(draftWrite.current.timer);
    const id='draft:'+session.id+':'+q.id,ns=originNamespace.current;
    const save=()=>{void put('job',{id,status:'draft',questionId:q.id,answer:value,answerFormat:format,...(q.type==='matching'?{matchingSignature:matchingSignature(q)}:{})},id,false,ns).catch(()=>notify(tr("study:答案草稿暂未保存，请保留当前页面")));};
    draftWrite.current={save,timer:setTimeout(()=>{save();draftWrite.current=null;},350)};
  }
  const mathematicalBlank=q?.type==='blank'&&['math','physics'].includes(q.subject);
  const guided = focusMode && session?.mode === 'review' && !sprint;
  useLayoutEffect(() => {
    if (!done || !guided) return;
    if (stageRef.current) stageRef.current.scrollTop = 0;
    completionTitle.current?.focus({ preventScroll: true });
  }, [done, guided]);
  const checked = !guided || !q || !revealed || !answer.trim() ? null
    : grade && grade.maxScore > 0 ? grade.score / grade.maxScore
    : mathematicalBlank ? mathCheck?.status === 'equivalent' ? 1 : mathCheck?.status === 'not-equivalent' ? 0 : null
    : q.type !== 'subjective' && q.type !== 'recall' ? objectiveScore(q, answer) : null;
  const hasScoredFeedback = checked !== null;
  useEffect(() => {
    feedbackShownAt.current = hasScoredFeedback ? performance.now() : null;
  }, [hasScoredFeedback, index, session?.id]);
  async function checkMath(){
    if(!q||!mathematicalBlank)return null;
    const token=++mathToken.current;setMathChecking(true);
    let result:MathVerification;
    const identical=[q.answer,...(q.acceptedAnswers??[])].some(a=>a.trim()===answer.trim());
    if(identical)result={status:'equivalent',method:'exact-reference',assumptions:[]};
    else result=await verifyMathAnswer(answer,q.answer,{studentFormat:answerFormat==='latex'?'latex':'text',referenceFormat:q.answerFormat==='latex'?'latex':'text'});
    // A different accepted answer may be valid. Failure against only the first
    // reference never certifies that every accepted alternative is wrong.
    if(result.status==='not-equivalent'&&q.acceptedAnswers?.length)result={...result,status:'undetermined',reason:'存在多个可接受答案，请对照完整答案核验'};
    if(token===mathToken.current){setMathCheck(result);setMathChecking(false);}return result;
  }
  useEffect(()=>{if(revealed&&mathematicalBlank&&answer.trim())void checkMath();},[revealed,q?.id]);
  useEffect(() => {
    const visibility = () => {
      const t = timing.current;
      activeTimer.current.visibility(!document.hidden, performance.now());
      if (t.visible && !t.revealed) t.active += performance.now() - t.start;
      t.visible = !document.hidden;
      t.start = performance.now();
    };
    const activity = () => {
      if (!timing.current.revealed)
        activeTimer.current.activity(performance.now());
    };
    document.addEventListener('visibilitychange', visibility);
    for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
      document.addEventListener(name, activity, { passive: true });
    return () => {
      document.removeEventListener('visibilitychange', visibility);
      for (const name of ['pointerdown', 'keydown', 'wheel', 'touchstart'])
        document.removeEventListener(name, activity);
    };
  }, []);
  function reveal() {
    const t = timing.current;
    if (!t.revealed) {
      if (t.visible) t.active += performance.now() - t.start;
      const sample = activeTimer.current.snapshot(performance.now());
      t.active = sample.activeThinkMs;
      t.wall = sample.wallTimeMs;
      t.idle = sample.idleMs;
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
        const sample = activeTimer.current.snapshot(performance.now());
        t.active = sample.activeThinkMs;
        t.wall = sample.wallTimeMs;
        t.idle = sample.idleMs;
        t.revealed = new Date().toISOString();
      }
      if (
        !g &&
        !isPinyin(q) &&
        answer.trim() &&
        ['choice', 'blank', 'matching'].includes(q.type)
      ) {
        const mathematical=mathematicalBlank?(mathCheck??await checkMath()):null;
        const actual = mathematical?(mathematical.status==='equivalent'?1:mathematical.status==='not-equivalent'?0:undefined):objectiveScore(q, answer);
        if(actual!==undefined){
        autoScore =
          outcome === 'wrong'
            ? 0
            : outcome === 'unsure'
              ? Math.min(0.5, actual)
              : actual;
        outcome =
          autoScore >= 0.85 ? 'correct' : autoScore >= 0.4 ? 'unsure' : 'wrong';
        }
      }
      const schedule = learningSchedule(data, q);
      const e: AnswerEvent = {
        id: 'answer:' + session.id + ':' + (sprint ? q.id : index),
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
        matchingSnapshot:q.type==='matching'?{matching:q.matching!,reference:q.answer,questionVersion:q.version}:undefined,
        answerFormat,
        occurredAt: new Date().toISOString(),
        displayedAt: t.displayed,
        revealedAt: t.revealed,
        activeThinkMs: Math.round(t.active),
        wallTimeMs: t.wall,
        idleMs: t.idle,
        hintLevel:
          hintLevel ??
          (item?.scaffold ? 'method' : processHint ? 'step' : undefined),
        expectedSeconds: q.expectedSeconds,
        difficulty: q.difficulty,
        variant: q.variant,
        usedHint:
          !!hintLevel ||
          !!item?.scaffold ||
          processHint ||
          !!data.jobs?.some(
            (j) =>
              j.kind === 'process-evidence' &&
              j.questionId === q.id &&
              j.sessionId === session.id &&
              !j.afterReveal,
          ),
        reason: item?.reason ?? '复习',
        sessionId: session.id,
        localDay: localDay(),
        version: 1,
        predictedConfidence: confidence,
        learningEvidence: {
          version: 1,
          assessment: g
            ? 'rubric'
            : objective(q) && answer.trim()
              ? 'objective'
              : 'self',
          verificationOf: item?.verificationOf,
          remediationId: item?.remediationId,
          remediationGroup: item?.remediationGroup,
          remediationPhase: item?.remediationPhase,
          policy: schedule.policy,
          intervalFactor: schedule.factor,
          memoryFamily: schedule.family,
          cognitiveAttributes: schedule.cognitiveAttributes,
          conceptIds: schedule.conceptIds,
          contextId: schedule.contextId,
          transferFrom: schedule.transferFrom,
          predictedSuccess: item?.predictedSuccess,
        },
      };
      if (e.score < 0.85) e.errorCause = errorCauseEstimate(e, data.events);
      const signals = guessingSignals(q, e, data.events);
      if (signals.length) {
        e.learningEvidence!.suspect = true;
        e.learningEvidence!.signals = signals;
        e.evidenceWeight = 0.3;
      }
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
      const fresh = await (
        await import('@/lib/store')
      ).loadData(originNamespace.current);
      if (fresh.questions.find((x) => x.id === q.id)?.reviewStatus === 'paused')
        throw new Error('这道题已暂停，请保存退出后重新安排练习');
      await put('event', e, e.id, false, originNamespace.current);
      const all = [...results, e];
      setResults(all);
      let nextItems = sessionItems;
      const verifying = sessionItems.some((x) => x.verificationOf);
      if (!sprint && session.mode !== 'test' && signals.length && !verifying) {
        const variant = verificationCandidate(
          { ...data, events: [...data.events, e] },
          e,
          sessionItems.slice(0, index + 1).map((x) => x.question.id),
        );
        if (variant) {
          nextItems = [...sessionItems];
          const existing = nextItems.findIndex(
            (x, i) => i > index && x.question.id === variant.id,
          );
          if (existing >= 0) nextItems.splice(existing, 1);
          nextItems.splice(Math.min(index + 3, nextItems.length), 0, {
            question: variant,
            reason: '变式交叉验证',
            priority: 1,
            verificationOf: e.id,
          });
          await put(
            'job',
            {
              ...session,
              items: nextItems,
              kind: 'session',
              status: 'active',
              createdAt: t.displayed,
            },
            'active-session',
            false,
            originNamespace.current,
          );
          setExtraItems(nextItems);
        }
      }
      if (guided) {
        if (!hasScoredFeedback) setConfirmedRating(outcome);
        const elapsed = feedbackShownAt.current === null ? 0 : performance.now() - feedbackShownAt.current;
        const remaining = Math.max(0, 1600 - elapsed);
        if (remaining) await new Promise<void>(resolve => window.setTimeout(resolve, remaining));
        setLeavingFeedback(true);
        if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
          await new Promise<void>(resolve => window.setTimeout(resolve, 320));
        }
      }
      if (index + 1 >= nextItems.length) {
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
        if (!sprint) await completeActiveSession(session.id, originNamespace.current);
        trackProductEvent('practice_complete', 'study');
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
      setConfirmedRating(null);
      setLeavingFeedback(false);
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
          answerFormat,
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
          answerFormat,
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
    const close = answerCloseRef.current;
    close?.focus({ preventScroll: true });
    if (close?.closest('.guided-answer')) {
      close.scrollIntoView?.({
        block: 'nearest',
        inline: 'nearest',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
      });
    }
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
          ['INPUT', 'TEXTAREA','MATH-FIELD'].includes((e.target as HTMLElement)?.tagName) ||
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
      subjects: selectedSubjects,
    });
    return (
      <>
        <Heading
          eyebrow="STUDY SESSION"
          title={tr("study:给回忆，一点专注。")}
          description={tr("study:想一想，揭晓答案，再如实判断自己的掌握情况。")}
          action={
            <span className="muted">
              {selectedSubjects.length
                ? tr("common:已选 {{v0}} 门学科",{v0:(selectedSubjects.length)})
                : tr("study:全部学科")}
            </span>
          }
        />
        <details className="study-subject-filter">
          <summary>{tr("study:选择本次练习学科")}{' '}
            <span>
              {selectedSubjects.length
                ? SUBJECTS.filter((subject) =>
                    selectedSubjects.includes(subject.id),
                  )
                    .map((subject) => subject.name)
                    .join('、')
                : tr("study:全部学科")}
            </span>
          </summary>
          <div className="study-subject-options">
            <button
              className={!selectedSubjects.length ? 'selected' : ''}
              onClick={() => setSelectedSubjects([])}
            >{tr("study:全部")}</button>
            {SUBJECTS.map((subject) => (
              <button
                key={subject.id}
                className={
                  selectedSubjects.includes(subject.id) ? 'selected' : ''
                }
                aria-pressed={selectedSubjects.includes(subject.id)}
                onClick={() =>
                  setSelectedSubjects((current) =>
                    current.includes(subject.id)
                      ? current.filter((id) => id !== subject.id)
                      : [...current, subject.id],
                  )
                }
              >
                {subject.name}
              </button>
            ))}
          </div>
        </details>
        <section className="panel">
          <div className="section-head">
            <h2>{tr("study:今日复习队列")}</h2>
            <button
              className="primary"
              disabled={!queue.length}
              onClick={() => start(queue)}
            >{tr("study:开始复习")}<ArrowRight size={15} />
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
                    {questionTopicTitle(
                      item.question,
                      data.nodes.find((n) => n.id === item.question.nodeId),
                    )}
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
                <span className="muted">{tr("study:约")}{item.question.expectedSeconds}{tr("study:秒")}</span>
              </div>
            ))
          ) : (
            <Empty title={tr("study:暂无到期复习")}>{tr("study:你可以到学科中心进行专项练习。")}</Empty>
          )}
        </section>
      </>
    );
  }
  const leaveSummary = () => {
    finish();
    if (!sprint && session.mode !== 'test') navigate('plan');
  };
  const summaryAction = done ? <button type="button" className="primary" onClick={leaveSummary}>
    {sprint ? tr('dashboard:sprint.next') : session.mode === 'test' ? tr('study:回到学习工作台') : tr('common:返回学习安排')}
    <ArrowRight size={16} />
  </button> : null;
  const completion = done ? (() => {
    const score = results.length
      ? Math.round(
          (results.reduce((a, e) => a + e.score, 0) / results.length) * 100,
        )
      : 0;
    return (
      <section className={'session-summary' + (guided ? ' guided-completion' : '')}>
        <span className="summary-icon" aria-hidden="true">
          <CheckCheck size={29} />
        </span>
        <h1 ref={completionTitle} tabIndex={-1}>
          {session.mode === 'test' ? tr("study:测试已完成") : tr("study:今天，又学扎实了一点。")}
        </h1>
        <p className="muted">{tr("study:学习记录已保存，下一次复习安排已更新。")}</p>
        <div className="summary-stats">
          <div>
            <strong>{results.length}</strong>
            <span>{tr("study:完成题目")}</span>
          </div>
          <div>
            <strong>{score}%</strong>
            <span>
              {session.mode === 'test' ? tr("study:本次得分率") : tr("study:本次自评得分率")}
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
            <span>{tr("study:分钟思考")}</span>
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
                      ? tr("common:答对")
                      : e.outcome === 'unsure'
                        ? tr("common:不确定")
                        : tr("common:答错")}
                </span>
              </summary>
              <p className="muted">
                <MathText>
                  {data.questions.find((q) => q.id === e.questionId)?.prompt}
                </MathText>
              </p>
              {e.learningEvidence?.suspect && (
                <p className="muted">{tr("study:本次正确结果的掌握证据权重已降低，等待不同题目的交叉验证。")}</p>
              )}
              {e.learningEvidence?.verificationOf && (
                <p className="muted">{tr("study:交叉验证：")}{e.score >= 0.85 && e.predictedConfidence !== 'guess'
                    ? tr("study:本次变式已答对，长期掌握仍需间隔验证。")
                    : tr("study:仍需巩固理解，下一次复习已根据表现调整。")}
                </p>
              )}
              <p>{tr("study:参考答案：")}<MathText>
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
        {session.mode === 'test' && (
          <RemediationLauncher sessionId={session.id} title={session.title} />
        )}
        {sessionItems.find((x) => x.remediationId) && (
          <button
            className="secondary"
            onClick={() =>
              navigate(
                'remedy',
                sessionItems.find((x) => x.remediationId)!.remediationId,
              )
            }
          >{tr("study:返回补救课程")}</button>
        )}
        {!guided && summaryAction}
      </section>
    );
  })() : null;
  if (done && !guided) return completion;
  if (!q) return null;
  const isTest = session.mode === 'test';
  const feedback = confirmedRating ? (confirmedRating === 'wrong' ? 'review' : confirmedRating)
    : checked === null ? undefined : checked >= 1 ? 'correct' : 'review';
  const suggestedRating = checked === null ? undefined : checked >= 1 ? 'correct' : checked > 0 ? 'unsure' : 'wrong';
  const feedbackText = feedback === 'correct' ? tr('study:正确')
    : feedback === 'unsure' ? tr('study:不确定')
    : checked !== null && checked > 0 ? tr('common:部分正确') : tr('common:需要订正');
  const explanation = isPinyin(q) ? '' : q.explanation?.trim();
  const naviFeedback = checked !== null && !grade && explanation && explanation.length <= 160 && !explanation.includes('\n')
    ? explanation : undefined;
  const naviCorrectAnswer = feedback === 'correct' && checked === 1 && ['choice', 'blank'].includes(q.type) &&
    q.answer.length <= 24 && !q.answer.includes('\n') ? q.answer : undefined;
  const saveExit = () => { trackProductEvent('study_saved_exit', 'study'); savedExit(); };
  const metadata = (
      <div className="question-meta">
        {data.questions.find((x) => x.id === q.id)?.reviewStatus ===
          'paused' && (
          <span role="alert">{tr("study:这道题已暂停，请保存退出后重新安排练习。")}</span>
        )}
        {item?.verificationOf && <span>{tr("study:交叉验证 · 用另一道题确认理解")}</span>}
        {item?.reason === '跨语境迁移' && <span>{tr("study:跨语境迁移")}</span>}
        <span>{node?.skills.find((s) => s.id === q.skillId)?.title}</span>
        <span>{tr("study:难度")}{'·'.repeat(q.difficulty)}</span>
        {q.verified && (
          <span className="verified">
            <CheckCheck size={13} />{tr("study:解答已核验")}</span>
        )}
      </div>
  );
  const questionScaffold = (<>
      {item?.scaffold && !item.gameRecovery && !isTest && (
        <aside className="scaffold">
          <BookOpen size={17} />
          <div>
            <b>{tr("study:先找回基础")}</b>
            <p>{item.scaffold}</p>
          </div>
        </aside>
      )}
  </>);
  const hintText = hintLevel === 'light'
    ? tr('study:先用自己的话复述题意，确认需要回答的问题。')
    : hintLevel === 'method'
      ? tr('common:列出已知与未知，回想相关概念，再独立选择方法。')
      : hintLevel === 'step' ? q.solution?.[0] : hintLevel === 'answer' ? q.answer : undefined;
  const showHint = guided && !revealed ? hintText : undefined;
  const help = (<>
      {!isTest && !isPinyin(q) && !revealed && (
        <details className="graded-hints">
          <summary>{tr("study:需要一点帮助？")}</summary>
          <div className="hint-levels">
            {(['light', 'method', 'step', 'answer'] as const).map(
              (level, i) => (
                <button
                  className="quiet"
                  key={level}
                  disabled={level === 'step' && !q.solution?.length}
                  onClick={(event) => {
                    setHintLevel((old) =>
                      !old ||
                      ['light', 'method', 'step', 'answer'].indexOf(level) >
                        ['light', 'method', 'step', 'answer'].indexOf(old)
                        ? level
                        : old,
                    );
                    if (guided) {
                      const tools = event.currentTarget.closest<HTMLDetailsElement>('.guided-tools');
                      if (tools) tools.open = false;
                    }
                  }}
                >
                  {['轻提示', tr("study:方法提示"), tr("study:关键步骤"), tr("study:接近答案")][i]}
                </button>
              ),
            )}
          </div>
          {!guided && hintText && <MathText>{hintText}</MathText>}
          <small>{tr("study:提示深度会记录；之后的无提示验证才用于确认独立掌握。")}</small>
        </details>
      )}
  </>);
  const practiceActions = (<>
        {!revealed && !isTest && q.type !== 'subjective' && (
          <div className="reveal-area">
            <button className="primary" onClick={reveal} aria-keyshortcuts="Space">
              <Eye size={17} />{tr("study:显示答案")}</button>
            {!guided && <span>{tr("study:先独立思考，再揭晓答案")}<kbd>Space</kbd></span>}
          </div>
        )}
        {!grade && q.type === 'subjective' && (
          <div className="reveal-area">
            <button
              className="primary"
              disabled={busy || !answer.trim() || !aiReady}
              onClick={submitSubjective}
            >
              {busy ? tr("study:正在按评分点批改…") : tr("study:提交批改")}
              <ArrowRight size={16} />
            </button>
            {!aiReady && (
              <p className="muted">{tr("study:批改连接待配置；你仍可对照参考答案自评。")}</p>
            )}
            <button
              className="quiet"
              hidden={isTest}
              disabled={busy}
              onClick={reveal}
            >{tr("study:对照参考答案自评")}</button>
          </div>
        )}
  </>);
  const reopenAnswer = (<>
        {revealed && !answerPanelOpen && !isTest && (
          <div className="reveal-area">
            <button
              className="primary"
              onClick={() => setAnswerPanelOpen(true)}
            >
              <Eye size={17} />{tr("study:查看参考答案")}</button>
          </div>
        )}
  </>);
  const saveGrade = grade && (
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
                      >{tr("study:保存反馈，下一题")}<ArrowRight size={16} />
                      </button>
  );
  const ratingActions = (
                      <div className="rating-actions" role="group" aria-label={tr("study:对照参考答案自评")}>
                        <button
                          className="wrong"
                          data-matches-result={suggestedRating === 'wrong' || undefined}
                          aria-keyshortcuts="1"
                          disabled={busy}
                          onClick={() => record('wrong')}
                        >
                          <X size={17} />{tr("study:答错")}{!guided && <kbd>1</kbd>}
                        </button>
                        <button
                          className="unsure"
                          data-matches-result={suggestedRating === 'unsure' || undefined}
                          aria-keyshortcuts="2"
                          disabled={busy}
                          onClick={() => record('unsure')}
                        >
                          <Minus size={17} />{tr("study:不确定")}{!guided && <kbd>2</kbd>}
                        </button>
                        <button
                          className="correct"
                          data-matches-result={suggestedRating === 'correct' || undefined}
                          aria-keyshortcuts="3"
                          disabled={busy}
                          onClick={() => record('correct')}
                        >
                          <Check size={17} />{tr("study:答对")}{!guided && <kbd>3</kbd>}
                        </button>
                      </div>
  );
  const confidenceOptions = !revealed && !isTest && (
    <div className="confidence-picker" role="group" aria-label={tr("study:作答前，你有多确定？")}>
      {!guided && <span>{tr("study:作答前，你有多确定？")}</span>}
      {([
        ['sure', tr("study:有把握")],
        ['unsure', tr("study:犹豫")],
        ['guess', tr("study:猜测")],
      ] as const).map(([id, label]) => (
        <button key={id} type="button" aria-pressed={confidence === id}
          className={confidence === id ? 'selected' : ''} onClick={() => setConfidence(id)}>
          {label}
        </button>
      ))}
    </div>
  );
  const task = (
      <NaviLearningWorkspace key={q.id} question={q} answer={answer} grade={grade} focused={focusMode} protected={isTest||sprint} onFocus={setFocusMode} onHelp={()=>openNavi({type:'question',id:q.id})} onAssistance={level=>setHintLevel(old=>{const levels=['light','method','step','answer'] as const;return levels[Math.max(level-1,old?levels.indexOf(old):0)];})}>
      <article className="question-card" key={q.id}>
        {guided && questionScaffold}
        {guided ? <GuidedQuestionPrompt prompt={q.prompt} /> : (
          <h2 className="question-prompt"><MathText>{q.prompt}</MathText></h2>
        )}
        {q.passage && !q.prompt.includes(q.passage) && (
          <blockquote>
            <MathText>{q.passage}</MathText>
          </blockquote>
        )}
          <QuestionVisual question={q} stage={!isTest&&revealed?'solution':!isTest&&hintLevel?'hint':'question'}/>
        <div className="question-options">
          {q.options?.map((option) => (
            <button
              key={option}
              disabled={revealed}
              onClick={() => changeAnswer(option,'text')}
              className={answer === option ? 'chosen' : ''}
              data-guided-option={guided ? '' : undefined}
              data-guided-result={guided && revealed ? (
                objectiveScore(q, option) >= 1 ? 'correct' : answer === option ? 'review' : undefined
              ) : undefined}
            >
              <MathText>{option}</MathText>
            </button>
          ))}
        </div>
        {q.type === 'matching' && (
          <MatchingInput
            question={q}
            value={answer}
            onChange={value=>changeAnswer(value,'text')}
            disabled={revealed}
          />
        )}
        {(q.type === 'subjective' ||
          q.type === 'blank' ||
          (isTest && !q.options && q.type !== 'matching')) &&
          !grade && (
            <div className="answer-input-label">
              {q.type === 'subjective' ? tr("study:写下你的回答") : tr("study:输入答案")}
              {supportsMathInput(q.subject,q.type)?<MathAnswerComposer key={q.id} value={answer} format={answerFormat} onChange={changeAnswer} onFormatChange={format=>changeAnswer(answer,format)} disabled={revealed||busy} defaultMixed={q.type==='subjective'}/>:<textarea
                disabled={revealed || busy}
                value={answer}
                onChange={(e) => changeAnswer(e.target.value,'text')}
                maxLength={16000}
                placeholder={
                  q.type === 'subjective'
                    ? tr("study:用自己的语言组织答案，尽量给出具体依据。")
                    : tr("study:输入你的答案")
                }
                rows={q.type === 'subjective' ? 6 : 2}
              />}
            </div>
          )}
        {q.type === 'subjective' && !grade && (
          <div className="rubric-preview">
            {q.rubric?.map((r) => (
              <span key={r.id}>
                {r.title} · {r.max}{tr("study:分")}</span>
            ))}
          </div>
        )}
        {!guided && confidenceOptions}
        {!guided && practiceActions}
        {isTest && !revealed && q.type !== 'subjective' && (
          <div className="reveal-area">
            <button
              className="primary"
              disabled={!answer.trim() || busy}
              onClick={async () => {
                const checked=mathematicalBlank?await checkMath():null;
                if(checked?.status==='undetermined'){notify(tr("study:暂不能自动核验，答案草稿已保留。请保存退出后人工复核，不会自动判错。"));return;}
                const right = checked?checked.status==='equivalent':objectiveScore(q, answer) >= 0.999;
                void record(
                  right ? 'correct' : 'wrong',
                  undefined,
                  right ? 1 : 0,
                );
              }}
            >{tr("study:提交，下一题")}<ArrowRight size={16} />
            </button>
            <p className="muted">{tr("study:简答自动比对需要与标准答案一致；复杂表达建议选择主观题批改。")}</p>
          </div>
        )}
        {!guided && reopenAnswer}
        {revealed &&
          answerPanelOpen &&
          <AnswerPresentation inline={guided} close={() => setAnswerPanelOpen(false)}>
                <header className="answer-modal-head">
                  <div>
                    <span className={guided && !grade ? 'guided-answer-label' : undefined}>
                      {tr(guided && !grade ? "study:参考答案" : "study:核对答案")}
                    </span>
                    {!guided && <small>{tr("study:第")}{index + 1} / {sessionItems.length}{tr("study:题")}</small>}
                  </div>
                  <button
                    ref={answerCloseRef}
                    className="quiet"
                    onClick={() => setAnswerPanelOpen(false)}
                    aria-label={tr("study:关闭参考答案弹窗")}
                  >
                    <X size={18} />
                  </button>
                </header>
                <div
                  className="answer-reveal"
                  style={
                    {
                      '--answer-font-size': `${Math.max(21, Math.round(44 - Math.sqrt(Array.from(q.answer).length) * 2))}px`,
                    } as React.CSSProperties
                  }
                >
                  {grade ? (
                    <>
                      <div className="grade-heading">
                        <div>
                          <h3>{grade.label}</h3>
                        </div>
                        <strong>
                          {grade.score}
                          <span> / {grade.maxScore}</span>
                        </strong>
                      </div>
                      <p>{grade.feedback}</p>
                      {grade.solo&&<p><b>SOLO {grade.solo.level}</b> · {grade.solo.reason}</p>}
                      <details className="grading-details"><summary>{tr("study:评分点与改进建议（")}{grade.criteria.length}{tr("study:项）")}</summary>
                      {grade.criteria.map((c) => (
                        <div className="criterion" key={c.id}>
                          <div>
                            <b>{(grade.ruleSnapshot?.criteria??q.rubric)?.find((r) => r.id === c.id)?.title}</b>
                            <span>
                              {c.score} /{' '}
                              {(grade.ruleSnapshot?.criteria??q.rubric)?.find((r) => r.id === c.id)?.max}
                            </span>
                          </div>
                          {c.evidence && (
                            <p className="evidence">{tr("study:命中：")}{c.evidence}</p>
                          )}
                          {c.missing && <p>{tr("study:遗漏：")}{c.missing}</p>}
                          <p className="muted">{c.suggestion}</p>
                        </div>
                      ))}
                      {grade.ruleVersion&&<p className="muted">{tr("study:评分规则版本：")}{grade.ruleVersion}</p>}
                      </details>
                      <details>
                        <summary>{tr("study:查看示例答案")}</summary>
                        <p>{grade.exampleAnswer}</p>
                      </details>
                      {!guided && saveGrade}
                    </>
                  ) : (
                    <>
                      {!guided && <p className="answer-label">{tr("study:参考答案")}</p>}
                      {!guided && <QuestionReviewButton question={q} />}
                      <h3>
                        <MathText>
                          {q.type === 'matching' ? tr("study:配对结果") : q.answer}
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
                      {explanation && !naviFeedback && (
                        <p className="answer-explanation">
                          <MathText>{explanation}</MathText>
                        </p>
                      )}
                      {!guided && answer && q.type!=='subjective' && !mathematicalBlank && (
                        <p className="answer-check" data-outcome={objectiveScore(q, answer) === 1 ? 'correct' : 'review'}>{tr("study:本次作答：")}{objectiveScore(q, answer) === 1
                            ? tr("study:正确")
                            : objectiveScore(q, answer) > 0
                              ? tr("common:部分正确")
                              : tr("common:需要订正")}
                          {confidence === 'sure' &&
                          objectiveScore(q, answer) < 0.6
                            ? tr("study: · 已发现一个值得校准的信心盲点")
                            : ''}
                        </p>
                      )}
                      {mathematicalBlank&&answer&&<p className="answer-check" role="status">{mathChecking?tr("study:正在核验数学表达式…"):mathCheck?.status==='equivalent'?tr("common:数学核验：等价"):mathCheck?.status==='not-equivalent'?tr("common:数学核验：不等价"):tr("common:数学核验：需要人工复核")}{mathCheck?.status==='undetermined'&&<small> · {mathCheck.reason}{tr("study:。请对照参考答案手动检查。")}</small>}</p>}
                      {q.transferFrom && (
                        <details>
                          <summary>{tr("study:迁移挑战 · 对照原题")}</summary>
                          <p>
                            <MathText>
                              {
                                data.questions.find(
                                  (x) => x.id === q.transferFrom,
                                )?.prompt
                              }
                            </MathText>
                          </p>
                          <p className="muted">{tr("study:同一种能力，换了情境。比较两题共同的方法。")}</p>
                        </details>
                      )}
                      {q.solution && q.solution.length > 0 && (
                        <div className="solution-disclosure" data-open={solution || undefined}>
                          <button
                            type="button"
                            className="quiet solution-toggle"
                            aria-expanded={solution}
                            aria-controls={solutionId}
                            onClick={() => setSolution(open => !open)}
                          >
                            <BookOpen size={17} aria-hidden="true" />
                            {tr('study:查看解题过程')}
                            <ChevronDown size={16} className="solution-chevron" aria-hidden="true" />
                          </button>
                          <div id={solutionId} className="solution-panel" inert={!solution}>
                            <div className="solution-panel-inner">
                              <ol className="solution-steps" role="list">
                                {q.solution.map((step, i) => (
                                  <li key={i}>
                                    <span className="solution-step-number" aria-hidden="true">{i + 1}</span>
                                    <div className="solution-step-body"><MathText>{step}</MathText></div>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          </div>
                        </div>
                      )}
                      {!guided && ratingActions}
                    </>
                  )}
                </div>
          </AnswerPresentation>}
      </article>
      </NaviLearningWorkspace>
  );

  return (
    <div
      data-ui-mode={guided ? 'guided-focus' : undefined}
      data-stage={done ? 'completion' : undefined}
      data-feedback={done ? undefined : feedback}
      data-feedback-phase={!done && leavingFeedback ? 'leaving' : undefined}
      className={'study-surface ' + (isTest ? 'assessment-surface' : 'practice-surface') + (guided ? ' focus-mode guided-practice' : '')}
    >
      {guided ? (
        <>
          <header className="guided-progress-header">
            <button type="button" className="quiet guided-exit" onClick={done ? leaveSummary : saveExit}
              aria-label={tr(done ? 'common:返回学习安排' : 'study:保存并退出')} title={tr(done ? 'common:返回学习安排' : 'study:保存并退出')}><X size={23} /></button>
            <div className="guided-progress">
              <Progress value={done ? 100 : ((index + Number(revealed)) / sessionItems.length) * 100}
                aria-label={tr('study:第') + (done ? sessionItems.length : index + 1) + ' / ' + sessionItems.length + tr('study:题')} />
              <span>{done ? sessionItems.length : index + 1} / {sessionItems.length}</span>
            </div>
            <div className="guided-header-actions">
            {!done && <details className="guided-tools" onKeyDown={(event) => {
              if (event.key !== 'Escape' || !event.currentTarget.open) return;
              event.stopPropagation();
              event.currentTarget.open = false;
              event.currentTarget.querySelector('summary')?.focus();
            }}>
              <summary aria-label={tr('common:更多选项')} title={tr('common:更多选项')}><MoreHorizontal size={21} /></summary>
              <div className="guided-tools-popover">
                <button type="button" className="quiet" onClick={(e) => {
                  setScratchOpen(v => !v);
                  const menu = e.currentTarget.closest('details');
                  if (menu) menu.open = false;
                }} aria-expanded={scratchOpen}>
                  <PencilLine size={15} />{tr('study:草稿纸')}
                </button>
                {help}
                {confidenceOptions && <details className="guided-confidence">
                  <summary>{tr("study:作答前，你有多确定？")}</summary>
                  {confidenceOptions}
                </details>}
                <details className="guided-session-info">
                  <summary>{subjectName(q.subject)} · {questionTopicTitle(q, node)}</summary>
                  {metadata}
                </details>
                <div className="guided-tools-secondary">
                  <QuestionReviewButton question={q} />
                  <button type="button" className="quiet" onClick={toggleFocus}>{tr('study:退出沉浸')}</button>
                </div>
              </div>
            </details>}
              <span className="guided-wordmark" lang="en">Reviewbox<span aria-hidden="true">.</span></span>
            </div>
          </header>
          <div className="guided-canvas">
            <main className="guided-stage" ref={stageRef}>
              {!done && data.questions.find(x => x.id === q.id)?.reviewStatus === 'paused' &&
                <p className="guided-status" role="alert">{tr('study:这道题已暂停，请保存退出后重新安排练习。')}</p>}
              {done ? completion : task}
            </main>
            <footer className="guided-footer">
              {!done && (feedback || showHint) && <div key={feedback ?? hintLevel} className="guided-outcome" role="status">
                {feedback && <strong>{feedback === 'correct' && <Check size={16} />}<span>
                  {feedbackText}{naviCorrectAnswer && <> · <MathText>{naviCorrectAnswer}</MathText></>}
                </span></strong>}
                {(naviFeedback || showHint) && <p><MathText>{naviFeedback || showHint}</MathText></p>}
              </div>}
              <div className="guided-mentor">
                <NaviButton iconOnly target={{type:'question',id:q.id}}
                  motion={done ? 'idle' : feedback === 'correct' ? 'success' : feedback === 'review' ? 'error' : 'idle'} />
              </div>
              <div className="guided-actions" data-action={!done && answerPanelOpen && !grade ? 'rating' : undefined}>
                {done ? summaryAction : answerPanelOpen ? (grade ? saveGrade : ratingActions) : revealed ? reopenAnswer : practiceActions}
              </div>
            </footer>
          </div>
        </>
      ) : (
        <>
      <div className="session-top">
        {!sprint && <button className="quiet" onClick={() => { trackProductEvent('study_saved_exit', 'study'); savedExit(); }}>
          <ArrowLeft size={16} />{tr("study:保存并退出")}</button>}
        <span>
          {isTest
            ? session.title
            : subjectName(q.subject) + ' · ' + questionTopicTitle(q, node)}
        </span>
        <b>
          {index + 1}
          <span> / {sessionItems.length}</span>
        </b>
        {!isTest && (
          <div className="study-view-controls">{!sprint&&<NaviButton iconOnly={focusMode} target={{type:"question",id:q.id}}/>}
            <button
              className="quiet"
              onClick={() => setScratchOpen((v) => !v)}
              aria-expanded={scratchOpen}
            >
              <PencilLine size={15} />{tr("study:草稿纸")}</button>
            {!sprint&&<button
              className="quiet"
              onClick={toggleFocus}
              aria-pressed={focusMode}
            >
              {focusMode ? tr("study:退出沉浸") : tr("study:沉浸模式")}
            </button>}
          </div>
        )}
      </div>
      <Progress
        value={(index / sessionItems.length) * 100}
        className="session-progress"
      />
          {metadata}
          {questionScaffold}
          {help}
          {task}
          {!isTest && <QuestionReviewButton question={q} />}
        </>
      )}
      {!done && !isTest &&
        scratchOpen &&
        (['math', 'physics'].includes(q.subject) ? (
          <ProcessNotebook
            key={q.id}
            question={q}
            sessionId={session.id}
            revealed={revealed}
            onAssistance={() => setProcessHint(true)}
            onClose={() => setScratchOpen(false)}
          />
        ) : (
          <Scratchpad key={q.id} onClose={() => setScratchOpen(false)} />
        ))}
    </div>
  );
}

function AnswerPresentation({
  inline, close, children,
}: {
  inline: boolean;
  close: () => void;
  children: ReactNode;
}) {
  const panel = (
    <section
      className={inline ? 'answer-modal guided-answer' : 'answer-modal'}
      role={inline ? 'region' : 'dialog'}
      aria-modal={inline ? undefined : true}
      aria-label={tr('study:参考答案与核对')}
      onMouseDown={inline ? undefined : (event) => event.stopPropagation()}
    >
      {children}
    </section>
  );
  return inline ? panel : createPortal(
    <div className="answer-modal-backdrop" onMouseDown={close}>{panel}</div>,
    document.body,
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
        context?.drawImage(
          saved,
          0,
          0,
          saved.width,
          saved.height,
          0,
          0,
          width,
          height,
        );
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    element
      .getContext('2d')
      ?.clearRect(0, 0, element.clientWidth, element.clientHeight);
  }, [clearCount]);
  const point = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  return (
    <aside className="study-scratchpad" aria-label={tr("study:草稿纸")}>
      <div className="scratchpad-head">
        <span>{tr("study:草稿纸")}</span>
        <div>
          <button onClick={() => setClearCount((n) => n + 1)}>{tr("study:清空")}</button>
          <button onClick={onClose} aria-label={tr("study:关闭草稿纸")}>{tr("study:关闭")}</button>
        </div>
      </div>
      <canvas
        ref={canvas}
        aria-label={tr("study:可用鼠标或触控笔书写的草稿纸")}
        onPointerDown={(event) => {
          drawing.current = true;
          event.currentTarget.setPointerCapture(event.pointerId);
          const p = point(event),
            context = event.currentTarget.getContext('2d');
          if (!context) return;
          context.beginPath();
          context.moveTo(p.x, p.y);
          context.lineWidth = 2;
          context.lineCap = 'round';
          context.lineJoin = 'round';
          context.strokeStyle = '#324238';
        }}
        onPointerMove={(event) => {
          if (!drawing.current) return;
          const p = point(event),
            context = event.currentTarget.getContext('2d');
          context?.lineTo(p.x, p.y);
          context?.stroke();
        }}
        onPointerUp={() => {
          drawing.current = false;
        }}
        onPointerCancel={() => {
          drawing.current = false;
        }}
      />
      <p>{tr("study:仅作当前题的思考草稿，不计入评分。")}</p>
    </aside>
  );
}
