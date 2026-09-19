'use client';
import { useState, useRef, useEffect } from 'react';
import type { Question } from '@/lib/model';
import MathText from './math-text';
export default function MatchingInput({
  question,
  value,
  onChange,
  disabled = false,
}: {
  question: Question;
  value: string;
  onChange: (s: string) => void;
  disabled?: boolean;
}) {
  const [left, setLeft] = useState('');
  const m = question.matching;
  const board = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState<{
    height: number;
    left: number[];
    right: number[];
  }>({ height: 1, left: [], right: [] });
  useEffect(() => {
    const el = board.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const columns = el.querySelectorAll(':scope > div');
      const centers = (column: Element | undefined) =>
        Array.from(column?.querySelectorAll('button') ?? [], (button) => {
          const r = button.getBoundingClientRect();
          return r.top - rect.top + r.height / 2;
        });
      setLayout({
        height: rect.height || 1,
        left: centers(columns[0]),
        right: centers(columns[1]),
      });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    el.querySelectorAll('button').forEach((button) => observer.observe(button));
    measure();
    return () => observer.disconnect();
  }, [question.id]);
  if (!m) return null;
  let selected: Record<string, string> = {};
  try {
    selected = JSON.parse(value || '{}');
  } catch {}
  function connect(right: string) {
    if (!left) return;
    const next = { ...selected };
    for (const k of Object.keys(next)) if (next[k] === right) delete next[k];
    next[left] = right;
    onChange(JSON.stringify(next));
    setLeft('');
  }
  return (
    <div className="matching-task">
      <p className="muted">依次点击左侧和右侧建立连线；再次选择可修改。</p>
      <div className="matching-board" ref={board}>
        <svg
          viewBox={`0 0 100 ${layout.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {m.left.map((l, i) => {
            const j = m.right.findIndex((r) => r.id === selected[l.id]);
            return j < 0 ? null : (
              <line
                key={l.id}
                x1="0"
                y1={layout.left[i] ?? 0}
                x2="100"
                y2={layout.right[j] ?? 0}
              />
            );
          })}
        </svg>
        <div>
          {m.left.map((l, i) => (
            <button
              key={l.id}
              disabled={disabled}
              className={
                left === l.id ? 'selected' : selected[l.id] ? 'connected' : ''
              }
              onClick={() => setLeft(l.id)}
            >
              <small>{i + 1}</small>
              <MathText>{l.text}</MathText>
            </button>
          ))}
        </div>
        <div>
          {m.right.map((r, i) => (
            <button
              key={r.id}
              disabled={disabled || !left}
              className={
                Object.values(selected).includes(r.id) ? 'connected' : ''
              }
              onClick={() => connect(r.id)}
            >
              <small>{String.fromCharCode(65 + i)}</small>
              <MathText>{r.text}</MathText>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
