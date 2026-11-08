import type { ReactNode } from 'react';
import MathText from './math-text';

// A small, inert formatting subset: no raw HTML, links, images or executable content.
function inline(text: string): ReactNode {
  return text
    .split(
      /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|(?<!\\)\$[^$\n]+?\$)/g,
    )
    .map((part, i) => {
      if (/^(\$|\\\[|\\\()/.test(part))
        return <MathText key={i}>{part}</MathText>;
      return (
        <span key={i}>
          {part
            .split(/(\*\*[^*\n]+\*\*|`[^`\n]+`)/g)
            .map((piece, j) =>
              piece.startsWith('**') && piece.endsWith('**') ? (
                <strong key={j}>{piece.slice(2, -2)}</strong>
              ) : piece.startsWith('`') && piece.endsWith('`') ? (
                <code key={j}>{piece.slice(1, -1)}</code>
              ) : (
                piece
              ),
            )}
        </span>
      );
    });
}

export default function NaviResponse({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let paragraph: string[] = [],
    items: string[] = [],
    listType = '',
    math = '';
  const flushParagraph = () => {
    if (paragraph.length)
      blocks.push(<p key={blocks.length}>{inline(paragraph.join('\n'))}</p>);
    paragraph = [];
  };
  const flushList = () => {
    if (items.length) {
      const Tag = listType === 'ordered' ? 'ol' : 'ul';
      blocks.push(
        <Tag key={blocks.length}>
          {items.map((item, i) => (
            <li key={i}>{inline(item)}</li>
          ))}
        </Tag>,
      );
    }
    items = [];
    listType = '';
  };
  for (const line of lines) {
    if (math) {
      paragraph.push(line);
      if (line.includes(math)) math = '';
      continue;
    }
    const trimmed = line.trim();
    const delimiter = trimmed.startsWith('$$')
      ? '$$'
      : trimmed.startsWith('\\[')
        ? '\\]'
        : '';
    if (delimiter && !trimmed.slice(2).includes(delimiter)) {
      flushList();
      paragraph.push(line);
      math = delimiter;
      continue;
    }
    if (!trimmed) {
      flushParagraph();
      flushList();
      continue;
    }
    const heading = /^#{1,4}\s+(.+)$/.exec(trimmed);
    const item = /^(?:([-*])|\d+[.)])\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push(<h3 key={blocks.length}>{inline(heading[1])}</h3>);
    } else if (item) {
      flushParagraph();
      const type = item[1] ? 'unordered' : 'ordered';
      if (listType && listType !== type) flushList();
      listType = type;
      items.push(item[2]);
    } else {
      flushList();
      paragraph.push(line);
    }
  }
  flushParagraph();
  flushList();
  return <div className="navi-response">{blocks}</div>;
}
