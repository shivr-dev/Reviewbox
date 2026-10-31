import { z } from 'zod';
import type { Question, Grade } from './model';

export const gradingModes = [
  ['auto', '自动匹配'],
  ['points', '采点评分'],
  ['steps', '分步评分'],
  ['solo', 'SOLO 分类评价'],
  ['rubric-solo', '评分点 + SOLO'],
  ['custom', '自定义'],
] as const;
export const gradingModeSchema = z.enum([
  'auto',
  'points',
  'steps',
  'solo',
  'rubric-solo',
  'custom',
]);
export const scoringPolicySchema = z.object({
  mode: gradingModeSchema.default('auto'),
  preferences: z.string().max(3000).default(''),
});
export type ScoringPolicy = z.infer<typeof scoringPolicySchema>;
export const rubricItemSchema = z.object({
  id: z.string().min(1).max(160),
  title: z.string().min(1).max(300),
  max: z.number().positive().max(100),
  description: z.string().max(3000),
  skillId: z.string().min(1).max(160),
  fullCredit: z.string().max(3000).optional(),
  partialCredit: z.string().max(3000).optional(),
  deductions: z.string().max(3000).optional(),
  equivalentAnswers: z.array(z.string().max(1000)).max(20).optional(),
  independentCredit: z.boolean().optional(),
  carryForward: z.boolean().optional(),
});
export const soloLevelSchema = z.enum(['L1', 'L2', 'L3', 'L4', 'L5']);
export const soloNames = {
  L1: '前结构',
  L2: '单点结构',
  L3: '多点结构',
  L4: '关联结构',
  L5: '抽象拓展结构',
};
export const gradingRuleSchema = z
  .object({
    id: z.string().min(1).max(160),
    version: z.string().min(1).max(100),
    mode: gradingModeSchema,
    maxScore: z.number().positive().max(2000),
    criteria: z.array(rubricItemSchema).min(1).max(20),
    solo: z
      .object({
        levels: z
          .array(
            z.object({
              level: soloLevelSchema,
              description: z.string().min(1).max(2000),
            }),
          )
          .length(5),
        fullCreditLevel: soloLevelSchema,
      })
      .optional(),
  })
  .superRefine((r, ctx) => {
    if (new Set(r.criteria.map((c) => c.id)).size !== r.criteria.length)
      ctx.addIssue({
        code: 'custom',
        message: '评分点 ID 重复',
        path: ['criteria'],
      });
    if (
      Math.abs(r.criteria.reduce((n, c) => n + c.max, 0) - r.maxScore) > 0.00001
    )
      ctx.addIssue({
        code: 'custom',
        message: '评分点合计与满分不一致',
        path: ['maxScore'],
      });
    if (['solo', 'rubric-solo'].includes(r.mode) && !r.solo)
      ctx.addIssue({
        code: 'custom',
        message: 'SOLO 评价需要本题的五级描述',
        path: ['solo'],
      });
    if (r.solo && new Set(r.solo.levels.map((l) => l.level)).size !== 5)
      ctx.addIssue({
        code: 'custom',
        message: 'SOLO 等级必须包含 L1 至 L5 且不重复',
        path: ['solo'],
      });
  });
export type GradingRule = z.infer<typeof gradingRuleSchema>;

// Stable identity for legacy rubrics; a content change gets a new version, never regrades history.
function fingerprint(value: unknown) {
  const text = JSON.stringify(value);
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++)
    hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(16);
}
export function ruleForQuestion(
  q: Pick<Question, 'id' | 'rubric' | 'gradingRule' | 'answer'>,
): GradingRule {
  if (q.gradingRule) return gradingRuleSchema.parse(q.gradingRule);
  if (!q.rubric?.length)
    throw new Error('这道题还没有确认评分标准，请先在导入预览中补充。');
  return gradingRuleSchema.parse({
    id: 'rubric:' + q.id,
    version: 'legacy-' + fingerprint([q.rubric, q.answer]),
    mode: 'points',
    maxScore: q.rubric.reduce((n, c) => n + c.max, 0),
    criteria: q.rubric,
  });
}
export function rubricProblems(q: Question, skillIds?: string[]) {
  if (q.type !== 'subjective') return [];
  try {
    const rule = ruleForQuestion(q),
      problems: string[] = [];
    if (
      rule.criteria.some((c) => !c.description.trim() && !c.fullCredit?.trim())
    )
      problems.push('评分条件尚不完整');
    if (skillIds && rule.criteria.some((c) => !skillIds.includes(c.skillId)))
      problems.push('评分点引用了未知能力');
    return problems;
  } catch (e) {
    return [(e as Error).message];
  }
}
export const gradeResponseSchema = z.object({
  criteria: z
    .array(
      z.object({
        id: z.string(),
        score: z.number().nonnegative(),
        evidence: z.string().max(5000),
        missing: z.string().max(5000),
        suggestion: z.string().max(5000),
      }),
    )
    .min(1)
    .max(20),
  exampleAnswer: z.string().max(15000),
  feedback: z.string().max(8000),
  solo: z
    .object({
      level: soloLevelSchema,
      reason: z.string().min(1).max(4000),
      evidence: z.string().max(5000),
    })
    .optional(),
});
export function finalizeGrade(
  raw: unknown,
  q: Question,
  answer: string,
  model: string,
): Grade {
  const rule = ruleForQuestion(q), result=gradeResponseSchema.safeParse(raw);
  if(!result.success)throw new Error('批改结果格式不完整，作答已保留，未更新掌握度。请重试。');
  const parsed=result.data;
  if (
    parsed.criteria.length !== rule.criteria.length ||
    new Set(parsed.criteria.map((c) => c.id)).size !== rule.criteria.length
  )
    throw new Error('评分点不完整，作答已保留，未更新掌握度。');
  for (const c of parsed.criteria) {
    const criterion = rule.criteria.find((r) => r.id === c.id);
    if (!criterion || c.score > criterion.max)
      throw new Error('评分超出已确认的规则，作答已保留。');
    if (
      (c.score > 0 && !c.evidence.trim()) ||
      (c.evidence && !answer.includes(c.evidence))
    )
      throw new Error('评分缺少作答中的真实证据，作答已保留，请重试批改。');
  }
  if (
    rule.solo &&
    (!parsed.solo ||
      !rule.solo.levels.some((l) => l.level === parsed.solo!.level))
  )
    throw new Error('SOLO 评价不完整，作答已保留。');
  if (parsed.solo?.evidence && !answer.includes(parsed.solo.evidence))
    throw new Error('SOLO 证据未通过检查。');
  if (!rule.solo) delete parsed.solo;
  const score =
      Math.round(parsed.criteria.reduce((n, c) => n + c.score, 0) * 10000) /
      10000,
    fraction = score / rule.maxScore;
  return {
    ...parsed,
    score,
    maxScore: rule.maxScore,
    label:
      fraction >= 0.9
        ? '完全正确'
        : fraction >= 0.7
          ? '基本正确'
          : fraction >= 0.35
            ? '部分正确'
            : '需要再练',
    model,
    ruleId: rule.id,
    ruleVersion: rule.version,
    ruleSnapshot: structuredClone(rule),
    referenceSnapshot: q.answer,
  };
}
