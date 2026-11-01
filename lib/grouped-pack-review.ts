import type { Pack, Question } from './model';
import { inspectPackContent } from './import-review';
export type ReviewGroup = 'errors' | 'manual' | 'engine' | 'visual' | 'ready';
export type EngineCheck = {
  signature: string;
  status: 'passed' | 'failed';
  message?: string;
};
export const diagramSignature = (q: Question | undefined) =>
  JSON.stringify(q?.diagram ?? null);
export function groupedPackReview(
  pack: Pack,
  checks: Record<string, EngineCheck> = {},
) {
  const report = inspectPackContent(pack);
  return report.questions.map((item, index) => {
    const q = pack.questions[index],
      signature = diagramSignature(q),
      check = checks[q.id]?.signature === signature ? checks[q.id] : undefined,
      reasons: string[] = [];
    let group: ReviewGroup = 'ready';
    if (item.mapping) reasons.push('知识点或能力归属不完整');
    if (item.scoring.length) reasons.push(...item.scoring);
    if (item.missingMedia.length) reasons.push('有插图文件尚未嵌入');
    if (item.diagram?.ok === false) reasons.push(...item.diagram.problems);
    if (
      item.science?.questionConsistent === 'inconsistent' &&
      !['original', 'skip'].includes(q.diagramChoice ?? '')
    )
      reasons.push(...item.science.problems);
    if (
      check?.status === 'failed' &&
      !['original', 'skip'].includes(q.diagramChoice ?? '')
    )
      reasons.push(check.message ?? '引擎检查失败');
    if (reasons.length) group = 'errors';
    else if (item.needsImageChoice) {
      group = 'manual';
      reasons.push('需要选择保留原图或采用重绘');
    } else if (q.diagram && !q.diagramChoice) {
      if (
        q.diagram.type === 'semantic' &&
        ['chemistry', 'macromolecule', 'bioasset'].includes(q.diagram.kind) &&
        check?.status !== 'passed'
      ) {
        group = 'engine';
        reasons.push('等待结构解析或素材完整性检查');
      } else {
        group = 'visual';
        reasons.push('检查标签、单位、位置与显示阶段，并对照题干确认');
      }
    }
    return { id: q.id, index, question: q, group, reasons, signature };
  });
}
export function confirmReviewGroup(
  pack: Pack,
  ids: string[],
  checks: Record<string, EngineCheck> = {},
  choice: 'redraw' | 'original' = 'redraw',
): Pack {
  const states = new Map(groupedPackReview(pack, checks).map((r) => [r.id, r])),
    selected = new Set(ids);
  for (const id of selected) {
    const item = states.get(id);
    if (!item) throw Error('题目已变化，请重新查看');
    if (choice === 'original') {
      if (
        item.group !== 'manual' ||
        !item.question.media?.some(
          (m) => (m.purpose ?? 'question') === 'question',
        )
      )
        throw Error('本组存在不能直接保留原图的题目');
    } else {
      const diagram = item.question.diagram;
      const needsEngine =
        diagram?.type === 'semantic' &&
        ['chemistry', 'macromolecule', 'bioasset'].includes(diagram.kind);
      const checked =
        checks[id]?.signature === item.signature &&
        checks[id].status === 'passed';
      if (
        !['visual', 'manual'].includes(item.group) ||
        (needsEngine && !checked)
      )
        throw Error('请先修复错误、完成引擎检查或选择原图，不能批量跳过');
    }
  }
  return {
    ...pack,
    questions: pack.questions.map((q) =>
      selected.has(q.id) ? { ...q, diagramChoice: choice } : q,
    ),
  };
}
