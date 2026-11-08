'use client';
import { useRef, useState } from 'react';
import { tr } from '@/lib/i18n';
import { subjectLabel } from '@/lib/presentation';
import { SUBJECTS, type Subject } from '@/lib/model';
import { gpaConfig, gradePoint, validateGpaConfig } from '@/lib/exam-outcomes';
import {
  configurationBaseline,
  learningPreferences,
  type NaviConfigurationAction,
} from '@/lib/navi-configuration';
import { applyNaviConfiguration } from '@/lib/navi-configuration-client';
import { currentNamespace } from '@/lib/store';
import { useReview } from './review-context';
import ExamScopePicker from './exam-scope-picker';
const t = (key: string) => tr('study:navi.config.' + key);

export default function NaviConfigurationPreview({
  action,
  operationId,
  onClose,
}: {
  action: NaviConfigurationAction;
  operationId: string;
  onClose: () => void;
}) {
  const { data, refresh } = useReview();
  const owner = useRef(currentNamespace()),
    baseline = useRef(configurationBaseline(data, action)),
    lock = useRef(false);
  const previous =
    action.type === 'updateExam' || action.type === 'setExamScheduled'
      ? data.exams.find((e) => e.id === action.examId)
      : undefined;
  const currentGpa = gpaConfig(data);
  const [preferences, setPreferences] = useState(() => {
    const current = learningPreferences(data);
    return action.type === 'setLearningPreferences'
      ? {
          mode: action.changes.mode ?? current.mode,
          weights: { ...current.weights, ...action.changes.weights },
        }
      : current;
  });
  const initial =
    action.type === 'createExam' || action.type === 'updateExam'
      ? { ...previous, ...action.changes }
      : {};
  const [fields, setFields] = useState(initial),
    [rule, setRule] = useState(
      action.type === 'setGpaRule'
        ? { ...currentGpa, ...action.changes }
        : currentGpa,
    );
  const [minutes, setMinutes] = useState(
    action.type === 'setDailyTime'
      ? action.minutes
      : (data.settings.dailyMinutes ?? 20),
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [done, setDone] = useState(false);
  const isExam = action.type === 'createExam' || action.type === 'updateExam';
  let samples: string[] = [];
  if (action.type === 'setGpaRule')
    try {
      const valid = validateGpaConfig(rule);
      samples = [60, 80, 100].map(
        (p) =>
          `${p}% → ${gradePoint(valid.formula, { score: p, maxScore: 100, ratio: p / 100, percent: p, scale: valid.scale }).toFixed(2)}`,
      );
    } catch {}
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      const revised: NaviConfigurationAction =
        action.type === 'setGpaRule'
          ? {
              type: 'setGpaRule',
              changes: {
                scale: rule.scale,
                formula: rule.formula,
                weighted: rule.weighted,
              },
            }
          : action.type === 'setLearningPreferences'
            ? { type: 'setLearningPreferences', changes: preferences }
            : action.type === 'setExamScheduled'
              ? action
              : action.type === 'setDailyTime'
                ? { type: 'setDailyTime', minutes }
                : {
                    ...action,
                    changes: {
                      title: fields.title,
                      subject: fields.subject,
                      date: fields.date,
                      target: fields.target,
                      dailyMinutes: fields.dailyMinutes,
                      scope: fields.scope ?? [],
                    },
                  };
      await applyNaviConfiguration(
        revised,
        operationId,
        baseline.current,
        owner.current,
      );
      if (currentNamespace() !== owner.current) return;
      await refresh();
      setDone(true);
    } catch (e) {
      setError(
        t(
          e instanceof Error && ['account', 'changed'].includes(e.message)
            ? e.message
            : 'invalid',
        ),
      );
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (done)
    return (
      <div className="navi-config-result" role="status">
        <strong>{t('saved')}</strong>
        <p>{t('replanned')}</p>
        <button type="button" onClick={onClose}>
          {tr('study:navi.close')}
        </button>
      </div>
    );
  return (
    <form className="navi-config-preview" onSubmit={(e) => void save(e)}>
      <h3>{t(action.type)}</h3>
      <p>{t('confirmHelp')}</p>
      <fieldset disabled={busy}>
        {action.type === 'setLearningPreferences' && (
          <>
            <label>
              {t('mode')}
              <select
                value={preferences.mode}
                onChange={(e) =>
                  setPreferences({
                    ...preferences,
                    mode: e.target.value as typeof preferences.mode,
                  })
                }
              >
                {(['auto', 'guided', 'manual'] as const).map((mode) => (
                  <option key={mode} value={mode}>
                    {t(mode)}
                  </option>
                ))}
              </select>
            </label>
            <small>{t('modeHelp')}</small>
            <div className="navi-weight-rows">
              {SUBJECTS.map((s) => (
                <label key={s.id}>
                  <span>{subjectLabel(s.id)}</span>
                  <input
                    type="range"
                    min={0}
                    max={5}
                    step={0.5}
                    value={preferences.weights[s.id] ?? 3}
                    onChange={(e) =>
                      setPreferences({
                        ...preferences,
                        weights: {
                          ...preferences.weights,
                          [s.id]: Number(e.target.value),
                        },
                      })
                    }
                  />
                  <output>{preferences.weights[s.id] ?? 3}</output>
                </label>
              ))}
            </div>
            <small>{t('weightsHelp')}</small>
          </>
        )}
        {action.type === 'setExamScheduled' && (
          <div className="navi-config-before">
            <strong>{previous?.title ?? t('changed')}</strong>
            <span>{previous?.date}</span>
            <p>{t(action.enabled ? 'resumeExam' : 'cancelExam')}</p>
            <small>{t('preserveScores')}</small>
          </div>
        )}
        {action.type === 'setGpaRule' && (
          <>
            <div className="navi-config-before">
              <small>{t('current')}</small>
              <code>{currentGpa.formula}</code>
              <span>
                {currentGpa.scale} ·{' '}
                {t(currentGpa.weighted ? 'weighted' : 'equal')}
              </span>
            </div>
            <label>
              {t('scale')}
              <input
                type="number"
                min={1}
                max={10}
                step="any"
                required
                value={rule.scale}
                onChange={(e) =>
                  setRule({ ...rule, scale: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('formula')}
              <input
                required
                maxLength={240}
                value={rule.formula}
                onChange={(e) => setRule({ ...rule, formula: e.target.value })}
              />
            </label>
            <small>{t('variables')}</small>
            <label className="navi-config-check">
              <input
                type="checkbox"
                checked={rule.weighted}
                onChange={(e) =>
                  setRule({ ...rule, weighted: e.target.checked })
                }
              />
              {t('weighted')}
            </label>
            <output>
              {samples.length ? samples.join(' · ') : t('invalidFormula')}
            </output>
          </>
        )}
        {action.type === 'setDailyTime' && (
          <>
            <p>
              {t('current')} · {data.settings.dailyMinutes ?? 20} {t('minutes')}
            </p>
            <label>
              {t('daily')}
              <input
                required
                type="number"
                min={10}
                max={120}
                value={minutes}
                onChange={(e) => setMinutes(Number(e.target.value))}
              />
            </label>
          </>
        )}
        {isExam && (
          <>
            {previous && (
              <div className="navi-config-before">
                <small>{t('current')}</small>
                <span>
                  {previous.title} · {previous.date} · {previous.target}%
                </span>
              </div>
            )}
            <label>
              {t('title')}
              <input
                required
                maxLength={100}
                value={fields.title ?? ''}
                onChange={(e) =>
                  setFields({ ...fields, title: e.target.value })
                }
              />
            </label>
            <label>
              {t('subject')}
              <select
                required
                value={fields.subject ?? ''}
                onChange={(e) =>
                  setFields({
                    ...fields,
                    subject: e.target.value as Subject,
                    scope: [],
                  })
                }
              >
                <option value="">{t('choose')}</option>
                {SUBJECTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {subjectLabel(s.id)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('date')}
              <input
                type="date"
                required
                value={fields.date ?? ''}
                onChange={(e) => setFields({ ...fields, date: e.target.value })}
              />
            </label>
            <label>
              {t('target')}
              <input
                type="number"
                required
                min={1}
                max={100}
                step="any"
                value={fields.target ?? ''}
                onChange={(e) =>
                  setFields({ ...fields, target: Number(e.target.value) })
                }
              />
            </label>
            <label>
              {t('examMinutes')}
              <input
                type="number"
                required
                min={5}
                max={180}
                value={fields.dailyMinutes ?? ''}
                onChange={(e) =>
                  setFields({ ...fields, dailyMinutes: Number(e.target.value) })
                }
              />
            </label>
            {fields.subject && (
              <details>
                <summary>
                  {t('scope')} · {fields.scope?.length ?? 0}
                </summary>
                <p>{t('allScope')}</p>
                <ExamScopePicker
                  subject={fields.subject}
                  value={fields.scope ?? []}
                  disabled={busy}
                  onChange={(scope) => setFields({ ...fields, scope })}
                />
              </details>
            )}
          </>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <footer>
        <button type="button" disabled={busy} onClick={onClose}>
          {tr('study:navi.cancel')}
        </button>
        <button
          type="submit"
          className="primary"
          disabled={
            busy ||
            (action.type === 'setGpaRule' && !samples.length) ||
            (action.type === 'setLearningPreferences' &&
              !Object.values(preferences.weights).some(
                (w) => typeof w === 'number' && w > 0,
              )) ||
            (action.type === 'setExamScheduled' && !previous)
          }
        >
          {busy ? t('saving') : tr('study:navi.confirm')}
        </button>
      </footer>
    </form>
  );
}
