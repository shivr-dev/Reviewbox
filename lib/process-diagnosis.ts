import { z } from 'zod';
import type { Question } from './model';
export const processRequest = z.object({
  question: z.any(),
  steps: z.array(z.string().trim().min(1).max(1800)).min(1).max(25),
});
export const processResult = z.object({
  status: z.enum(['first-error', 'gap', 'no-error-found', 'uncertain']),
  firstStep: z.number().int().min(0).max(24).nullable(),
  quote: z.string().max(1800),
  attribute: z
    .enum(['symbolic', 'calculation', 'causal', 'application'])
    .nullable(),
  explanation: z.string().min(1).max(3000),
  suggestion: z.string().min(1).max(3000),
  confidence: z.number().min(0).max(1),
});
export type ProcessResult = z.infer<typeof processResult>;
export type ProcessEvidence = {
  id: string;
  kind: 'process-evidence';
  questionId: string;
  questionVersion: string;
  sessionId: string;
  steps: string[];
  result: ProcessResult;
  at: string;
  afterReveal: boolean;
};
export function validateProcessResult(
  value: unknown,
  steps: string[],
): ProcessResult {
  const r = processResult.parse(value);
  if (r.status === 'first-error' || r.status === 'gap') {
    if (
      r.firstStep === null ||
      r.firstStep >= steps.length ||
      !r.quote.trim() ||
      !steps[r.firstStep].includes(r.quote.trim()) ||
      !r.attribute
    )
      throw new Error('诊断未能引用你的实际步骤，请重试；草稿已保留');
  } else if (r.firstStep !== null || r.attribute !== null)
    throw new Error('诊断结论与步骤不一致，请重试');
  return r;
}
export function directProcessEvidence(
  data: { jobs?: any[]; events: any[]; questions: Question[] },
  subject?: string,
) {
  return (data.jobs ?? [])
    .filter(
      (j): j is ProcessEvidence =>
        j.kind === 'process-evidence' &&
        !j.afterReveal &&
        j.result?.confidence >= 0.75 &&
        ['first-error', 'gap'].includes(j.result.status),
    )
    .filter(
      (j) =>
        data.events.some(
          (e) =>
            !e.voidedBy &&
            e.questionId === j.questionId &&
            e.sessionId === j.sessionId,
        ) &&
        data.questions.some(
          (q) =>
            q.id === j.questionId &&
            q.reviewStatus !== 'paused' &&
            (!subject || q.subject === subject),
        ),
    )
    .sort((a, b) => b.at.localeCompare(a.at));
}
