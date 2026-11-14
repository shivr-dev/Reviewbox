'use client';

import { useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { tr } from '@/lib/i18n';
import { simulationRuns, type ExamCleanupScope } from '@/lib/exam-run-cleanup';
import { clearSimulationRuns } from '@/lib/exam-run-cleanup-client';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from './ui/dialog';

const t = (key: string, values?: Record<string, unknown>) =>
  tr('results:simulationCleanup.' + key, values);

export default function ExamRunCleanup({ disabled }: { disabled: boolean }) {
  const { data, refresh, notify } = useReview();
  const runs = simulationRuns(data);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<ExamCleanupScope>('unfinished');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lock = useRef(false);
  const origin = useRef(currentNamespace());
  const unfinished = runs.filter((run) => run.status !== 'complete');
  const target = scope === 'unfinished' ? unfinished : runs;
  if (!runs.length && !open) return null;

  function openChanged(value: boolean) {
    if (lock.current) return;
    if (value) {
      origin.current = currentNamespace();
      setScope(unfinished.length ? 'unfinished' : 'all');
      setError('');
    }
    setOpen(value);
  }

  async function confirm() {
    if (lock.current || disabled || !target.length) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const count = await clearSimulationRuns(
        scope,
        target.map((run) => run.id),
        origin.current,
      );
      setOpen(false);
      await refresh();
      if (origin.current === currentNamespace()) notify(t('done', { count }));
    } catch (error) {
      const code = error instanceof Error ? error.message : '';
      setError(
        t(
          code === 'exam-runs-changed'
            ? 'changed'
            : code === 'account-changed'
              ? 'account'
              : 'error',
        ),
      );
      if (code === 'exam-runs-changed') await refresh().catch(() => {});
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={openChanged}>
      <DialogTrigger className="quiet exam-cleanup-trigger" disabled={disabled}>
        <Trash2 size={16} aria-hidden="true" />
        {t('open')}
      </DialogTrigger>
      <DialogContent className="exam-cleanup-dialog" showCloseButton={false}>
        <DialogTitle>{t('open')}</DialogTitle>
        <DialogDescription>{t('description')}</DialogDescription>
        <fieldset disabled={busy || disabled}>
          <legend>{t('scope')}</legend>
          <label>
            <input
              type="radio"
              name="exam-cleanup-scope"
              value="unfinished"
              checked={scope === 'unfinished'}
              disabled={!unfinished.length}
              onChange={() => setScope('unfinished')}
            />
            <span>{t('unfinished', { count: unfinished.length })}</span>
          </label>
          <label>
            <input
              type="radio"
              name="exam-cleanup-scope"
              value="all"
              checked={scope === 'all'}
              onChange={() => setScope('all')}
            />
            <span>{t('all', { count: runs.length })}</span>
          </label>
        </fieldset>
        <p className="muted">{t('permanent')}</p>
        {error && <p role="alert">{error}</p>}
        <div className="button-row">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() => openChanged(false)}
          >
            {tr('common:取消')}
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || disabled || !target.length}
            onClick={() => void confirm()}
          >
            {t(busy ? 'busy' : 'confirm')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
