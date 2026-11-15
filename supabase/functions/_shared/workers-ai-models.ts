export const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
export const GLM = '@cf/zai-org/glm-4.7-flash';
export const GPT_OSS = '@cf/openai/gpt-oss-120b';
export type ReviewModel = typeof GEMMA | typeof GLM;
export type WorkersModel = ReviewModel | typeof GPT_OSS;

export function isReviewModel(value: unknown): value is ReviewModel {
  return value === GEMMA || value === GLM;
}

export function reviewModelOrder(light: boolean, override: string): [ReviewModel, ReviewModel] {
  const value = override.trim();
  if (value && !isReviewModel(value)) throw new Error('CF_AI_MODEL 只能配置为 Gemma 4 或 GLM-4.7 Flash');
  const first = value || (light ? GLM : GEMMA);
  return first === GLM ? [GLM, GEMMA] : [GEMMA, GLM];
}
