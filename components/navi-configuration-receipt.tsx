'use client';
import { useRef, useState } from 'react';
import { tr } from '@/lib/i18n';
import { currentNamespace } from '@/lib/store';
import { undoNaviConfiguration } from '@/lib/navi-configuration-client';
import type { ConfigurationReceipt } from '@/lib/navi-configuration-history';
import { subjectLabel } from '@/lib/presentation';
import { useReview } from './review-context';
const t = (key: string) => tr('study:navi.history.' + key);
function valueText(value: unknown, path: string[]) {
  if (path[0] === 'scheduleStatus')
    return t(value === 'cancelled' ? 'cancelled' : 'scheduled');
  if (value === undefined) return t('default');
  if (typeof value === 'boolean') return t(value ? 'yes' : 'no');
  if (path[0] === 'examGpa' && value && typeof value === 'object') {
    const v = value as any;
    return `${v.formula} · ${v.scale} · ${t(v.weighted ? 'weighted' : 'unweighted')}`;
  }
  if (
    path.join('.') === 'assistant.weights' &&
    value &&
    typeof value === 'object'
  )
    return Object.entries(value)
      .map(([key, v]) => `${subjectLabel(key)} ${v}`)
      .join(' · ');
  if (Array.isArray(value)) return `${value.length} ${t('topics')}`;
  if (path[0] === 'subject') return subjectLabel(String(value));
  if (path[0] === 'studyMode') return tr('study:navi.config.' + value);
  return typeof value === 'object' ? t('updated') : String(value);
}
export default function NaviConfigurationReceipt({
  receipt,
}: {
  receipt: ConfigurationReceipt;
}) {
  const { refresh } = useReview(),
    owner = useRef(currentNamespace()),
    gate = useRef(false);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  async function undo() {
    if (gate.current) return;
    gate.current = true;
    setBusy(true);
    setError('');
    try {
      await undoNaviConfiguration(receipt.id, owner.current);
      if (currentNamespace() === owner.current) await refresh();
    } catch (e) {
      setError(
        t(e instanceof Error && e.message === 'changed' ? 'changed' : 'failed'),
      );
    } finally {
      gate.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="navi-configuration-receipt" aria-label={t('title')}>
      <header>
        <strong>{t(receipt.undoneAt ? 'undone' : 'saved')}</strong>
        <span>{tr('study:navi.config.' + receipt.action.type)}</span>
      </header>
      <dl>
        {receipt.changes
          .filter(
            (c) =>
              !['assistant.version', 'assistant.dailyMinutes'].includes(
                c.path.join('.'),
              ),
          )
          .map((c) => (
            <div key={c.path.join('.')}>
              <dt>{t('field.' + c.path.join('.'))}</dt>
              <dd>
                <span>
                  {valueText(
                    receipt.undoneAt ? c.after.value : c.before.value,
                    c.path,
                  )}
                </span>
                <span aria-hidden="true">→</span>
                <strong>
                  {valueText(
                    receipt.undoneAt ? c.before.value : c.after.value,
                    c.path,
                  )}
                </strong>
              </dd>
            </div>
          ))}
      </dl>
      {receipt.action.type === 'createExam' && <p>{t('createUndo')}</p>}
      {!receipt.undoneAt && !!receipt.changes.length && (
        <button type="button" disabled={busy} onClick={() => void undo()}>
          {t(busy ? 'undoing' : 'undo')}
        </button>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
