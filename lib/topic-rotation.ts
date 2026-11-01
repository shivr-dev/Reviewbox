import { localDay, type AnswerEvent, type Question } from './model';

/** Orders only eligible content. It never changes due dates, mastery or prerequisites.
 * Coverage is by knowledge point, so a large chapter/skill cannot fill every slot.
 * Today's evidence carries rotation across short sessions; last exposure breaks
 * ties across days so a small time budget does not always reach the same topics.
 */
export function createTopicRotation(events: AnswerEvent[], now: number) {
  const today = localDay(new Date(now));
  const exposure = new Map<string, number>();
  const lastSeen = new Map<string, number>();
  const skills = new Map<string, number>();
  let previousNode: string | undefined;
  let previousAt = -Infinity;
  let turn = now;
  const skillKey = (q: Pick<Question, 'nodeId' | 'skillId'>) =>
    JSON.stringify([q.nodeId, q.skillId]);
  for (const e of events) {
    const at = Date.parse(e.occurredAt);
    if (
      e.voidedBy ||
      !Number.isFinite(at) ||
      at > now ||
      !Number.isFinite(e.score) ||
      e.score < 0 ||
      e.score > 1
    )
      continue;
    lastSeen.set(e.nodeId, Math.max(lastSeen.get(e.nodeId) ?? -Infinity, at));
    if (localDay(new Date(at)) !== today) continue;
    exposure.set(e.nodeId, (exposure.get(e.nodeId) ?? 0) + 1);
    const key = skillKey(e);
    skills.set(key, (skills.get(key) ?? 0) + 1);
    if (at > previousAt) {
      previousAt = at;
      previousNode = e.nodeId;
    }
  }
  return {
    /** Input order remains the utility/risk tie-breaker. Callers own eligibility. */
    nextIndex<T>(
      items: T[],
      question: (item: T) => Question,
      eligible: (item: T) => boolean = () => true,
    ): number {
      let best = -1;
      let rank: number[] = [];
      for (let i = 0; i < items.length; i++) {
        if (!eligible(items[i])) continue;
        const q = question(items[i]);
        const nextRank = [
          Number(q.nodeId === previousNode),
          exposure.get(q.nodeId) ?? 0,
          lastSeen.get(q.nodeId) ?? -Infinity,
          skills.get(skillKey(q)) ?? 0,
        ];
        const difference = nextRank.findIndex((value, j) => value !== rank[j]);
        if (
          best < 0 ||
          (difference >= 0 && nextRank[difference] < rank[difference])
        ) {
          best = i;
          rank = nextRank;
        }
      }
      return best;
    },
    record(q: Question) {
      exposure.set(q.nodeId, (exposure.get(q.nodeId) ?? 0) + 1);
      const key = skillKey(q);
      skills.set(key, (skills.get(key) ?? 0) + 1);
      lastSeen.set(q.nodeId, ++turn);
      previousNode = q.nodeId;
    },
  };
}
