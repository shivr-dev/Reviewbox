import type { Pack } from './model';
import { rubricProblems } from './grading-rules';
import { inspectDiagram } from './diagram-spec';
import {inspectScientificDiagram} from './scientific-inspector';
export function inspectPackContent(pack: Pack, knownNodeIds: string[] = []) {
  const ids = new Set([...pack.knowledge.map((n) => n.id), ...knownNodeIds]);
  const missingReferences = pack.knowledge.flatMap((n) =>
    [
      ...n.prerequisites,
      ...(n.dependencies ?? []).map((d) => d.nodeId),
      ...n.relatedNodes,
    ]
      .filter((id) => !ids.has(id))
      .map((id) => ({ nodeId: n.id, title: n.title, reference: id })),
  );
  const questions = pack.questions.map((q) => ({
    id: q.id,
    diagramChoice:q.diagramChoice,
    mapping:!pack.knowledge.some(n=>n.id===q.nodeId&&n.subject===q.subject&&n.skills.some(s=>s.id===q.skillId)),
    scoring: rubricProblems(
      q,
      pack.knowledge.find((n) => n.id === q.nodeId)?.skills.map((s) => s.id),
    ),
    diagram: q.diagram ? inspectDiagram(q.diagram) : null,
    science:q.diagram?.type==='semantic'?inspectScientificDiagram(q.diagram,q):null,
    missingMedia: (q.media ?? [])
      .filter((m) => !m.src.startsWith('data:image/'))
      .map((m) => m.id),
    needsImageChoice:
      !!q.diagram &&
      !!q.media?.some((m) => (m.purpose ?? 'question') === 'question') &&
      !q.diagramChoice,
  }));
  const blocked = questions.filter(
    (q) =>
      q.mapping || q.scoring.length ||
      q.missingMedia.length ||
      q.diagram?.ok === false ||
      q.science?.questionConsistent==='inconsistent'&&q.diagramChoice!=='original'&&q.diagramChoice!=='skip'||
      q.science?.reviewRequired&&!q.diagramChoice||
      q.needsImageChoice,
  );
  return { questions, missingReferences, blocked };
}
export function assertPackReady(pack: Pack) {
  const report = inspectPackContent(pack);
  if (report.blocked.length)
    throw new Error(
      `还有 ${report.blocked.length} 题的知识映射、评分标准或插图需要确认，请先完成导入检查。`,
    );
}
