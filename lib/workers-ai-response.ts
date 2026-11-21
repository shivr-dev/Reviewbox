import { GLM, QWEN, type WorkersModel } from '../supabase/functions/_shared/workers-ai-models';

export class WorkersModelOutputError extends Error {
  constructor(public reason: 'structure' | 'truncated' | 'reasoning-only') {
    super(reason);
    this.name = 'WorkersModelOutputError';
  }
}

function textParts(content: unknown[]): string {
  return content.map(part => {
    if (!part || typeof part !== 'object' || !('type' in part) ||
        (part.type !== 'text' && part.type !== 'output_text') ||
        !('text' in part) || typeof part.text !== 'string')
      throw new WorkersModelOutputError('structure');
    return part.text;
  }).join('');
}

/** The chat and native endpoints wrap the final answer differently. Reasoning is never a fallback. */
export function workersFinalContent(body: any, model?: WorkersModel): unknown {
  const result = body?.result ?? body;
  const choice = result?.choices?.[0];
  if (result?.status === 'incomplete' ||
      ['length', 'max_tokens'].some(reason => reason === choice?.finish_reason || reason === result?.finish_reason))
    throw new WorkersModelOutputError('truncated');
  if (choice?.message?.refusal || ['content_filter', 'tool_calls', 'function_call'].includes(choice?.finish_reason))
    throw new WorkersModelOutputError('structure');
  const chatContent = choice?.message?.content;
  const nativeContent = result?.response;
  let content = model === GLM ? chatContent ?? nativeContent
    : model === QWEN ? nativeContent ?? chatContent
    : chatContent ?? nativeContent ?? result?.output_text;
  if (content == null && Array.isArray(result?.output)) {
    const final = result.output.filter((part: any) => part?.type === 'message' && part.role === 'assistant');
    if (final.length) content = final.map((part: any) => textParts(part.content ?? [])).join('');
  }
  if (content === undefined && result?.reply !== undefined) content = result;
  if (Array.isArray(content)) content = textParts(content);
  if (typeof content !== 'string') {
    if (content != null) return content;
    if (choice?.message?.reasoning_content || choice?.message?.reasoning || result?.reasoning_content || result?.reasoning)
      throw new WorkersModelOutputError('reasoning-only');
    throw new WorkersModelOutputError('structure');
  }
  let text = content.replace(/^\uFEFF/, '').trim();
  for (const [open, close] of [
    [/^<think\s*>/i, /<\/think\s*>/i],
    [/^<\|channel>thought\b/i, /<channel\|>/i],
  ] as const) {
    while (open.test(text)) {
      const end = close.exec(text);
      if (!end) throw new WorkersModelOutputError('reasoning-only');
      text = text.slice(end.index + end[0].length).trim();
    }
  }
  // Some legacy responses omit the opening reasoning tag.
  const legacyClose = text.indexOf('</think>');
  if (legacyClose >= 0 && (text.indexOf('{') < 0 || legacyClose < text.indexOf('{')))
    text = text.slice(legacyClose + 8).trim();
  if (!text) throw new WorkersModelOutputError('reasoning-only');
  return text;
}
