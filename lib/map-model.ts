import { z } from 'zod';
import type { Question } from './model';
import {
  createRun,
  examNode,
  examStages,
  type ExamPaper,
  type ExamRun,
  type ExamSlot,
  type ExamStage,
} from './exam-model';
import { questionSchema } from './importer';
const text = z.string().trim().min(1).max(12000);
const choicePart = z.object({
  prompt: text,
  choices: z.array(text).min(2).max(6),
  answer: text,
});
export const mapItemSchema = z.object({
  type: z.enum([
    'mcq',
    'multi_select',
    'gap_match',
    'text_entry',
    'hot_text',
    'two_part',
  ]),
  prompt: text,
  passage: z.string().max(30000).optional(),
  passageTitle: z.string().max(300).optional(),
  instruction: z.string().max(1000).optional(),
  choices: z.array(text).min(2).max(6).optional(),
  answer: z.union([text, z.array(text).min(1).max(12)]),
  explanation: text,
  skill: z.string().min(1).max(80),
  difficulty: z.number().int().min(1).max(5).default(3),
  selectCount: z.number().int().min(1).max(6).optional(),
  parts: z.array(choicePart).length(2).optional(),
  tokens: z.array(text).min(2).max(12).optional(),
  correction: text.optional(),
  acceptedAnswers: z.array(text).max(20).optional(),
  image: z
    .string()
    .max(1500000)
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/)
    .optional(),
  imageAlt: z.string().max(1000).optional(),
  layout:z.literal('word-table').optional(),
  word:z.string().max(300).optional(),
});
export type MapItem = z.infer<typeof mapItemSchema>;
export const MAP_TYPES = [
  ['mcq', '单项选择'],
  ['multi_select', '多项选择'],
  ['two_part', '两部分证据题'],
  ['gap_match', '拖放填空'],
  ['hot_text', '选词纠错'],
  ['text_entry', '文本填空'],
] as const;
const unique = (xs: string[]) => new Set(xs).size === xs.length;
export function parseMapQuestion(
  input: unknown,
  id: string,
  slot: ExamSlot,
  stage: ExamStage,
) {
  const parsed = mapItemSchema.safeParse(input);
  if (!parsed.success)
    throw Error(
      'MAP 题目字段不完整或不符合格式：' +
        parsed.error.issues
          .map((i) => i.path.join('.'))
          .slice(0, 5)
          .join('、') +
        '。请参考对应题型模板。',
    );
  const v = parsed.data;
  if(v.layout==='word-table'&&(v.type!=='gap_match'||!v.word||!Array.isArray(v.answer)||v.answer.length!==1))
    throw Error('词义表格采用单空 gap_match，并提供 word。');
  const values = Array.isArray(v.answer) ? v.answer : [v.answer];
  if (v.choices && !unique(v.choices)) throw Error('MAP 选项不得重复。');
  if (
    v.type === 'mcq' &&
    (!v.choices || values.length !== 1 || !v.choices.includes(values[0]))
  )
    throw Error('MAP 单选题答案必须是完整的正确选项。');
  if (
    v.type === 'multi_select' &&
    (!v.choices ||
      !Array.isArray(v.answer) ||
      !unique(values) ||
      !values.every((a) => v.choices!.includes(a)) ||
      values.length !== (v.selectCount ?? values.length))
  )
    throw Error('MAP 多选题答案与选项或要求的数量不一致。');
  if (
    v.type === 'two_part' &&
    (!v.parts ||
      !v.parts.every((p) => unique(p.choices) && p.choices.includes(p.answer)))
  )
    throw Error('MAP 两部分题需要两个完整、有效的选择题。');
  if (v.type === 'gap_match') {
    const blanks = [...(v.passage ?? '').matchAll(/\{\{(\d+)\}\}/g)].map((m) =>
      Number(m[1]),
    );
    if (
      !v.choices ||
      !Array.isArray(v.answer) ||
      (v.layout!=='word-table' && blanks.length !== values.length) ||
      !blanks.every((n, i) => n === i + 1) ||
      !values.every((a) => v.choices!.includes(a)) ||
      !unique(values)
    )
      throw Error(
        '拖放题用 {{1}}、{{2}} 依次标空，答案数组必须与空格及词库对应，词块不得重复使用。',
      );
  }
  if (
    v.type === 'hot_text' &&
    (!v.tokens ||
      !unique(v.tokens) ||
      !v.tokens.every((t) => (v.passage ?? '').includes('[' + t + ']')) ||
      typeof v.answer !== 'string' ||
      !v.tokens.includes(v.answer))
  )
    throw Error(
      '选词题需 tokens 数组，原文中的可选词写成 [word]，answer 为错误词。',
    );
  if (v.type === 'text_entry' && typeof v.answer !== 'string')
    throw Error('文本填空答案应为文字。');
  const node = examNode('MAP', { ...slot, domain: v.skill }, stage);
  let answer =
    typeof v.answer === 'string' ? v.answer : JSON.stringify(v.answer);
  if (v.type === 'two_part')
    answer = JSON.stringify(v.parts!.map((p) => p.answer));
  if (v.type === 'hot_text' && v.correction)
    answer = JSON.stringify([v.answer, v.correction]);
  const q = questionSchema.parse({
    schemaVersion: 1,
    id,
    nodeId: node.id,
    skillId: 'apply',
    subject: 'ce',
    type: v.type === 'mcq' ? 'choice' : 'blank',
    prompt: v.prompt,
    passage: v.passage,
    options: v.type === 'mcq' ? v.choices : undefined,
    answer,
    explanation: v.explanation,
    difficulty: v.difficulty,
    expectedSeconds: 90,
    variant: id,
    source: 'MAP 原创模拟',
    tags: ['exam-only', 'MAP'],
    version: '1',
    acceptedAnswers: v.acceptedAnswers,
  }) as Question;
  q.examTask = { type: v.type, map: v };
  return { question: q, node };
}
export function mapScore(q: Question, answer: string) {
  const item = q.examTask?.map;
  if (!item || !answer.trim()) return 0;
  const norm = (s: string) => s.trim().replace(/\s+/g, ' ').toLowerCase();
  if (
    item.type === 'mcq' ||
    item.type === 'text_entry' ||
    (item.type === 'hot_text' && !item.correction)
  )
    return [q.answer, ...(q.acceptedAnswers ?? [])].some(
      (s) => norm(s) === norm(answer),
    )
      ? 1
      : 0;
  try {
    const actual = JSON.parse(answer),
      expected = JSON.parse(q.answer);
    if (
      !Array.isArray(actual) ||
      !Array.isArray(expected) ||
      actual.some((v) => typeof v !== 'string')
    )
      return 0;
    if (item.type === 'multi_select')
      return unique(actual) &&
        actual.length === expected.length &&
        expected.every((v) => actual.includes(v))
        ? 1
        : 0;
    return actual.length === expected.length &&
      expected.every((v, i) => norm(v) === norm(actual[i]))
      ? 1
      : 0;
  } catch {
    return 0;
  }
}
export function mapAnswered(q: Question, answer: string) {
  const item = q.examTask?.map;
  if (!item) return !!answer.trim();
  if (
    ['mcq', 'text_entry'].includes(item.type) ||
    (item.type === 'hot_text' && !item.correction)
  )
    return !!answer.trim();
  try {
    const a = JSON.parse(answer);
    const count =
      item.type === 'multi_select'
        ? (item.selectCount ?? (item.answer as string[]).length)
        : item.type === 'two_part' || item.type === 'hot_text'
          ? 2
          : (item.answer as string[]).length;
    return (
      Array.isArray(a) &&
      a.length === count &&
      a.every((v) => typeof v === 'string' && v.trim())
    );
  } catch {
    return false;
  }
}
export function createMapRun(
  p: ExamPaper,
  questions: Question[],
  practice = false,
): ExamRun {
  const run = createRun(p),
    stage = examStages(p.exam, p.options)[0];
  const first = stage.slots
    .slice()
    .sort(
      (a, b) =>
        Math.abs(
          (questions.find((q) => q.id === p.questions[a.id])?.difficulty ?? 3) -
            3,
        ) -
        Math.abs(
          (questions.find((q) => q.id === p.questions[b.id])?.difficulty ?? 3) -
            3,
        ),
    )[0];
  return {
    ...run,
    deadline: 0,
    map: { order: [first.id], ability: 3, practice, entered: false },
  };
}
export function advanceMap(
  p: ExamPaper,
  run: ExamRun,
  questions: Question[],
  now = Date.now(),
): ExamRun {
  if (!run.map || run.status === 'complete') return run;
  const stage = examStages(p.exam, p.options)[0],
    current = run.map.order[run.index];
  const q = questions.find((q) => q.id === p.questions[current]);
  if (!q || !mapAnswered(q, run.answers[current] ?? ''))
    throw Error('请完成本题后继续。');
  const ability = Math.max(
    1,
    Math.min(
      5,
      run.map.ability + (mapScore(q, run.answers[current]) - 0.5) * 0.8,
    ),
  );
  if (run.map.order.length >= stage.count)
    return {
      ...run,
      status: 'complete',
      completedAt: new Date(now).toISOString(),
      map: { ...run.map, ability, checked: false },
    };
  const seen = new Set(run.map.order);
  const candidate = stage.slots
    .filter((s) => !seen.has(s.id))
    .sort((a, b) => {
      const cost = (s: ExamSlot) =>
        Math.abs(
          (questions.find((q) => q.id === p.questions[s.id])?.difficulty ?? 3) -
            ability,
        ) +
        run.map!.order.filter(
          (id) => stage.slots.find((t) => t.id === id)?.domain === s.domain,
        ).length *
          0.16;
      return cost(a) - cost(b);
    })[0];
  if (!candidate) throw Error('题池不足，请先补充题目。');
  return {
    ...run,
    index: run.index + 1,
    map: {
      ...run.map,
      ability,
      order: [...run.map.order, candidate.id],
      checked: false,
    },
  };
}
export function mapAnswerText(q: Question, answer = q.answer) {
  try {
    const v = JSON.parse(answer);
    if (Array.isArray(v)) return v.map((x, i) => `${i + 1}. ${x}`).join('\n');
  } catch {}
  return answer;
}
