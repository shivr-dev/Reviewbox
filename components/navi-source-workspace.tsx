'use client';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  NaviUIController,
  registerNaviUI,
  activateNaviUI,
  type WorkspaceLayout,
} from '@/lib/navi-ui';
import type { NaviTarget } from '@/lib/navi-context';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import NaviWorkspaceFrame from './navi-workspace-frame';
import MathText from './math-text';
import QuestionVisual from './question-visual';

/** A source-aware host around existing content, not a second reader or page system. */
export default function NaviSourceWorkspace({
  target,
  subject,
  children,
  priority = 0,
}: {
  target: NaviTarget;
  subject: string;
  children: ReactNode;
  priority?: number;
}) {
  const { data } = useReview(),
    { t } = useTranslation('study'),
    ns = currentNamespace(),
    [pair, setPair] = useState(['', '']);
  const course =
      target.type === 'course'
        ? data.jobs?.find((j) => j.id === target.id && j.kind === 'course')
        : undefined,
    section = course?.sections?.find(
      (s: any) =>
        s.id === (target.sectionId ?? course.sections[course.current]?.id),
    ),
    pack =
      target.type === 'pack'
        ? data.packs.find((p) => p.id === target.id)
        : undefined,
    material =
      target.type === 'material'
        ? data.materials.find((m) => m.id === target.id)
        : undefined;
  const nodeIds =
      target.type === 'course'
        ? ['lesson-node:' + section?.id]
        : (material?.nodeIds ??
          pack?.nodeIds ??
          data.nodes
            .filter((n) => subject === 'all' || n.subject === subject)
            .map((n) => n.id)),
    nodes = data.nodes.filter((n) => nodeIds.includes(n.id));
  const questions = data.questions.filter((q) =>
      pack ? pack.questionIds?.includes(q.id) : nodeIds.includes(q.nodeId),
    ),
    steps: string[] =
      section?.content?.process?.steps?.map(
        (s: any) => s.title + '\n' + s.explanation,
      ) ?? [];
  const controller = useMemo(
    () =>
      new NaviUIController({
        panels: [
          'content',
          'notes',
          'source',
          'knowledge',
          'material',
          'comparison',
          ...(steps.length ? ['steps', 'formula'] : []),
          ...(questions.some((q) => q.diagram) ? ['diagram'] : []),
        ],
        questionIds: questions.map((q) => q.id),
        knowledgeIds: nodes.map((n) => n.id),
        splitPanel: 'notes',
        molecule: false,
        protected: false,
      }),
    [target.type, target.id, target.sectionId, ns],
  );
  controller.target = target;
  useEffect(() => registerNaviUI(controller, priority), [controller, priority]);
  const details = material?.text ?? section?.source ?? pack?.description ?? '';
  function chooseKnowledge(index: number, id: string, layout: WorkspaceLayout) {
    const next = [...(layout.knowledgeIds ?? pair)];
    next[index] = id;
    setPair(next);
    if (next.every(Boolean))
      controller.execute([{ type: 'compareKnowledge', ids: next }], 'user');
  }
  function render(panel: string, layout: WorkspaceLayout) {
    if (panel === 'notes')
      return (
        <>
          {data.notes
            .filter((n) => nodeIds.includes(n.nodeId))
            .map((n) => (
              <MathText key={n.id}>{n.body}</MathText>
            ))}
          {!data.notes.some((n) => nodeIds.includes(n.nodeId)) && (
            <p>{t('navi.live.emptyNotes')}</p>
          )}
        </>
      );
    if (panel === 'source' || panel === 'material')
      return (
        <>
          <small>
            {target.id} · {pack?.version ?? section?.revision ?? material?.date}
          </small>
          <MathText>{details || t('navi.live.noSource')}</MathText>
        </>
      );
    if (panel === 'content')
      return section?.content ? (
        <>
          {section.content.concepts?.map((c: any, i: number) => (
            <section key={i}>
              <h4>{c.title}</h4>
              <MathText>{c.explanation}</MathText>
            </section>
          ))}
        </>
      ) : material ? (
        <MathText>{material.text}</MathText>
      ) : (
        <>
          {questions.slice(0, 12).map((q) => (
            <section key={q.id}>
              <MathText>{q.prompt}</MathText>
              <QuestionVisual question={q} stage="question" />
            </section>
          ))}
        </>
      );
    if (panel === 'knowledge')
      return (
        <>
          {nodes.map((n) => (
            <section key={n.id}>
              <h4>{n.title}</h4>
              {n.skills.map((s) => (
                <p key={s.id}>{s.title}</p>
              ))}
            </section>
          ))}
        </>
      );
    if (panel === 'steps' || panel === 'formula')
      return (
        <ol>
          {steps.slice(0, layout.visibleSteps).map((s, i) => (
            <li key={i}>
              <MathText>{s}</MathText>
            </li>
          ))}
        </ol>
      );
    if (panel === 'diagram')
      return (
        <>
          {questions
            .filter((q) => q.diagram)
            .slice(0, 4)
            .map((q) => (
              <QuestionVisual question={q} key={q.id} stage="question" />
            ))}
        </>
      );
    if (panel === 'comparison')
      return layout.mode === 'knowledge-comparison' ? (
        <>
          <div className="navi-knowledge-pickers">
            {[0, 1].map((i) => (
              <select
                key={i}
                aria-label={t('navi.live.chooseKnowledge') + ' ' + (i + 1)}
                value={(layout.knowledgeIds ?? pair)[i]}
                onChange={(e) => chooseKnowledge(i, e.target.value, layout)}
              >
                <option value="">{t('navi.live.chooseKnowledge')}</option>
                {nodes.map((n) => (
                  <option value={n.id} key={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            ))}
          </div>
          {layout.knowledgeIds?.map((id) => {
            const n = nodes.find((n) => n.id === id);
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
              controller.execute(
                [{ type: 'splitView', questionId: e.target.value }],
                'user',
              )
            }
          >
            <option value="">{t('navi.live.chooseQuestion')}</option>
            {questions.map((q) => (
              <option value={q.id} key={q.id}>
                {q.prompt.slice(0, 80)}
              </option>
            ))}
          </select>
          {questions
            .filter((q) => q.id === layout.questionId)
            .map((q) => (
              <section key={q.id}>
                <MathText>{q.prompt}</MathText>
                <QuestionVisual question={q} stage="question" />
              </section>
            ))}
        </>
      );
    return null;
  }
  return (
    <div
      className="navi-source-host"
      onFocusCapture={() => activateNaviUI(controller)}
      onPointerDown={(e) => {
        e.stopPropagation();
        activateNaviUI(controller);
      }}
    >
      <NaviWorkspaceFrame
        controller={controller}
        storageKey={subject + ':' + target.type}
        renderPanel={render}
      >
        {children}
      </NaviWorkspaceFrame>
    </div>
  );
}
