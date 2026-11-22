'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { tr } from '@/lib/i18n';
import type { StudyAction } from '@/lib/study-orchestrator';
import { postponeStudyAction } from '@/lib/study-orchestrator-client';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import GuidedFocusHeader from './guided-focus-header';
import MathText from './math-text';
import NaviAvatar from './navi-avatar';
import NaviSourceWorkspace from './navi-source-workspace';
import QuestionVisual from './question-visual';
import { openNavi } from './navi-workspace';

const questionStep = 'grading:回看题目';
const solutionStep = 'grading:解题思路';
const comparisonStep = 'grading:对照上次作答';

export function TeachingReview({
  action,
  onClose,
}: {
  action: StudyAction;
  onClose: () => void;
}) {
  const { data, start, notify } = useReview();
  const q = data.questions.find((question) => question.id === action.target);
  const attempt = q && data.events
    .filter((event) => !event.voidedBy && event.questionId === q.id)
    .sort((a, b) => Date.parse(b.occurredAt) - Date.parse(a.occurredAt))[0];
  const steps = q
    ? [questionStep, solutionStep, ...(attempt?.answer?.trim() ? [comparisonStep] : [])]
    : [];
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const pending = useRef(false);
  const stage = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const index = Math.min(step, Math.max(0, steps.length - 1));
  const current = steps[index];
  const last = index === steps.length - 1;
  const nextLabel = saving ? 'common:正在保存'
    : !q ? 'grading:返回计划'
    : !last ? steps[index + 1]
    : action.items?.length ? 'grading:理解后，做少量巩固' : 'grading:已回顾，返回计划';

  useEffect(() => {
    stage.current?.scrollTo?.({ top: 0 });
    heading.current?.focus({ preventScroll: true });
  }, [current]);

  function askNavi() {
    if (!q) return;
    const selection = window.getSelection();
    const selectedText = selection?.anchorNode && selection.focusNode
      && stage.current?.contains(selection.anchorNode) && stage.current.contains(selection.focusNode)
      ? selection.toString().trim().slice(0, 1800)
      : undefined;
    openNavi({ type: 'question', id: q.id, selectedText });
  }

  async function finish() {
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    const namespace = currentNamespace();
    try {
      await postponeStudyAction(action, 'seen', namespace);
      if (namespace !== currentNamespace()) return;
      if (action.items?.length) start(action.items, 'review', tr('grading:理解后，做少量巩固'));
      else onClose();
    } catch (error) {
      notify(error instanceof Error ? error.message : tr('common:操作未完成'));
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }

  const readingWorkspace = (content: ReactNode) => q ? (
    <NaviSourceWorkspace target={{ type: 'question', id: q.id }} subject={q.subject} priority={35}>
      {content}
    </NaviSourceWorkspace>
  ) : content;

  return (
    <section className="guided-practice guided-teaching" aria-labelledby="teaching-title">
      <GuidedFocusHeader
        onExit={onClose}
        exitLabel={tr(q ? 'grading:稍后继续' : 'grading:返回计划')}
        onBack={index > 0 ? () => setStep(index - 1) : undefined}
        progress={steps.length ? ((index + 1) / steps.length) * 100 : 0}
        progressLabel={tr('planner:action.label.18')}
        position={steps.length ? `${index + 1} / ${steps.length}` : ''}
        busy={saving}
      />
      <div className="guided-canvas">
        <div className="guided-stage" ref={stage}>
          {readingWorkspace(<article className="teaching-reading">
            <h1 id="teaching-title" ref={heading} tabIndex={-1}>
              {q ? action.title : tr('grading:这份学习材料已更新')}
            </h1>
            {q && (
              <>
                <nav className="teaching-phases" aria-label={tr('planner:action.label.18')}>
                  {steps.map((label, position) => (
                    <button type="button" key={label} aria-current={position === index ? 'step' : undefined}
                      disabled={saving} onClick={() => setStep(position)}>
                      {tr(label)}
                    </button>
                  ))}
                </nav>
                <div className="teaching-page" key={current}>
                  {current === questionStep && (
                    <>
                      {q.passage && (
                        <section className="teaching-passage">
                          <h2>{tr('study:原文或已知条件')}</h2>
                          <MathText>{q.passage}</MathText>
                        </section>
                      )}
                      <div className="teaching-prompt"><MathText>{q.prompt}</MathText></div>
                      {(q.diagram || q.media?.some((item) => (item.purpose ?? 'question') === 'question')) && (
                        <QuestionVisual question={q} />
                      )}
                      {!!q.options?.length && (
                        <ol type="A" className="teaching-options">
                          {q.options.map((option, position) => <li key={position}><MathText>{option}</MathText></li>)}
                        </ol>
                      )}
                      {q.matching && (
                        <div className="teaching-comparison">
                          {[q.matching.left, q.matching.right].map((items, column) => (
                            <ol key={column} className="teaching-options" type={column === 0 ? 'A' : '1'}>
                              {items.map((item) => <li key={item.id}><MathText>{item.text}</MathText></li>)}
                            </ol>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  {current === solutionStep && (
                    <>
                      {q.explanation && <p className="teaching-explanation"><MathText>{q.explanation}</MathText></p>}
                      {!!q.solution?.length && (
                        <ol className="teaching-steps">
                          {q.solution.map((solution, position) => (
                            <li key={position}><MathText>{solution}</MathText></li>
                          ))}
                        </ol>
                      )}
                      {!q.explanation && !q.solution?.length && (
                        <p className="muted">{tr('grading:这道题没有完整讲解，可在学科中导入课程或补充例题。')}</p>
                      )}
                      {(q.diagram || q.media?.some((item) => item.purpose === 'solution')) && (
                        <QuestionVisual question={q} solution />
                      )}
                      <section className="teaching-answer">
                        <h2><Check size={17} aria-hidden="true" />{tr('grading:参考答案')}</h2>
                        <MathText>{q.answer}</MathText>
                      </section>
                    </>
                  )}
                  {current === comparisonStep && (
                    <div className="teaching-comparison">
                      <section className="teaching-attempt">
                        <h2>{tr('study:原作答')}</h2>
                        <MathText>{attempt?.answer}</MathText>
                      </section>
                      <section className="teaching-answer">
                        <h2><Check size={17} aria-hidden="true" />{tr('grading:参考答案')}</h2>
                        <MathText>{q.answer}</MathText>
                      </section>
                    </div>
                  )}
                </div>
              </>
            )}
          </article>)}
        </div>
        <footer className="guided-footer teaching-footer">
          {q && (
            <div className="guided-mentor">
              <button className="guided-navi-button" type="button" onClick={askNavi}
                aria-label={tr('study:navi.selection.ask')} title={tr('study:navi.selection.ask')}>
                <NaviAvatar size={108} label={null} />
              </button>
            </div>
          )}
          <div className="guided-actions">
            <button className="primary" type="button" disabled={saving}
              onClick={!q ? onClose : last ? () => void finish() : () => setStep(index + 1)}>
              {tr(nextLabel)}
              {q && !last && <ArrowRight size={18} aria-hidden="true" />}
            </button>
          </div>
        </footer>
      </div>
    </section>
  );
}
