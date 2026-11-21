export const GEMMA = '@cf/google/gemma-4-26b-a4b-it';
export const GLM = '@cf/zai-org/glm-4.7-flash';
export const QWEN = '@cf/qwen/qwen3.8-27b';
export const GPT_OSS = '@cf/openai/gpt-oss-120b';
export type ReviewModel = typeof GLM | typeof QWEN;
export type WorkersModel = ReviewModel | typeof GEMMA | typeof GPT_OSS;

export function isReviewModel(value: unknown): value is ReviewModel {
  return value === GLM || value === QWEN;
}

export function reviewModelOrder(override: string): [ReviewModel, ReviewModel] {
  const value = override.trim();
  if (value && value !== GEMMA && !isReviewModel(value))
    throw new Error('CF_AI_MODEL 只能配置为 GLM-4.7 Flash 或 Qwen 3.8 27B');
  return value === QWEN ? [QWEN, GLM] : [GLM, QWEN];
}

export const workersProfiles = {
  [GLM]: { timeoutMs: 24000, temperature: 0.35, topP: 0.85, jsonMode: true },
  [QWEN]: { timeoutMs: 39000, temperature: 0.45, topP: 0.9, jsonMode: false },
  [GEMMA]: { timeoutMs: 55000, temperature: 0.4, topP: 0.85, jsonMode: true },
  [GPT_OSS]: { timeoutMs: 55000, temperature: 0.4, topP: 0.85, jsonMode: false },
} as const;
