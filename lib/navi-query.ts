import {
  resolveNaviContext,
  type NaviContext,
  type NaviTarget,
} from './navi-context';
import type { Pack, StudyData } from './model';
export function naviSourceData(
  data: StudyData,
  pack?: Pack | null,
  publicId?: string,
): StudyData {
  if (!pack) return data;
  return {
    ...data,
    packs: [
      {
        ...pack.manifest,
        publicId,
        questionIds: pack.questions.map((q) => q.id),
        nodeIds: pack.knowledge.map((n) => n.id),
      } as any,
      ...data.packs.filter((p) => p.id !== pack.manifest.id),
    ],
    questions: [
      ...pack.questions,
      ...data.questions.filter(
        (q) => !pack.questions.some((p) => p.id === q.id),
      ),
    ],
    nodes: [
      ...pack.knowledge,
      ...data.nodes.filter((n) => !pack.knowledge.some((p) => p.id === n.id)),
    ],
  };
}
/** Resolve again for each query. Saved citations stay versioned; stale excerpts do not drive new answers. */
export function queryNaviContexts(
  data: StudyData,
  contexts: NaviContext[],
  message: string,
  pack?: Pack | null,
) {
  const snapshot = naviSourceData(
    data,
    pack,
    contexts.find((c) => c.context_type === 'pack')?.source_id,
  );
  return contexts
    .filter((c) => c.provenance !== 'learning-evidence')
    .map((c) => {
      if (c.context_type === 'web') return c;
      const target: NaviTarget = {
        type: c.context_type,
        id: c.source_id,
        selectedText: c.selected_text,
        sectionId: c.source_location.section_id,
      };
      if (
        c.context_type === 'pack' &&
        !snapshot.packs.some(
          (p) => p.id === c.source_id || (p as any).publicId === c.source_id,
        )
      )
        return {
          ...c,
          relevant_content: JSON.stringify({
            catalog: c.relevant_content,
            coverage:
              'Catalog metadata only. No full question access. Do not infer question contents.',
          }).slice(0, 16000),
        };
      return resolveNaviContext(snapshot, target, message);
    })
    .slice(-3);
}
