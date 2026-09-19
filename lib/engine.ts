import {
  keyOf,
  localDay,
  type Mastery,
  type AnswerEvent,
  type Node,
  type Exam,
  type StudyData,
  type QueueItem,
} from './model';
export const DAY = 86400000;
const clamp = (x: number, a = 0, b = 1) => Math.max(a, Math.min(b, x));
export function initial(nodeId: string, skillId: string): Mastery {
  return {
    nodeId,
    skillId,
    mastery: 0.35,
    stability: 0.5,
    confidence: 0.5,
    lastReviewed: null,
    lastSuccess: null,
    checkpoint: null,
    checkpointVariant: '',
    stage: 0,
    nextReview: null,
    attemptCount: 0,
    errorCount: 0,
    gainDay: '',
    dailyGain: 0,
    lastFailure: null,
  };
}
export function applyAnswer(old: Mastery, e: AnswerEvent): Mastery {
  const s = { ...old };
  const now = Date.parse(e.occurredAt);
  if (
    !Number.isFinite(now) ||
    !Number.isFinite(e.score) ||
    e.score < 0 ||
    e.score > 1
  )
    return s;
  const validTime =
    Number.isFinite(e.activeThinkMs) &&
    e.activeThinkMs >= 0 &&
    e.activeThinkMs <= 86400000;
  const minMs = Math.max(1500, Math.min(5000, e.expectedSeconds * 200));
  let quality = e.source === 'rubric' ? 0.95 : 0.85;
  if (!validTime || e.activeThinkMs < minMs) quality *= 0.2;
  if (e.usedHint) quality *= 0.65;
  const fluency = clamp(
    Math.sqrt(
      (e.expectedSeconds * 1000) /
        Math.max(e.expectedSeconds * 1000, e.activeThinkMs),
    ),
    0.55,
    1,
  );
  const sameDay = s.gainDay === e.localDay;
  if (!sameDay) {
    s.gainDay = e.localDay;
    s.dailyGain = 0;
  }
  const reliable =
    e.score >= 0.85 && quality >= 0.65 && !e.usedHint && validTime;
  let advanced = false;
  if (reliable) {
    s.lastSuccess = e.occurredAt;
    if (!s.checkpoint) {
      s.checkpoint = e.occurredAt;
      s.checkpointVariant = e.variant;
      s.stability = Math.max(1, s.stability);
    } else {
      const gap = [1, 3, 7, Math.max(7, s.stability * 0.6)][s.stage];
      const level = s.mastery < 0.45 ? 1 : s.mastery < 0.7 ? 2 : 3;
      if (
        now - Date.parse(s.checkpoint) >= gap * DAY &&
        s.checkpointVariant !== e.variant &&
        e.difficulty >= level
      ) {
        s.stage = Math.min(3, s.stage + 1);
        s.stability = Math.min(180, s.stability * 3 * fluency);
        s.checkpoint = e.occurredAt;
        s.checkpointVariant = e.variant;
        advanced = true;
      }
    }
  }
  const weight = clamp(e.evidenceWeight ?? 1);
  const evidence = clamp((e.score - 0.6) / 0.4, -1, 1) * weight;
  if (evidence > 0) {
    const gain = Math.max(
      0,
      Math.min(
        0.22 *
          (1 - s.mastery) *
          evidence *
          quality *
          fluency *
          (0.65 + 0.1 * e.difficulty),
        0.08 - s.dailyGain,
        [0.7, 0.82, 0.91, 0.99][s.stage] - s.mastery,
      ),
    );
    s.mastery += gain;
    s.dailyGain += gain;
  } else
    s.mastery += (0.12 + 0.2 * s.mastery) * evidence * Math.max(0.6, quality);
  s.mastery = clamp(s.mastery, 0, 0.99);
  if (e.score < 0.4) {
    s.stability = Math.max(0.25, s.stability * 0.25);
    s.stage = 0;
    s.checkpoint = null;
    s.lastFailure = e.occurredAt;
    s.errorCount++;
  }
  const cap =
    s.mastery < 0.45
      ? 1
      : s.mastery < 0.65
        ? 3
        : s.mastery < 0.8
          ? 7
          : s.mastery < 0.9
            ? 14
            : 180;
  let interval =
    e.score < 0.4
      ? 1
      : e.score < 0.65
        ? Math.min(1, Math.max(0.25, s.stability * 0.35))
        : Math.min(
            cap,
            s.stability *
              (0.8 + 0.7 * s.mastery) *
              fluency *
              clamp(quality / 0.85, 0.25, 1),
          );
  let due = now + interval * DAY;
  if (s.stage < 3 && s.checkpoint)
    due = Math.min(due, Date.parse(s.checkpoint) + [1, 3, 7][s.stage] * DAY);
  if (sameDay && old.nextReview && !advanced)
    due = Math.min(due, Date.parse(old.nextReview));
  s.nextReview = new Date(Math.max(now + 60000, due)).toISOString();
  s.lastReviewed = e.occurredAt;
  s.attemptCount++;
  s.confidence = 0.9 * s.confidence + 0.1 * quality;
  return s;
}
export function computeMastery(nodes: Node[], events: AnswerEvent[]) {
  const map: Record<string, Mastery> = {};
  for (const n of nodes)
    for (const skill of n.skills)
      map[keyOf(n.id, skill.id)] = initial(n.id, skill.id);
  const seen = new Set<string>();
  for (const e of [...events].sort(
    (a, b) =>
      a.occurredAt.localeCompare(b.occurredAt) || a.id.localeCompare(b.id),
  )) {
    if (seen.has(e.id)) continue;
    seen.add(e.id);
    const targets = e.targets?.length
      ? e.targets
      : [{ skillId: e.skillId, score: e.score, weight: 1 }];
    for (const target of targets) {
      const k = keyOf(e.nodeId, target.skillId);
      map[k] = applyAnswer(map[k] ?? initial(e.nodeId, target.skillId), {
        ...e,
        skillId: target.skillId,
        score: target.score,
        evidenceWeight: target.weight,
      });
    }
  }
  return map;
}
export function forgettingRisk(s: Mastery, now = Date.now()) {
  return s.lastSuccess
    ? clamp(
        1 -
          Math.exp(
            -Math.max(0, now - Date.parse(s.lastSuccess)) /
              DAY /
              Math.max(0.25, s.stability),
          ),
      )
    : 0;
}
export function nodeMastery(n: Node, states: Record<string, Mastery>) {
  const items = n.skills
    .map((x) => states[keyOf(n.id, x.id)])
    .filter((x) => x?.attemptCount);
  return items.length
    ? items.reduce((a, s) => a + s.mastery, 0) / items.length
    : null;
}
export function priority(
  n: Node,
  s: Mastery,
  events: AnswerEvent[],
  exams: Exam[],
  now: number,
) {
  const today = localDay(new Date(now));
  const done = events.filter(
    (e) => e.nodeId === n.id && e.skillId === s.skillId && e.localDay === today,
  );
  const errors = events
    .filter(
      (e) =>
        e.nodeId === n.id &&
        e.skillId === s.skillId &&
        now - Date.parse(e.occurredAt) < 14 * DAY,
    )
    .reduce(
      (a, e) =>
        a +
        (1 - e.score) * Math.exp(-(now - Date.parse(e.occurredAt)) / DAY / 3),
      0,
    );
  const exam = Math.max(
    0,
    ...exams
      .filter(
        (e) =>
          e.subject === n.subject &&
          (!e.scope.length || e.scope.includes(n.id)) &&
          Date.parse(e.date + 'T23:59:59') >= now,
      )
      .map(
        (e) => clamp(1 - (Date.parse(e.date) - now) / DAY / 21) * n.examWeight,
      ),
  );
  const overdue = s.nextReview
    ? clamp((now - Date.parse(s.nextReview)) / DAY / Math.max(1, s.stability))
    : 1;
  return (
    (0.28 * (1 - s.mastery) +
      0.22 * forgettingRisk(s, now) +
      0.15 * clamp(errors) +
      0.15 * exam +
      0.08 * n.importance +
      0.05 * overdue) /
    (1 + 0.45 * done.length)
  );
}
function hash(s: string) {
  let n = 2166136261;
  for (const c of s) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return (n >>> 0) / 4294967296;
}
export function buildQueue(
  data: StudyData,
  opts: {
    subject?: string;
    scope?: string[];
    limit?: number;
    now?: number;
    practice?: boolean;
    test?: boolean;
  } = {},
): QueueItem[] {
  const now = opts.now ?? Date.now(),
    today = localDay(new Date(now));
  const states = computeMastery(data.nodes, data.events);
  const target =
    opts.limit ??
    Math.max(5, Math.floor((data.settings.dailyMinutes * 60) / 55));
  const active = data.nodes.filter(
    (n) =>
      (!opts.subject || n.subject === opts.subject) &&
      (!opts.scope?.length || opts.scope.includes(n.id)),
  );
  const candidates: QueueItem[] = [];
  const mastered: QueueItem[] = [];
  for (const n of active)
    for (const skill of n.skills) {
      const s = states[keyOf(n.id, skill.id)] ?? initial(n.id, skill.id);
      const history = data.events.filter(
        (e) => e.nodeId === n.id && e.skillId === skill.id,
      );
      const practiced = history.filter((e) => e.localDay === today);
      if (!opts.test && practiced.length >= 4) continue;
      const high = s.mastery >= 0.9 && s.stage === 3;
      const due = !s.nextReview || Date.parse(s.nextReview) <= now;
      if (
        !opts.practice &&
        !opts.test &&
        !due &&
        !(s.mastery < 0.45 && practiced.length < 2)
      ) {
        if (
          !(
            high &&
            data.settings.surprise &&
            s.lastReviewed &&
            now - Date.parse(s.lastReviewed) >= 7 * DAY
          )
        )
          continue;
      }
      const desired =
        s.mastery < 0.45 ? 1 : s.mastery < 0.65 ? 2 : s.mastery < 0.85 ? 3 : 4;
      const qs = data.questions
        .filter(
          (q) =>
            !q.tags.includes('exam-only') &&
            !q.tags.includes('course-check') &&
            (!q.tags.includes('course-content') ||
              (data.jobs ?? []).some(
                (c) =>
                  c.kind === 'course' &&
                  c.sections?.some(
                    (section: any) =>
                      section.content &&
                      q.id.startsWith(
                        'lesson-q:' +
                          section.id +
                          ':' +
                          section.revision +
                          ':practice:',
                      ),
                  ),
              )) &&
            q.nodeId === n.id &&
            q.skillId === skill.id &&
            (!q.expiresAt || Date.parse(q.expiresAt) > now),
        )
        .sort((a, b) => {
          const last = (id: string) =>
            history.filter((e) => e.questionId === id).at(-1)?.occurredAt ??
            '1970';
          const rank = (q: typeof a) =>
            Math.abs(q.difficulty - desired) * 2 +
            (practiced.some((e) => e.questionId === q.id) ? 20 : 0) +
            (last(q.id) !== '1970' ? 1 : 0) +
            hash(today + q.id);
          return rank(a) - rank(b);
        });
      for (const q of qs.slice(0, 2)) {
        let reason = !s.attemptCount
          ? '初次诊断'
          : s.mastery < 0.45
            ? '巩固基础'
            : due
              ? '间隔复习'
              : '专项练习';
        let p = priority(n, s, data.events, data.exams, now);
        const recent = history
          .slice()
          .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0];
        if (recent?.predictedConfidence === 'sure' && recent.score < 0.6) {
          p += 0.15;
          reason = '信心校准';
        }
        const weakPre = n.prerequisites
          .map((id) => data.nodes.find((x) => x.id === id))
          .filter(Boolean)
          .find((x) => (nodeMastery(x!, states) ?? 0.35) < 0.45);
        if (weakPre && s.mastery < 0.45) {
          p *= 0.8;
          reason = '基础诊断';
        }
        if (
          data.exams.some(
            (e) =>
              e.subject === n.subject &&
              (!e.scope.length || e.scope.includes(n.id)) &&
              Date.parse(e.date) > now &&
              Date.parse(e.date) - now < 14 * DAY,
          )
        )
          reason = '考试准备';
        const item = {
          question: q,
          priority: p,
          reason,
          scaffold: s.mastery < 0.35 ? n.description : undefined,
        };
        if (high && !due && !opts.practice && !opts.test) {
          item.reason = '随机抽查';
          mastered.push(item);
        } else candidates.push(item);
      }
    }
  // Add weak prerequisites before the dependent skill, without forcing repeats.
  for (const c of candidates) {
    if (active.some((n) => n.prerequisites.includes(c.question.nodeId))) {
      c.priority += 0.07;
      if (c.reason === '巩固基础') c.reason = '前置诊断';
    }
  }
  candidates.sort(
    (a, b) =>
      b.priority - a.priority ||
      hash(today + a.question.id) - hash(today + b.question.id),
  );
  const queue: QueueItem[] = [];
  const perSkill = new Map<string, number>();
  let seconds = 0;
  while (candidates.length && queue.length < target) {
    const idx = candidates.findIndex((c) => {
      const k = keyOf(c.question.nodeId, c.question.skillId);
      return (
        (perSkill.get(k) ?? 0) < 2 &&
        !queue
          .slice(-3)
          .some((x) => keyOf(x.question.nodeId, x.question.skillId) === k) &&
        queue.at(-1)?.question.nodeId !== c.question.nodeId &&
        !queue.some((x) => x.question.id === c.question.id)
      );
    });
    if (idx < 0) break;
    const c = candidates.splice(idx, 1)[0];
    if (
      !opts.test &&
      seconds + c.question.expectedSeconds > data.settings.dailyMinutes * 60 &&
      queue.length
    )
      continue;
    queue.push(c);
    seconds += c.question.expectedSeconds;
    const k = keyOf(c.question.nodeId, c.question.skillId);
    perSkill.set(k, (perSkill.get(k) ?? 0) + 1);
  }
  const surpriseCount =
    data.settings.surprise && !opts.practice && !opts.test
      ? Math.min(
          Math.floor(target * 0.075) +
            (hash(today + 'surprise') < (target * 0.075) % 1 ? 1 : 0),
          Math.ceil(target * 0.1),
        )
      : 0;
  const pool = mastered.sort(
    (a, b) => hash(today + a.question.id) - hash(today + b.question.id),
  );
  const used = new Set<string>();
  for (const c of pool) {
    if (used.size >= surpriseCount) break;
    const k = keyOf(c.question.nodeId, c.question.skillId);
    if (used.has(k)) continue;
    used.add(k);
    if (queue.length >= target) queue.pop();
    queue.splice(Math.min(queue.length, Math.floor(queue.length * 0.65)), 0, c);
  }
  return queue;
}
