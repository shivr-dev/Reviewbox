import type { Question } from './model';
export function shuffleMatching(q: Question): Question {
  if (!q.matching) return q;
  const answer = JSON.parse(q.answer) as Record<string, string>;
  const left = q.matching.left.map((x, i) => ({ ...x, id: 'L' + (i + 1) }));
  let right = q.matching.right.map((x) => ({ ...x }));
  for (let i = right.length - 1; i > 0; i--) {
    const j = crypto.getRandomValues(new Uint32Array(1))[0] % (i + 1);
    [right[i], right[j]] = [right[j], right[i]];
  }
  if (q.matching.left.every((l, i) => answer[l.id] === right[i]?.id))
    right = [...right.slice(1), right[0]];
  const rightIds = new Map(right.map((r, i) => [r.id, 'R' + (i + 1)]));
  return {
    ...q,
    matching: {
      left,
      right: right.map((r, i) => ({ ...r, id: 'R' + (i + 1) })),
    },
    answer: JSON.stringify(
      Object.fromEntries(
        q.matching.left.map((l, i) => [left[i].id, rightIds.get(answer[l.id])]),
      ),
    ),
  };
}
