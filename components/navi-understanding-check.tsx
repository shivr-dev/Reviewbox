'use client';
import { useState } from 'react';
import { tr } from '@/lib/i18n';
import MathText from './math-text';
const t = (key: string) => tr('study:navi.check.' + key);
export default function NaviUnderstandingCheck({
  question,
  busy,
  answered,
  onAnswer,
}: {
  question: string;
  busy: boolean;
  answered: boolean;
  onAnswer: (answer: string) => void;
}) {
  const [answer, setAnswer] = useState('');
  return (
    <section className="navi-understanding-check" aria-label={t('title')}>
      <small>{t('title')}</small>
      <MathText>{question}</MathText>
      {answered ? (
        <p>{t('answered')}</p>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (answer.trim() && !busy) onAnswer(answer.trim());
          }}
        >
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            rows={3}
            maxLength={1600}
            aria-label={t('answer')}
            placeholder={t('placeholder')}
            disabled={busy}
          />
          <footer>
            <small>{t('notice')}</small>
            <button type="submit" disabled={busy || !answer.trim()}>
              {t('submit')}
            </button>
          </footer>
        </form>
      )}
    </section>
  );
}
