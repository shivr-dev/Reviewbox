'use client';

import type { Question } from '@/lib/model';
import { tr } from '@/lib/i18n';
import { naviQuestionSketch, originalNaviDiagram, questionHasOriginalVisual } from '@/lib/navi-question-visual';
import Diagram from './diagram';
import QuestionVisual from './question-visual';

export default function NaviQuestionDiagram({ question }: { question: Question }) {
  if (questionHasOriginalVisual(question)) {
    return <QuestionVisual question={{ ...question, diagram: originalNaviDiagram(question) }} stage="question" />;
  }
  const spec = naviQuestionSketch(question);
  return spec ? (
    <div className="navi-assist-diagram">
      <Diagram spec={spec} stage="question" />
      <p>{tr('study:navi.live.sketchCaption')}</p>
    </div>
  ) : null;
}
