'use client';
import type { Question } from '@/lib/model';
import Diagram from './diagram';
import type {DiagramStage} from '@/lib/shaded-regions';
export default function QuestionVisual({
  question: q,
  solution = false,
  stage,
}: {
  question: Question;
  solution?: boolean;
  stage?:DiagramStage;
}) {
  const images =
    q.media?.filter(
      (m) => (m.purpose ?? 'question') === (solution ? 'solution' : 'question'),
    ) ?? [];
  const original = q.diagramChoice === 'original' || q.diagramChoice === 'skip';
  return (
    <div className="question-visual">
      {images.length && (!q.diagram || original || solution)
        ? images.map((m) => (
            <figure className="diagram original-diagram" key={m.id}>
              <img src={m.src} alt={m.alt} loading="lazy" />
            </figure>
          ))
        : null}
      {q.diagram && (!original || !images.length) && (
        <Diagram spec={q.diagram} stage={stage??(solution?'solution':'question')} />
      )}
    </div>
  );
}
