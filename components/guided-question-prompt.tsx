import MathText from './math-text';

export default function GuidedQuestionPrompt({ prompt, focusTarget }: {
  prompt: string;
  focusTarget?: boolean;
}) {
  // Count wide characters as two and TeX commands as one visible symbol.
  const text = prompt.trim().replace(/\\[a-z]+/gi, 'x').replace(/[{}$]/g, '');
  const width = [...text.replace(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/gu, 'xx')].length;
  const density = width > 140 || /\n[^\n]*\n/.test(text) ? 'reading'
    : width > 55 || /\n|\$\$|\\\[/.test(prompt.trim()) ? 'compact'
    : 'short';

  return (
    <h2
      className="guided-question-prompt"
      data-density={density}
      data-assessment-heading={focusTarget ? '' : undefined}
      tabIndex={focusTarget ? -1 : undefined}
    >
      <MathText>{prompt}</MathText>
    </h2>
  );
}
