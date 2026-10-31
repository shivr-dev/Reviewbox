/** Safe repairs preserve every authored step and every matching ID. No answer is inferred. */
export function normalizeGeneratedQuestion(raw: Record<string, any>) {
  const value = { ...raw };
  const repairs: string[] = [];
  for (const key of [
    'diagram',
    'passage',
    'acceptedAnswers',
    'rubric',
    'options',
  ])
    if (value[key] === null) {
      delete value[key];
      repairs.push('omitted-empty-' + key);
    }
  if (value.type !== 'matching' && 'matching' in value) {
    delete value.matching;
    repairs.push('removed-unrelated-matching');
  }
  if (
    value.type === 'matching' &&
    value.matching &&
    typeof value.matching === 'object'
  ) {
    value.matching = { ...value.matching };
    for (const side of ['left', 'right']) {
      const items = value.matching[side];
      // An explicit ID -> text dictionary is unambiguous; free text and positional pairs are not.
      if (
        items &&
        !Array.isArray(items) &&
        typeof items === 'object' &&
        Object.keys(items).length >= 2 &&
        Object.entries(items).every(
          ([id, text]) => id.length > 0 && typeof text === 'string',
        )
      ) {
        value.matching[side] = Object.entries(items).map(([id, text]) => ({
          id,
          text,
        }));
        repairs.push('matching-' + side + '-dictionary');
      }
    }
    if (
      value.answer &&
      typeof value.answer === 'object' &&
      !Array.isArray(value.answer)
    ) {
      value.answer = JSON.stringify(value.answer);
      repairs.push('serialized-explicit-mapping');
    }
  }
  if (
    Array.isArray(value.solution) &&
    value.solution.every((s) => typeof s === 'string')
  ) {
    const steps = value.solution.filter(
      (s: string, i: number, a: string[]) =>
        i === 0 || s.trim() !== a[i - 1].trim(),
    );
    if (steps.length !== value.solution.length)
      repairs.push('merged-identical-adjacent-steps');
    // Group consecutive fragments, preserving their order and ALL text, including the conclusion.
    if (steps.length > 12 && steps.length <= 48) {
      const groupSize = Math.ceil(steps.length / 8);
      const grouped: string[] = [];
      for (let i = 0; i < steps.length; i += groupSize)
        grouped.push(steps.slice(i, i + groupSize).join('\n'));
      if (grouped.every((s) => s.length <= 4000)) {
        value.solution = grouped;
        repairs.push('grouped-consecutive-solution-fragments');
      } else value.solution = steps;
    } else value.solution = steps;
  }
  return { value, repairs };
}

export class GenerationFormatError extends Error {
  readonly code = 'generation-format';
  constructor(
    public readonly fields: string[],
    public readonly retryFeedback: string,
  ) {
    super(
      fields.some((f) => f.startsWith('matching'))
        ? '配对题的选项格式需要调整，正在重新生成。'
        : fields.some((f) => f.startsWith('solution'))
          ? '解题步骤格式需要调整，正在重新整理。'
          : '这道变式题的结构需要调整，正在重新生成。',
    );
    this.name = 'GenerationFormatError';
  }
}

export function generationFormatFailure(
  issues: { path: PropertyKey[]; message: string }[],
) {
  const fields = [...new Set(issues.map((i) => i.path.map(String).join('.')))];
  return new GenerationFormatError(
    fields,
    'Repair these fields in a fresh complete question: ' +
      fields.join(', ') +
      '. Only matching questions may include matching. Each side must be an array of {id,text}; preserve a bijective answer mapping. ' +
      'Solution must contain 4–8 complete major steps (at most 12), including the final conclusion.',
  );
}

export const VARIANT_FAILURE =
  '这道变式题未能通过格式与答案检查。原题不受影响，可以重试。';
