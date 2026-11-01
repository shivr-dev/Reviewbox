'use client';
import { useEffect, useState } from 'react';
import { tr } from '@/lib/i18n';
import { useReview } from './review-context';
import { currentNamespace } from '@/lib/store';
import {
  collectionEnabled,
  productInsights,
  trackProductEvent,
} from '@/lib/product-insights';
import { hasAcceptedAgreement } from '@/lib/product-agreement';
import {
  productArea,
  durationBucket,
} from '@/supabase/functions/review-feedback/contract';
export default function ProductInsights({ page }: { page: string }) {
  const { data, navigate } = useReview();
  const namespace = currentNamespace();
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    const update = () => {
      const value =
        hasAcceptedAgreement(data.settings.termsAcceptance) &&
        collectionEnabled(namespace, data.settings.productDataCollection);
      productInsights.configure(value);
      setEnabled(value);
      try {
        setDismissed(
          localStorage.getItem('review-product-notice:' + namespace) === '1',
        );
      } catch {
        setDismissed(false);
      }
    };
    update();
    window.addEventListener('review-product-privacy', update);
    window.addEventListener('storage', update);
    return () => {
      productInsights.configure(false);
      window.removeEventListener('review-product-privacy', update);
      window.removeEventListener('storage', update);
    };
  }, [
    namespace,
    data.settings.productDataCollection,
    data.settings.termsAcceptance,
  ]);
  useEffect(() => {
    if (!enabled) return;
    const area = productArea(page);
    let activeAt =
      document.visibilityState === 'visible' ? performance.now() : undefined;
    let visibleMs = 0;
    const visibility = () => {
      if (activeAt !== undefined) visibleMs += performance.now() - activeAt;
      activeAt =
        document.visibilityState === 'visible' ? performance.now() : undefined;
    };
    trackProductEvent('page_view', area);
    const error = () => trackProductEvent('ui_error', area);
    document.addEventListener('visibilitychange', visibility);
    window.addEventListener('error', error);
    window.addEventListener('unhandledrejection', error);
    return () => {
      if (activeAt !== undefined) visibleMs += performance.now() - activeAt;
      if (visibleMs >= 1000)
        trackProductEvent('page_time', area, durationBucket(visibleMs));
      document.removeEventListener('visibilitychange', visibility);
      window.removeEventListener('error', error);
      window.removeEventListener('unhandledrejection', error);
    };
  }, [page, enabled, namespace]);
  useEffect(() => {
    const timer = setInterval(() => void productInsights.flush(), 30000);
    const flush = () => {
      if (document.visibilityState === 'hidden') void productInsights.flush();
    };
    document.addEventListener('visibilitychange', flush);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', flush);
    };
  }, []);
  const accepted = hasAcceptedAgreement(data.settings.termsAcceptance);
  if ((accepted && !enabled) || dismissed || !['home', 'you'].includes(page))
    return null;
  return (
    <aside
      className="product-privacy-notice"
      aria-label={tr('settings:产品改进统计')}
    >
      <span>
        {accepted
          ? tr(
              'settings:默认收集不含学习内容的使用统计，帮助改进 Reviewbox。你可随时关闭。',
            )
          : tr(
              'settings:请阅读新版使用协议与隐私说明；同意前不发送产品改进统计。',
            )}
      </span>
      <button
        className="text-button"
        onClick={() =>
          navigate('you', undefined, accepted ? 'data' : 'agreement')
        }
      >
        {accepted ? tr('settings:管理') : tr('settings:阅读协议')}
      </button>
      <button
        className="text-button"
        onClick={() => {
          try {
            localStorage.setItem('review-product-notice:' + namespace, '1');
          } catch {}
          setDismissed(true);
        }}
      >
        {tr('settings:知道了')}
      </button>
    </aside>
  );
}
