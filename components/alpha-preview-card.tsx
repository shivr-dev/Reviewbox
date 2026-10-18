'use client';
import { useRef, useState } from 'react';
import { ArrowRight, FlaskConical } from 'lucide-react';
import { useReview } from './review-context';
import { currentNamespace } from '@/lib/store';
import { setAlphaPreview } from '@/lib/alpha-preview';

export default function AlphaPreviewCard({
  entry = false,
}: {
  entry?: boolean;
}) {
  const { data, refresh, navigate, notify } = useReview();
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const enabled = data.settings.alphaPreview === true;
  async function change(enabled: boolean, open = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    const ns = currentNamespace();
    try {
      await setAlphaPreview(enabled, ns);
      if (currentNamespace() !== ns) return;
      await refresh();
      if (currentNamespace() !== ns) return;
      if (open) navigate('forge');
      else if (entry) navigate('you');
      notify(
        enabled
          ? '已加入 Alpha，正式版仍可正常使用'
          : '已退出 Alpha，保留正式版界面',
      );
    } catch (e) {
      notify(e instanceof Error ? e.message : '设置未能保存，请重试');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <section
      className="panel alpha-preview-card"
      aria-labelledby="alpha-preview-title"
    >
      <div className="alpha-preview-heading">
        <span className="alpha-preview-icon">
          <FlaskConical size={25} />
        </span>
        <div>
          <span className="alpha-preview-badge">ALPHA</span>
          <h2 id="alpha-preview-title">抢先看看，下一个 Reviewbox。</h2>
        </div>
      </div>
      <p>
        体验新版学习工作区与装备工坊。测试版尚在打磨，退出后可以继续使用原来的界面。
      </p>
      <small>
        学习、成绩和存档继续沿用；装备与材料独立保存。可随时退出 Alpha。
      </small>
      <div className="alpha-preview-actions">
        {enabled ? (
          <>
            <button
              className="primary"
              disabled={busy}
              onClick={() => navigate('forge')}
            >
              进入 Alpha <ArrowRight size={17} />
            </button>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => void change(false)}
            >
              退出 Alpha 测试
            </button>
          </>
        ) : (
          <button
            className="primary"
            disabled={busy}
            onClick={() => void change(true, true)}
          >
            {busy ? '正在加入…' : '加入 Alpha 并打开'} <ArrowRight size={17} />
          </button>
        )}
        {entry && (
          <button
            className="secondary"
            disabled={busy}
            onClick={() => navigate('you')}
          >
            返回正式版设置
          </button>
        )}
      </div>
    </section>
  );
}

export function AlphaPreviewAccess({
  ready,
  children,
}: {
  ready: boolean;
  children: React.ReactNode;
}) {
  const { data } = useReview();
  if (!ready)
    return (
      <main className="alpha-access">
        <p role="status">正在读取测试版设置…</p>
      </main>
    );
  if (data.settings.alphaPreview !== true)
    return (
      <main className="alpha-access">
        <AlphaPreviewCard entry />
      </main>
    );
  return children;
}
