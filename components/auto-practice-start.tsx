'use client';
import { useEffect, useRef, useState } from 'react';
import { useReview } from './review-context';
import { currentNamespace } from '@/lib/store';
import { saveAutoStartPreference } from '@/lib/study-preferences-client';
import type { StudyAction } from '@/lib/study-orchestrator';
export default function AutoPracticeStart({
  ready,
  pageMode,
  action,
  launchIntent,
  blocked,
  onStart,
}: {
  ready: boolean;
  pageMode: string;
  action: StudyAction;
  launchIntent?: string;
  blocked: boolean;
  onStart: () => void;
}) {
  const { data, refresh } = useReview(),
    pref = data.settings.studyAutoStart;
  const [skipped, setSkipped] = useState(false),
    [seconds, setSeconds] = useState<number | null>(null),
    [saving, setSaving] = useState(false),
    [error, setError] = useState('');
  const started = useRef(new Set<string>()),
    callback = useRef(onStart),
    origin = useRef(currentNamespace()),
    savingRef = useRef(false);
  callback.current = onStart;
  const eligible =
    ready &&
    pageMode === 'agenda' &&
    data.settings.studyMode === 'auto' &&
    pref?.enabled === true &&
    !!pref.acknowledgedAt &&
    !launchIntent &&
    !blocked &&
    !saving &&
    !skipped &&
    action.kind === 'practice' &&
    !started.current.has(action.id);
  useEffect(() => {
    setSeconds(null);
    if (!eligible) return;
    let remaining = 5;
    setSeconds(remaining);
    const timer = setInterval(() => {
      remaining--;
      setSeconds(remaining);
      if (remaining <= 0) {
        clearInterval(timer);
        started.current.add(action.id);
        callback.current();
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [eligible, action.id]);
  async function preference(enabled: boolean) {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSkipped(true);
    setError('');
    try {
      await saveAutoStartPreference(enabled, origin.current);
      if (origin.current !== currentNamespace()) return;
      setSkipped(!enabled);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : '自动开始偏好未保存');
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }
  if (
    !ready ||
    pageMode !== 'agenda' ||
    data.settings.studyMode !== 'auto' ||
    launchIntent
  )
    return null;
  return (
    <section className="auto-start-notice" aria-label="自动开始规则">
      {!pref?.acknowledgedAt && !skipped ? (
        <>
          <h2>由你决定是否自动开始</h2>
          <p>
            开启后，进入学习计划时会先倒数 5
            秒，再开始推荐的普通练习。考试、测评和成绩录入不会因此自动启动。
          </p>
          <div>
            <button
              className="secondary"
              disabled={saving}
              onClick={() => void preference(true)}
            >
              开启自动开始
            </button>
            <button
              className="quiet"
              disabled={saving}
              onClick={() => void preference(false)}
            >
              只看安排，手动开始
            </button>
            <button
              className="quiet"
              disabled={saving}
              onClick={() => setSkipped(true)}
            >
              本次不自动开始
            </button>
          </div>
        </>
      ) : seconds !== null && seconds > 0 ? (
        <div className="auto-start-countdown">
          <p role="status">
            {seconds} 秒后开始：{action.title}
          </p>
          <button className="secondary" onClick={() => setSkipped(true)}>
            本次不自动开始
          </button>
        </div>
      ) : null}
      <label>
        <input
          type="checkbox"
          aria-label="进入学习计划时自动开始推荐练习"
          checked={pref?.enabled === true}
          disabled={saving}
          onChange={(e) => void preference(e.target.checked)}
        />
        进入学习计划时自动开始推荐练习
      </label>
      {pref?.acknowledgedAt && (
        <small>
          开始前保留 5 秒取消时间。
          {skipped ? '本次已暂停自动开始，仍可手动选择学习。' : ''}
        </small>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
