import type { Question } from './model';
export const publicationPoints = (q: Question) =>
  (q.gradingRule?.criteria ?? q.rubric ?? []).reduce(
    (sum, r) => sum + r.max,
    0,
  ) || 1;
export type QuestionPageStyle = {
  imageWidth: number;
  answerLines: number;
  breakBefore: boolean;
};
export type PublishingLayout = {
  header: string;
  showPageNumbers: boolean;
  pageQuestionIds: string[][];
  questions: Record<string, QuestionPageStyle>;
};
export const A4 = {
  width: 794,
  height: 1123,
  contentWidth: 642,
  contentHeight: 924,
  top: 76,
  bottom: 76,
};
export type PageBlock = { id: string; height: number; forceBreak?: boolean };
/** Measured DOM heights, not a guessed fixed number of questions per page. */
export function paginateBlocks(
  blocks: PageBlock[],
  capacity: number,
  firstReserve = 0,
): string[][] {
  if (!Number.isFinite(capacity) || capacity <= 0) throw Error('分页区域无效');
  const pages: string[][] = [[]];
  let used = Math.max(0, firstReserve);
  for (const block of blocks) {
    if (!Number.isFinite(block.height) || block.height < 0)
      throw Error('题目高度无法测量');
    let current = pages[pages.length - 1];
    if (
      current.length &&
      (block.forceBreak || used + block.height > capacity)
    ) {
      pages.push([]);
      current = pages[pages.length - 1];
      used = 0;
    }
    current.push(block.id);
    used += block.height;
  }
  return pages.filter((p) => p.length);
}
export function validatePublishingLayout(
  ids: string[],
  layout: PublishingLayout,
) {
  const flattened = layout.pageQuestionIds.flat();
  if (
    flattened.length !== ids.length ||
    new Set(flattened).size !== ids.length ||
    ids.some((id) => !flattened.includes(id))
  )
    throw Error('分页中的题目已变化，请重新预览');
  for (const value of Object.values(layout.questions))
    if (
      !Number.isFinite(value.imageWidth) ||
      value.imageWidth < 25 ||
      value.imageWidth > 100 ||
      !Number.isInteger(value.answerLines) ||
      value.answerLines < 0 ||
      value.answerLines > 30
    )
      throw Error('图文比例或答题留白无效');
  return flattened;
}
