'use client';
import {tr} from '@/lib/i18n';
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
import { ArrowLeft, ArrowRight } from 'lucide-react';
import type { Question } from '@/lib/model';
export default function WrongNotebook({standalone = false}: {standalone?: boolean} = {}) {
  const { data, start } = useReview();
  const [subject, setSubject] = useState('all'),
    [type, setType] = useState('all'),
    [blind, setBlind] = useState(false), [active, setActive] = useState<string>();
  const blindIds = new Set(blindSpots(data).map((q) => q.id));
  const questions = wrongQuestions(data).filter(
    (q) =>
      (subject === 'all' || q.subject === subject) &&
      (type === 'all' || (type === 'pinyin' ? isPinyin(q) : q.type === type)) &&
      (!blind || blindIds.has(q.id)),
  );
  const exercise = (q: Question) => start([{question:q, reason:'错题专项', priority:1}]);
  const answer = (q: Question) => <>
    <p><MathText>{q.type === 'matching' ? q.explanation : q.answer}</MathText></p>
    <p className="muted"><MathText>{q.explanation}</MathText></p>
  </>;
  const selected = standalone ? questions.find(question => question.id === active) : undefined;
  if (selected) return <article className="rb-library-question-page">
    <button className="quiet rb-library-link" onClick={() => setActive(undefined)}><ArrowLeft size={16} />{tr('common:错题本')}</button>
    <h3><MathText>{selected.prompt}</MathText></h3>
    <div className="rb-reader-answer"><h4>{tr('library:参考答案')}</h4>{answer(selected)}</div>
    <button className="primary" onClick={() => exercise(selected)}>{tr('common:重练此题')}</button>
  </article>;
  return (
    <section className="panel">
      <div className="section-head">
        <div>
          {!standalone && <h2>{tr("common:错题本")}</h2>}
          <p className="muted">{tr("common:答错或不确定的题目自动收录，练会后自动移出待巩固列表。")}</p>
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
        >{tr("common:只练这些错题 ·")}{Math.min(20, questions.length)}
        </button>
      </div>
      <div className="toolbar">
        <SubjectChoice all value={subject} onChange={setSubject} />
        <Choice
          label={tr("common:错题题型")}
          value={type}
          onChange={setType}
          options={[
            { value: 'all', label: tr("common:全部题型") },
            ...QUESTION_TYPES.map((t) => ({ value: t.id, label: t.label })),
          ]}
        />
        <label className="check-inline">
          <input
            type="checkbox"
            checked={blind}
            onChange={(e) => setBlind(e.target.checked)}
          />{tr("common:自信却答错")}</label>
      </div>
      {standalone ? <div className="rb-library-tool-list">{questions.slice(0,40).map(q => <button key={q.id} onClick={() => setActive(q.id)}>
        <MathText>{q.prompt}</MathText><ArrowRight size={16} aria-hidden="true" />
      </button>)}</div> : questions.slice(0, 40).map((q) => (
        <details className="notebook-item" key={q.id}>
          <summary>
            <span>
              <MathText>{q.prompt}</MathText>
            </span>
            <small>
              {isPinyin(q)
                ? tr("common:拼音写字")
                : QUESTION_TYPES.find((t) => t.id === q.type)?.label}
            </small>
          </summary>
          {answer(q)}
          <button
            className="quiet"
            onClick={() => exercise(q)}
          >{tr("common:重练此题")}</button>
        </details>
      ))}
      {!questions.length && <Empty title={tr("common:这个范围暂时没有待巩固的错题")} />}
    </section>
  );
}
