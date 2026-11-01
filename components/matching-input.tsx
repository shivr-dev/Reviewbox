'use client';
import {tr} from '@/lib/i18n';
import { useState, useRef, useEffect } from 'react';
import type { Question } from '@/lib/model';
import MathText from './math-text';
import {matchingAnswer,connectMatching} from '@/lib/matching';
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
  const selectedRef=useRef(value);
  useEffect(()=>{selectedRef.current=value;},[value]);
  useEffect(()=>{setLeft('');selectedRef.current=value;},[question.id]);
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
      const columns = el.querySelectorAll(':scope > .matching-column');
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
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [question.id]);
  if (!m) return null;
  const selected=matchingAnswer(question,value)??{};
  function connect(right: string) {
    if (!left) return;
    const next=connectMatching(question,selectedRef.current,left,right);
    selectedRef.current=next;
    onChange(next);
    setLeft('');
  }
  return (
    <div className="matching-task">
      <p className="muted">{tr("common:依次点击左侧和右侧建立连线；再次选择可修改。")}</p>
      <div className="matching-board" ref={board}>
        <svg className="matching-lines"
          viewBox={`0 0 100 ${layout.height}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {m.left.map((l, i) => {
            const j = m.right.findIndex((r) => r.id === selected[l.id]);
            return j < 0 ? null : (
              <line
                key={l.id}
                data-match-left={l.id}
                data-match-right={selected[l.id]}
                x1="0"
                y1={layout.left[i] ?? 0}
                x2="100"
                y2={layout.right[j] ?? 0}
              />
            );
          })}
        </svg>
        <div className="matching-column">
          {m.left.map((l, i) => (
            <button
              type="button"
              data-match-left={l.id}
              aria-pressed={left===l.id}
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
        <div className="matching-column">
          {m.right.map((r, i) => (
            <button
              type="button"
              data-match-right={r.id}
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
      <ul className="matching-summary" aria-label="已选择的连线">{m.left.filter(l=>selected[l.id]).map(l=><li key={l.id}><MathText>{l.text+' → '+m.right.find(r=>r.id===selected[l.id])!.text}</MathText></li>)}</ul>
    </div>
  );
}
