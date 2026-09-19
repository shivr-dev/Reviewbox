import katex from 'katex';
export default function MathText({ children }: { children?: string | null }) {
  const text = children ?? '';
  const parts = text.split(
    /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+?\$)/g,
  );
  return (
    <span className="rich-text">
      {parts.map((part, i) => {
        const display = part.startsWith('$$') || part.startsWith('\\[');
        const math =
          display ||
          part.startsWith('\\(') ||
          (part.startsWith('$') && part.endsWith('$'));
        if (!math) return <span key={i}>{part}</span>;
        const offset = part.startsWith('$') && !display ? 1 : 2;
        try {
          return (
            <span
              key={i}
              className={display ? 'math-display' : 'math-inline'}
              dangerouslySetInnerHTML={{
                __html: katex.renderToString(part.slice(offset, -offset), {
                  displayMode: display,
                  throwOnError: false,
                  trust: false,
                  strict: 'ignore',
                  output: 'htmlAndMathml',
                  maxExpand: 300,
                  maxSize: 20,
                }),
              }}
            />
          );
        } catch {
          return <span key={i}>{part}</span>;
        }
      })}
    </span>
  );
}
