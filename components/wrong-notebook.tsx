'use client';
import { useState } from 'react';
import { useReview } from './review-context';
import {
  wrongQuestions,
  isPinyin,
  QUESTION_TYPES,
  blindSpots,
} from '@/lib/question-tools';
import { Choice, SubjectChoice, Empty } from './shared';
import MathText from './math-text';
export default function WrongNotebook() {
  const { data, start } = useReview();
  const [subject, setSubject] = useState('all'),
    [type, setType] = useState('all'),
    [blind, setBlind] = useState(false);
  const blindIds = new Set(blindSpots(data).map((q) => q.id));
  const questions = wrongQuestions(data).filter(
    (q) =>
      (subject === 'all' || q.subject === subject) &&
      (type === 'all' || (type === 'pinyin' ? isPinyin(q) : q.type === type)) &&
      (!blind || blindIds.has(q.id)),
  );
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          <h2>错题本</h2>
          <p className="muted">
            答错或不确定的题目自动收录，练会后自动移出待巩固列表。
          </p>
        </div>
        <button
          className="primary"
          disabled={!questions.length}
          onClick={() =>
            start(
              questions.slice(0, 20).map((q) => ({
                question: q,
                reason: blind ? '信心校准' : '错题专项',
                priority: 1,
              })),
            )
          }
        >
          只练这些错题 · {Math.min(20, questions.length)}
        </button>
      </div>
      <div className="toolbar">
        <SubjectChoice all value={subject} onChange={setSubject} />
        <Choice
          label="错题题型"
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: '全部题型' },
            ...QUESTION_TYPES.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />
        <label className="check-inline">
          <input
            type="checkbox"
            checked={blind}
            onChange={(e) => setBlind(e.target.checked)}
          />
          自信却答错
        </label>
      </div>
      {questions.slice(0, 40).map((q) => (
        <details className="notebook-item" key={q.id}>
          <summary>
            <span>
              <MathText>{q.prompt}</MathText>
            </span>
            <small>
              {isPinyin(q)
                ? '拼音写字'
                : QUESTION_TYPES.find((t) => t.id === q.type)?.label}
            </small>
          </summary>
          <p>
            <MathText>
              {q.type === 'matching' ? q.explanation : q.answer}
            </MathText>
          </p>
          <p className="muted">
            <MathText>{q.explanation}</MathText>
          </p>
          <button
            className="quiet"
            onClick={() =>
              start([{ question: q, reason: '错题专项', priority: 1 }])
            }
          >
            重练此题
          </button>
        </details>
      ))}
      {!questions.length && <Empty title="这个范围暂时没有待巩固的错题" />}
    </section>
  );
}
