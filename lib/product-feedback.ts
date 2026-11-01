import {
  validateReport,
  type BugReport,
} from '@/supabase/functions/review-feedback/contract';
export const PRODUCT_ENDPOINT =
  'https://svaaepnixdoxubjxqgyr.supabase.co/functions/v1/review-feedback/';
export type FeedbackReceipt = {
  id: string;
  receipt: string;
  title: string;
  status: string;
  url?: string;
  createdAt: string;
};
export async function feedbackRequest(
  action: 'submit' | 'status',
  body: unknown,
  signal?: AbortSignal,
) {
  const response = await fetch(PRODUCT_ENDPOINT + action, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    referrerPolicy: 'no-referrer',
    signal: AbortSignal.any([
      AbortSignal.timeout(20000),
      ...(signal ? [signal] : []),
    ]),
  });
  const raw = await response.json().catch(() => null);
  const result =
    raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!response.ok || result?.error)
    throw new Error(
      typeof result?.error === 'string'
        ? result.error
        : '反馈未送达，请检查网络后重试。',
    );
  if (
    !result ||
    typeof result.status !== 'string' ||
    !['queued', 'sending', 'retry', 'submitted', 'failed'].includes(
      result.status,
    )
  )
    throw new Error('反馈服务响应异常，请稍后重试。');
  return {
    status: result.status,
    url:
      typeof result.url === 'string' &&
      /^https:\/\/github\.com\/shivr-dev\/Reviewbox\/issues\/[1-9]\d*$/.test(
        result.url,
      )
        ? result.url
        : undefined,
  };
}
export function newReport(
  values: Pick<BugReport, 'title' | 'description' | 'area' | 'category'>,
  environment?: BugReport['environment'],
): BugReport {
  const receipt = [...crypto.getRandomValues(new Uint8Array(32))]
    .map((v) => v.toString(16).padStart(2, '0'))
    .join('');
  return validateReport({
    ...values,
    id: crypto.randomUUID(),
    receipt,
    publicConsent: true,
    ...(environment ? { environment } : {}),
  });
}
export function browserEnvironment(): NonNullable<BugReport['environment']> {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Other';
  const build = (import.meta as any).env?.VITE_REVIEW_SHA ?? 'local';
  return {
    build: /^(?:[a-f\d]{7,40}|local|unknown)$/.test(build) ? build : 'unknown',
    browser,
    viewport:
      window.innerWidth < 600 ? 'phone' : window.innerWidth < 1000 ? 'tablet' : 'desktop',
  };
}
