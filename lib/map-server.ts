import { z } from 'zod';
import { runJSON } from './ai-server';
import { EXAM_FORMAT, examStages } from './exam-model';
import { mapItemSchema, parseMapQuestion, mapScore } from './map-model';
import { questionSchema } from './importer';
import type { Question } from './model';
const optionsSchema = z
  .object({
    writing: z.literal(false),
    mapSection: z.enum(['Reading', 'Language Usage']),
    grade: z.number().int().min(2).max(12),
    count: z.number().int().min(1).max(43),
    poolSize: z.number().int().min(1).max(120),
  })
  .refine((v) => v.poolSize >= v.count);
export async function mapGenerate(b: Record<string, unknown>) {
  if (b.format !== EXAM_FORMAT) throw Error('MAP 试卷格式无效。');
  const options = optionsSchema.parse(b.options),
    stage = examStages('MAP', options)[0];
  const ids = z.array(z.string()).min(1).max(3).parse(b.slots);
  const slots = ids.map((id) => stage.slots.find((s) => s.id === id));
  if (slots.some((s) => !s)) throw Error('MAP 题池位置无效。');
  const types =
    options.mapSection === 'Reading'
      ? ['mcq', 'multi_select', 'two_part', 'gap_match']
      : ['mcq', 'multi_select', 'gap_match', 'hot_text', 'text_entry'];
  const targets = slots.map((s) => ({
    ...s,
    type: types[s!.index % types.length],
    difficulty: 1 + (Math.floor(s!.index / 3) % 5),
  }));
  const schema = z.object({
    questions: z
      .array(mapItemSchema.extend({ slotId: z.string() }))
      .length(ids.length),
  });
  const value = await runJSON(
    `Create original English MAP Growth-style ${options.mapSection} practice items for Grade ${options.grade}. Do not copy NWEA material. Follow each target type and skill/domain, with meaningful authentic passage evidence, difficulty 1–5, and detailed explanations. Return {questions:[{slotId,type,prompt,passage,passageTitle,choices?,answer,explanation,skill,difficulty,selectCount?,parts?,tokens?,correction?}]}. mcq answer is full option text. multi_select answer is array of complete choices; selectCount matches length. two_part has parts:[{prompt,choices,answer},{prompt,choices,answer}], answer array of the two answers; Part B is evidence supporting Part A. gap_match passage has numbered {{1}},{{2}} etc, choices is word bank with distractors, answer is ordered word array, never reuse a word. hot_text passage marks selectable words with [word], tokens lists these words, answer is the incorrect word, correction is its correct replacement; create exactly one genuine error. text_entry answer is a short English correction. Keep passages complete, never omit evidence. Reading covers literary text, informational text, vocabulary in context. Language Usage covers audience/purpose/revision/cohesion, grammar/usage, punctuation/capitalization/spelling. All text plain strings, no HTML/scripts or external resource URLs. Avoid prior prompts.`,
    {
      targets,
      grade: options.grade,
      previousPrompts: b.previousPrompts ?? [],
      seed: crypto.randomUUID(),
    },
    0,
    false,
    9000,
    z.toJSONSchema(schema) as Record<string, unknown>,
  );
  const raw = schema.parse(value);
  if (new Set(raw.questions.map((q) => q.slotId)).size !== ids.length)
    throw Error('MAP 题组位置重复。');
  return {
    questions: slots.map((slot) => {
      const item = raw.questions.find((q) => q.slotId === slot!.id);
      if (!item) throw Error('MAP 题组缺项。');
      if (item.type !== targets.find((t) => t.id === slot!.id)!.type)
        throw Error('MAP 题型不匹配。');
      const { question } = parseMapQuestion(
        { ...item, skill: slot!.domain },
        crypto.randomUUID(),
        slot!,
        stage,
      );
      return { slotId: slot!.id, question };
    }),
  };
}
const solutionSchema = z.object({
  slotId: z.string(),
  answer: z.string(),
  wellPosed: z.boolean(),
  unique: z.boolean(),
  steps: z.array(z.string()).min(1),
});
const batch = (b: Record<string, unknown>) =>
  z
    .array(z.object({ slotId: z.string(), question: questionSchema }))
    .min(1)
    .max(3)
    .parse(b.questions);
export async function mapSolve(b: Record<string, unknown>) {
  const questions = batch(b);
  const hidden = questions.map(({ slotId, question: q }) => {
    const m = mapItemSchema.parse(q.examTask?.map);
    const {
      answer: _answer,
      explanation: _explanation,
      correction: _correction,
      acceptedAnswers: _acceptedAnswers,
      ...item
    } = m;
    return {
      slotId,
      ...item,
      parts: item.parts?.map(({ answer: _partAnswer, ...p }) => p),
    };
  });
  const v = await runJSON(
    'Independently solve each original MAP-style item, without author answers. Check every distractor and ambiguity. Return {solutions:[{slotId,answer:string,wellPosed:boolean,unique:boolean,steps:string[]}]}. For mcq/text_entry use plain full answer text. For multi_select answer string encodes JSON array of chosen full choices. gap_match uses JSON array in blank order. two_part uses JSON array [Part A full choice,Part B full choice]. hot_text correction uses JSON array [incorrect word,correct replacement]. unique means exactly one valid response set, even for multiple-select. Reject insufficient evidence.',
    { questions: hidden },
    1,
    true,
    8000,
  );
  const solutions = z
    .array(solutionSchema)
    .length(questions.length)
    .parse(v.solutions);
  if (
    new Set(solutions.map((s) => s.slotId)).size !== questions.length ||
    questions.some((q) => !solutions.some((s) => s.slotId === q.slotId))
  )
    throw Error('MAP 独立核验缺项。');
  return { solutions };
}
export async function mapJudge(b: Record<string, unknown>) {
  const questions = batch(b),
    runs = z.array(z.array(solutionSchema)).min(1).max(3).parse(b.solvers);
  if (
    questions.some((q) =>
      runs.some((r) => {
        const s = r.find((s) => s.slotId === q.slotId);
        return (
          !s ||
          !s.wellPosed ||
          !s.unique ||
          mapScore(q.question as Question, s.answer) !== 1
        );
      }),
    )
  )
    return { pass: false, reason: 'MAP 独立答案或唯一性核验不一致。' };
  const v = await runJSON(
    'Review each original MAP-style item and its independent solution. Verify skill alignment, complete passage evidence, unique correct response set, plausible distractors, appropriate difficulty, interaction structure and accurate explanation. Reject any unreliable item. Return {pass:boolean,reason:string}.',
    { questions, solvers: runs },
    2,
    true,
    5000,
  );
  return z.object({ pass: z.boolean(), reason: z.string() }).parse(v);
}
