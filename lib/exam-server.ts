import { runJSON } from './ai-server';
import {
  EXAM_FORMAT,
  examStages,
  examNode,
  type ExamSlot,
  type ExamOptions,
  type ExamKind,
} from './exam-model';
import { questionSchema } from './importer';
import { assertQuestionFormat } from './question-tools';
import { z } from 'zod';
const requestSchema = z.object({
  exam: z.enum(['SAT', 'ACT']),
  options: z.object({ writing: z.boolean() }),
});
function context(b: any) {
  const { exam, options } = requestSchema.parse(b);
  if (b.format !== EXAM_FORMAT) throw new Error('请选择英语专项试卷');
  const stages = examStages(exam, options);
  return { exam, options, stages };
}
export async function examPassage(b: any) {
  const { exam, stages } = context(b);
  if (
    exam !== 'ACT' ||
    typeof b.group !== 'string' ||
    !stages.some((s) => s.slots.some((x) => x.group === b.group))
  )
    throw new Error('无效材料组');
  const group = b.group as string;
  const kind = group.split('-')[0];
  const index = Number(group.split('-')[1]);
  const requirement =
    kind === 'english'
      ? `${index < 4 ? '320-380' : '170-210'} words, coherent edited prose, label sentences [1], [2], etc. Include enough natural grammar/editing targets for ${index < 4 ? 10 : 5} distinct questions. No deliberate gibberish. Topics rotate memoir, history, science, arts.`
      : kind === 'reading'
        ? `650-750 words. Set ${index}: ${['literary narrative', 'social science informational article', 'paired humanities passages labeled Passage A and Passage B', 'natural science article with a small quantitative table'][index]}. Sufficient detail for nine distinct questions. Number paragraphs.`
        : '';
  const v = await runJSON(
    `Write ONE entirely original ACT ${kind} shared passage for a complete practice exam. ${requirement} ${kind === 'reading' ? 'Aim for 10 substantial paragraphs of approximately 70-75 words each, totaling at least 650 words. Short summaries will be rejected.' : ''} Return {passage:string}. No questions or answers. Do not copy official exam material.`,
    { group, seed: crypto.randomUUID() },
    0,
    false,
    5000,
  );
  let passage = z.string().min(400).max(16000).parse(v.passage);
  let words = passage.trim().split(/\s+/).length;
  const bounds =
    kind === 'reading' ? [650, 850] : index < 4 ? [280, 420] : [150, 250];
  for (
    let attempt = 0;
    attempt < 2 && (words < bounds[0] || words > bounds[1]);
    attempt++
  ) {
    const revised = await runJSON(
      `Revise the entire original English exam passage to reach ${kind === 'reading' ? 750 : index < 4 ? 350 : 200} words. It currently has ${words} words, which is ${words < bounds[0] ? 'too short' : 'too long'}. ${words < bounds[0] ? 'Add substantial concrete details, dialogue, scene development and evidence; do not merely add one sentence.' : 'Condense while preserving every key fact and perspective.'} Preserve its genre, characters, factual consistency and shared-passage structure. Number paragraphs. Return {passage:string} containing the FULL revised passage. The minimum is ${bounds[0]} words and maximum ${bounds[1]}.`,
      { originalPassage: passage, requirement },
      attempt + 1,
      false,
      6500,
    );
    passage = z.string().min(400).max(16000).parse(revised.passage);
    words = passage.trim().split(/\s+/).length;
  }
  if (words < bounds[0] || words > bounds[1])
    throw new Error('阅读材料长度未通过检查，已丢弃');
  return { passage };
}
export async function examGenerate(b: any) {
  const { exam, stages } = context(b);
  const ids = z.array(z.string()).min(1).max(3).parse(b.slots);
  const slots = ids.map((id) =>
    stages.flatMap((s) => s.slots).find((x) => x.id === id),
  );
  if (slots.some((x) => !x)) throw new Error('无效组卷位置');
  const targets = slots as ExamSlot[];
  const passage = z
    .string()
    .max(16000)
    .parse(b.passage ?? '');
  if (targets.some((x) => x.group) && !passage)
    throw new Error('缺少共享阅读材料');
  const essay = targets[0].type === 'subjective';
  const outputItem = z.object({
    slotId: z.enum(ids as [string, ...string[]]),
    prompt: z.string().min(1),
    answer: z.string().min(1),
    explanation: z.string().min(1),
    ...(exam === 'SAT' ? { passage: z.string().min(80) } : {}),
    ...(essay
      ? {
          rubric: z
            .array(
              z.object({
                id: z.string(),
                title: z.string(),
                max: z.literal(6),
                description: z.string(),
                skillId: z.literal('apply'),
              }),
            )
            .length(4),
        }
      : { options: z.array(z.string()).length(4) }),
  });
  const outputSchema = z.toJSONSchema(
    z.object({ questions: z.array(outputItem).length(targets.length) }),
  ) as Record<string, unknown>;
  const v = await runJSON(
    `Create ${targets.length} entirely ORIGINAL ${exam} English-only simulation questions for the requested slots, no omitted slots. Follow the current digital SAT/enhanced ACT format. All question text and solutions in English. Return {questions:[{slotId,prompt,answer,explanation,options?:string[],passage?:string,solution?:string[],rubric?:[{id,title,max,description,skillId:"apply"}]}]}. Do not return rubric or solution for choice questions. Options must not have A/B/C/D prefixes. EXACTLY four choices for type choice; answer must equal the full option text. SAT reading/writing: the passage field is REQUIRED for EVERY question, including grammar and transitions. Put only the question instruction in prompt, and the entire reading text in passage. Each question has its OWN original 25-150-word text/pair, with relevant domain skill and exactly one valid choice. ACT shared passage must remain unchanged; reference its sentence/paragraph labels, quote the target phrase when asking an editing question. Vary question focus, do not repeat prior prompts. Difficulty mix within every module; higher/lower route changes average difficulty, not just one fixed difficulty. ACT Writing: one contemporary issue with three distinct perspectives; prompt asks own perspective and relation to given perspectives; rubric covers Ideas and Analysis, Development and Support, Organization, Language Use and Conventions, max6 each. Always provide meaningful detailed explanations; for choice explain each distractor. No math or science test sections. Keep all items focused on English language and reading skills.`,
    {
      targets,
      sections: stages.map((s) => s.section),
      sharedPassage: passage,
      previousPrompts: z
        .array(z.string().max(300))
        .max(12)
        .parse(b.previousPrompts ?? []),
      seed: crypto.randomUUID(),
    },
    0,
    false,
    7000,
    outputSchema,
  );
  if (!Array.isArray(v.questions) || v.questions.length !== targets.length)
    throw new Error('题组不完整，请继续准备');
  return {
    questions: targets.map((slot) => {
      const raw = v.questions.find((q: any) => q.slotId === slot.id);
      if (!raw) throw new Error('题组位置不匹配');
      const stage = stages[slot.stage],
        node = examNode(exam, slot, stage);
      const q = questionSchema.parse({
        ...raw,
        rubric:
          slot.type === 'subjective'
            ? raw.rubric?.map((r: any) => ({ ...r, skillId: 'apply' }))
            : undefined,
        schemaVersion: 1,
        id: crypto.randomUUID(),
        nodeId: node.id,
        skillId: 'apply',
        subject: node.subject,
        type: slot.type,
        passage: slot.group ? passage : raw.passage,
        difficulty:
          slot.route === 'higher' ? 4 : slot.route === 'lower' ? 2 : 3,
        expectedSeconds: Math.round(stage.seconds / stage.count),
        variant: exam + '-' + slot.domain + '-' + slot.index,
        source: exam + ' 原创模拟',
        tags: ['exam-only', exam, slot.domain],
        version: '1.0.0',
        verified: false,
      });
      assertQuestionFormat(q);
      if (slot.type === 'choice' && q.options?.length !== 4)
        throw new Error('必须为四选一');
      if (exam === 'SAT' && (!q.passage || q.passage.split(/\s+/).length < 20))
        throw new Error('SAT 阅读材料缺失');
      return { slotId: slot.id, question: q };
    }),
  };
}
const batchItem = z.object({
  slotId: z.string(),
  answer: z.string(),
  wellPosed: z.boolean(),
  unique: z.boolean(),
  steps: z.array(z.string()),
  optionChecks: z
    .array(
      z.object({
        index: z.number().int().min(1).max(4),
        correct: z.boolean(),
        reason: z.string(),
      }),
    )
    .optional(),
});
export async function examSolve(b: any) {
  const qs = z
    .array(z.object({ slotId: z.string(), question: questionSchema }))
    .min(1)
    .max(3)
    .parse(b.questions);
  const slot = z.number().int().min(1).max(3).parse(b.slot);
  const independent = qs.map(({ slotId, question: q }) => ({
    slotId,
    type: q.type,
    prompt: q.prompt,
    passage: q.passage,
    options: q.options,
  }));
  const v = await runJSON(
    `Independently solve each problem without access to the author's answers. Strategy ${slot}: ${['derive from first principles', 'use an alternative method and recalculate', 'look for ambiguity and check every condition'][slot - 1]}. Return {solutions:[{slotId,answer:string,wellPosed:boolean,unique:boolean,steps:string[],optionChecks?:[{index:1-based,correct:boolean,reason:string}]}]}. For choice test ALL FOUR options in full context and copy the full correct option into answer. More than one defensible answer fails uniqueness. For an essay unique=false is expected; give a possible thesis and assess whether the provided material is sufficient.`,
    { questions: independent },
    slot,
    true,
    7500,
  );
  const solutions = z.array(batchItem).length(qs.length).parse(v.solutions);
  if (
    new Set(solutions.map((s) => s.slotId)).size !== qs.length ||
    qs.some((q) => !solutions.some((s) => s.slotId === q.slotId))
  )
    throw new Error('核验缺项');
  return { solutions };
}
export async function examJudge(b: any) {
  const qs = z
    .array(z.object({ slotId: z.string(), question: questionSchema }))
    .min(1)
    .max(3)
    .parse(b.questions);
  const runs = z.array(z.array(batchItem)).min(1).max(3).parse(b.solvers);
  for (const { slotId, question: q } of qs)
    for (const run of runs) {
      const s = run.find((s) => s.slotId === slotId);
      if (!s || !s.wellPosed || (q.type !== 'subjective' && !s.unique))
        return { pass: false, reason: '条件或唯一性未通过核验' };
      if (
        q.type === 'choice' &&
        (!s.optionChecks ||
          s.optionChecks.length !== 4 ||
          new Set(s.optionChecks.map((x) => x.index)).size !== 4 ||
          s.optionChecks.filter((x) => x.correct).length !== 1)
      )
        return { pass: false, reason: '选项逐项核验不完整' };
    }
  const v = await runJSON(
    'Judge each original exam question against all independent solutions. Verify authored answer and explanation, unique choice, accurate calculations, natural language, correct SAT/ACT domain and sufficient passage evidence. Every distractor must be wrong for a concrete reason. If any item is unreliable reject the entire batch. Never pass merely because solvers agree. Return {pass:boolean,reason:string}.',
    { questions: qs, solvers: runs },
    0,
    true,
    6000,
  );
  return z.object({ pass: z.boolean(), reason: z.string() }).parse(v);
}
