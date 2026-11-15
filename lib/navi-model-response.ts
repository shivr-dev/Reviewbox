import { workersFinalContent, WorkersModelOutputError } from './workers-ai-response';

export class NaviResponseFormatError extends Error {
  constructor(public reason: 'structure' | 'truncated' | 'reasoning-only') {
    super(reason);
    this.name = 'NaviResponseFormatError';
  }
}
function finalObject(input: unknown) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new NaviResponseFormatError('structure');
  const { reasoning_content, reasoning, thinking, ...value } = input as Record<
    string,
    unknown
  >;
  for (const key of [
    'ui_actions',
    'tutor_actions',
    'configuration_actions',
    'understanding_check',
  ])
    if (value[key] === null) delete value[key];
  // Missing evidence is explicitly supplementary, never a fabricated citation.
  if (value.citations === undefined || value.citations === null)
    value.citations = [];
  if (value.supplementary === undefined) value.supplementary = true;
  if (typeof value.reply === 'string' && /<\/?think\b/i.test(value.reply))
    throw new NaviResponseFormatError('structure');
  return value;
}
/** Read final content only. Never use a model's separate reasoning as an answer. */
export function parseNaviModelResponse(body: any): unknown {
  if (body?.success === false) throw new Error('Model request failed');
  let content: unknown;
  try { content = workersFinalContent(body); }
  catch (error) {
    if (error instanceof WorkersModelOutputError) throw new NaviResponseFormatError(error.reason);
    throw error;
  }
  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return finalObject(content);
  }
  if (typeof content !== 'string' || content.length > 120000)
    throw new NaviResponseFormatError('structure');
  const text = content
    .replace(/^```(?:json)?\s*\n?/i, '')
    .replace(/\s*```$/, '')
    .trim();
  try {
    const value = JSON.parse(text);
    if (value && typeof value === 'object' && !Array.isArray(value))
      return finalObject(value);
  } catch {}
  // Permit a single complete JSON object with prose/fences around it, without repairing its values.
  const objects: string[] = [];
  let start = -1,
    depth = 0,
    quoted = false,
    escaped = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (start < 0) {
      if (ch === '{') {
        start = i;
        depth = 1;
      }
      continue;
    }
    if (quoted) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') quoted = false;
      continue;
    }
    if (ch === '"') quoted = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && !--depth) {
      objects.push(text.slice(start, i + 1));
      start = -1;
    }
  }
  if (start >= 0 || objects.length !== 1)
    throw new NaviResponseFormatError('structure');
  try {
    return finalObject(JSON.parse(objects[0]));
  } catch {
    throw new NaviResponseFormatError('structure');
  }
}

/** JSON-encoded sources must be checked as text values too (quotes/newlines are escaped in JSON). */
export function naviQuoteMatches(content: string, quote: string) {
  const normalize = (v: string) =>
    v.replace(/\r\n?/g, '\n').replace(/\s+/gu, ' ').trim();
  const needle = normalize(quote);
  if (!needle) return false;
  if (normalize(content).includes(needle)) return true;
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return false;
  }
  const queue: unknown[] = [parsed];
  let visited = 0;
  while (queue.length && visited++ < 4000) {
    const next = queue.pop();
    if (typeof next === 'string' && normalize(next).includes(needle))
      return true;
    if (next && typeof next === 'object') queue.push(...Object.values(next));
  }
  return false;
}

