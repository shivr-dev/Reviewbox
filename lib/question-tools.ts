import type { Question, StudyData } from './model';
export const QUESTION_TYPES = [
  { id: 'recall', label: '回忆卡' },
  { id: 'choice', label: '选择题' },
  { id: 'blank', label: '填空题' },
  { id: 'matching', label: '连线题' },
  { id: 'pinyin', label: '看拼音写汉字' },
  { id: 'subjective', label: '主观表达' },
];
export const isPinyin = (q: Question) =>
  q.type === 'pinyin' ||
  q.variant === 'pinyin-to-hanzi' ||
  /根据拼音|看拼音/.test(q.prompt);
export function wrongQuestions(data: StudyData) {
  const latest = new Map<string, StudyData['events'][number]>();
  for (const e of data.events)
    if (
      !latest.has(e.questionId) ||
      latest.get(e.questionId)!.occurredAt < e.occurredAt
    )
      latest.set(e.questionId, e);
  return data.questions.filter((q) => {
    const e = latest.get(q.id);
    return e && e.score < 0.85;
  });
}
export function blindSpots(data: StudyData) {
  const wrong = new Set(wrongQuestions(data).map((q) => q.id));
  return data.questions.filter(
    (q) =>
      wrong.has(q.id) &&
      data.events
        .filter((e) => e.questionId === q.id)
        .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0]
        ?.predictedConfidence === 'sure',
  );
}
const normalize = (s: string) =>
  s
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/−/g, '-')
    .replace(/\s+/g, '');
function numberValue(s: string): number | null {
  const t = normalize(s)
    .replace(/^\$\$?|\$\$?$/g, '')
    .replace(/^\\\(|\\\)$/g, '')
    .replace(/^\\\[|\\\]$/g, '')
    .replace(/\\(?:d|t)?frac\{([+-]?\d+)\}\{(\d+)\}/g, '$1/$2')
    .replace(/⁄/g, '/')
    .replace(/^[a-z]=/i, '')
    .replace(/,/g, '');
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(t)) return Number(t);
  const m = t.match(/^([+-]?\d+)\/(\d+)$/);
  return m && Number(m[2]) !== 0 ? Number(m[1]) / Number(m[2]) : null;
}
export function objectiveScore(q: Question, answer: string): number {
  if (!answer.trim()) return 0;
  if (q.examTask?.parts) {
    try {
      const a = JSON.parse(answer),
        b = JSON.parse(q.answer);
      return b.length
        ? b.filter(
            (v: string, i: number) =>
              normalize(v) === normalize(String(a[i] ?? '')),
          ).length / b.length
        : 0;
    } catch {
      return 0;
    }
  }
  if (q.type === 'matching') {
    try {
      const a = JSON.parse(answer),
        b = JSON.parse(q.answer);
      const keys = Object.keys(b);
      return keys.length
        ? keys.filter((k) => a[k] === b[k]).length / keys.length
        : 0;
    } catch {
      return 0;
    }
  }
  const choices = [q.answer, ...(q.acceptedAnswers ?? [])];
  return choices.some((b) => {
    if (normalize(answer) === normalize(b)) return true;
    if (q.subject === 'math' && !q.options?.length) {
      const aN = numberValue(answer),
        bN = numberValue(b);
      return aN !== null && bN !== null && Math.abs(aN - bN) < 1e-8;
    }
    return false;
  })
    ? 1
    : 0;
}
export function assertQuestionFormat(q: Question) {
  if (!QUESTION_TYPES.some((t) => t.id === q.type))
    throw new Error('不支持的题型：' + q.type);
  if (
    q.type === 'choice' &&
    (!q.options ||
      q.options.length < 2 ||
      new Set(q.options).size !== q.options.length ||
      !q.options.includes(q.answer))
  )
    throw new Error('选择题必须有唯一选项，答案须为完整选项文字');
  if (q.type === 'matching') {
    const m = q.matching;
    let a: Record<string, string>;
    try {
      a = JSON.parse(q.answer);
    } catch {
      throw new Error('连线题答案必须为左右 ID 对应的 JSON 字符串');
    }
    if (
      !m ||
      m.left.length < 2 ||
      m.left.length !== m.right.length ||
      new Set([...m.left, ...m.right].map((x) => x.id)).size !==
        m.left.length + m.right.length ||
      Object.keys(a).length !== m.left.length ||
      !m.left.every((l) => m.right.some((r) => r.id === a[l.id])) ||
      new Set(Object.values(a)).size !== m.right.length
    )
      throw new Error('连线题需要两组独立 ID 和一一对应的完整答案');
  }
  if (q.type === 'subjective' && !q.rubric?.length)
    throw new Error('主观题必须有评分标准');
}
