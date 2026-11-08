'use client';
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  NaviUIController,
  registerNaviUI,
  panelNames,
  type NaviUIAction,
} from '@/lib/navi-ui';
import type { Question, Grade } from '@/lib/model';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import MathText from './math-text';
import QuestionVisual from './question-visual';
import NaviWorkspaceFrame from './navi-workspace-frame';

/** Wrap the real answer form; layout changes never remount or replace its input state. */
export default function NaviLearningWorkspace({
  question: q,
  answer,
  grade,
  children,
  onFocus,
  focused,
  protected: locked = false,
  onHelp,
  onAssistance,
}: {
  question: Question;
  answer: string;
  grade: Grade | null;
  children: ReactNode;
  onFocus: (value: boolean) => void;
  focused: boolean;
  protected?: boolean;
  onHelp: () => void;
  onAssistance: (level: 1 | 2 | 3 | 4) => void;
}) {
  const { t } = useTranslation('study'),
    { data } = useReview(),
    ns = currentNamespace();
  const live = useRef({ questionId: q.id, answer, grade: grade ?? undefined });
  live.current = { questionId: q.id, answer, grade: grade ?? undefined };
  const controller = useMemo(
    () =>
      new NaviUIController({
        panels: panelNames.filter(
          (p) =>
            !['content', 'material'].includes(p) &&
            (p !== 'diagram' || !!q.diagram || !!q.media?.length),
        ),
        questionIds: data.questions
          .filter((v) => v.subject === q.subject)
          .map((q) => q.id),
        knowledgeIds: data.nodes
          .filter((n) => n.subject === q.subject)
          .map((n) => n.id),
        molecule: !!(
          (q.diagram as any)?.kind === 'chemistry' &&
          (q.diagram as any).view === 'molecule3d'
        ),
        protected: locked,
      }),
    [q.id, ns, locked],
  );
  controller.target = { type: 'question', id: q.id };
  controller.readEvidence = () => live.current;
  controller.assistance = onAssistance;
  const layout = useSyncExternalStore(
      controller.subscribe,
      controller.snapshot,
      controller.snapshot,
    ),
    [error, setError] = useState(''),
    [knowledgePair, setKnowledgePair] = useState(['', '']);
  useEffect(() => registerNaviUI(controller), [controller]);
  const baselineFocus = useRef(focused);
  if (layout.mode === 'default' && !controller.history.length)
    baselineFocus.current = focused;
  useEffect(() => {
    onFocus(
      layout.mode === 'default'
        ? baselineFocus.current
        : layout.mode === 'focus',
    );
  }, [layout.mode]);
  const exec = (actions: NaviUIAction[]) => {
    const result = controller.execute(actions, 'user');
    setError(result.ok ? '' : t('navi.live.error.' + result.reason));
  };
  const other = data.questions.find(
      (v) => v.id === layout.questionId && v.id !== q.id,
    ),
    node = data.nodes.find((n) => n.id === q.nodeId);
  const component = (name: string) => {
    switch (name) {
      case 'question':
        return (
          <>
            <MathText>{q.prompt}</MathText>
            <QuestionVisual question={q} />
          </>
        );
      case 'explanation':
        return (
          <>
            <MathText>{q.answer}</MathText>
            <MathText>{q.explanation}</MathText>
          </>
        );
      case 'formula':
        return (
          <>
            {[q.prompt, ...(q.solution ?? [])].map((s, i) => (
              <MathText key={i}>{s}</MathText>
            ))}
          </>
        );
      case 'comparison':
        return layout.mode === 'knowledge-comparison' ? (
          <>
            <div className="navi-knowledge-pickers">
              {[0, 1].map((i) => (
                <select
                  key={i}
                  aria-label={t('navi.live.panel.knowledge') + ' ' + (i + 1)}
                  value={(layout.knowledgeIds ?? knowledgePair)[i]}
                  onChange={(e) => {
                    const ids = [...(layout.knowledgeIds ?? knowledgePair)];
                    ids[i] = e.target.value;
                    setKnowledgePair(ids);
                    if (ids.every(Boolean))
                      exec([{ type: 'compareKnowledge', ids }]);
                  }}
                >
                  <option value="">{t('navi.live.chooseKnowledge')}</option>
                  {data.nodes
                    .filter((n) => n.subject === q.subject)
                    .map((n) => (
                      <option value={n.id} key={n.id}>
                        {n.title}
                      </option>
                    ))}
                </select>
              ))}
            </div>
            {layout.knowledgeIds?.map((id) => {
              const n = data.nodes.find((n) => n.id === id);
              return (
                n && (
                  <section key={id}>
                    <h4>{n.title}</h4>
                    {n.skills.map((s) => (
                      <p key={s.id}>{s.title}</p>
                    ))}
                  </section>
                )
              );
            })}
          </>
        ) : (
          <>
            <select
              aria-label={t('navi.live.chooseQuestion')}
              value={layout.questionId ?? ''}
              onChange={(e) =>
                exec([{ type: 'splitView', questionId: e.target.value }])
              }
            >
              <option value="">{t('navi.live.chooseQuestion')}</option>
              {data.questions
                .filter((v) => v.id !== q.id && v.subject === q.subject)
                .map((v) => (
                  <option value={v.id} key={v.id}>
                    {v.prompt.slice(0, 80)}
                  </option>
                ))}
            </select>
            {other && (
              <>
                <MathText>{other.prompt}</MathText>
                <QuestionVisual question={other} stage="question" />
                <MathText>{other.options?.join('\n') ?? ''}</MathText>
              </>
            )}
          </>
        );
      case 'diagram':
        return q.diagram || q.media?.length ? (
          <QuestionVisual question={q} stage="question" />
        ) : (
          <p>{t('navi.live.noDiagram')}</p>
        );
      case 'steps':
        return (
          <>
            <ol>
              {q.solution?.slice(0, layout.visibleSteps).map((s, i) => (
                <li key={i}>
                  <MathText>{s}</MathText>
                </li>
              ))}
            </ol>
            {!q.solution?.length && (
              <button className="text-button" onClick={onHelp}>
                {t('navi.live.askDerivation')}
              </button>
            )}
            {(q.solution?.length ?? 0) > layout.visibleSteps && (
              <button
                onClick={() =>
                  exec([
                    {
                      type: 'configureComponent',
                      component: 'steps',
                      visibleSteps: Math.min(50, layout.visibleSteps + 1),
                    },
                  ])
                }
              >
                {t('navi.live.nextStep')}
              </button>
            )}
          </>
        );
      case 'answer':
        return (
          <>
            <MathText>{answer || t('navi.live.noAnswer')}</MathText>
            {grade && (
              <>
                <p>
                  {t('navi.live.officialGrade')} · {grade.score}/
                  {grade.maxScore}
                </p>
                <MathText>{grade.feedback}</MathText>
                {grade.criteria.map((c) => (
                  <p key={c.id}>
                    <b>{c.score}</b> · {c.evidence} · {c.missing}
                  </p>
                ))}
              </>
            )}
          </>
        );
      case 'rubric':
        return (
          <>
            {(grade?.ruleSnapshot?.criteria ?? q.rubric)?.map((r) => (
              <div key={r.id}>
                <b>
                  {r.title} · {r.max}
                </b>
                <MathText>{r.description ?? ''}</MathText>
              </div>
            ))}
            {!(q.rubric?.length || grade?.ruleSnapshot) && (
              <p>{t('navi.live.noRubric')}</p>
            )}
            {grade?.solo && (
              <p>
                SOLO {grade.solo.level} · {grade.solo.evidence}
              </p>
            )}
          </>
        );
      case 'source':
        return (
          <>
            <p>{q.source || t('navi.live.noSource')}</p>
            <small>
              {q.id} · {q.version}
            </small>
          </>
        );
      case 'knowledge':
        return (
          <>
            <h4>{node?.title}</h4>
            {node?.skills.map((s) => (
              <p key={s.id}>{s.title}</p>
            ))}
          </>
        );
      case 'notes':
        return (
          <>
            {data.notes
              .filter((n) => n.nodeId === q.nodeId)
              .map((n) => (
                <MathText key={n.id}>{n.body}</MathText>
              ))}
            <button className="text-button" onClick={onHelp}>
              {t('navi.live.discuss')}
            </button>
          </>
        );
    }
  };
  return (
    <NaviWorkspaceFrame
      controller={controller}
      storageKey={q.subject}
      renderPanel={component}
    >
      {children}
    </NaviWorkspaceFrame>
  );
}
