import { runJSON } from './ai-server';
import { questionSchema } from './importer';
import { processRequest, validateProcessResult } from './process-diagnosis';
export async function diagnoseProcess(raw: unknown) {
  const b = processRequest.parse(raw),
    q = questionSchema.parse(b.question);
  if (!['math', 'physics'].includes(q.subject))
    throw new Error('过程诊断目前支持数学与物理');
  const value = await runJSON(
    'Analyze the actual student solution steps in order, independently checking the reference answer. Return {status:"first-error"|"gap"|"no-error-found"|"uncertain",firstStep:zero-based index or null,quote:verbatim substring of that student step,attribute:"symbolic"|"calculation"|"causal"|"application"|null,explanation:string,suggestion:string,confidence:0..1}. Identify ONLY the earliest demonstrable incorrect inference, calculation, physical model or unsupported transition. Later errors caused by it are not separate causes. A concise valid derivation is not an error. If a step cannot be read, reference seems wrong, or there is insufficient evidence, abstain as uncertain. For no-error-found/uncertain firstStep and attribute must be null. Use formal Chinese, cite actual steps, explain the reasoning and how to correct it. Do not assign an answer score, claim definite cognitive deficits, or infer handwriting not supplied.',
    { question: q, steps: b.steps },
    1,
    true,
    4500,
  );
  return validateProcessResult(value, b.steps);
}
