export const PRODUCT_AREAS = [
  'home',
  'study',
  'subjects',
  'results',
  'workshop',
  'profile',
  'devices',
  'other',
] as const;
export type ProductArea = (typeof PRODUCT_AREAS)[number];
export const FEEDBACK_CATEGORIES = ['bug', 'suggestion', 'question'] as const;
export type FeedbackCategory = typeof FEEDBACK_CATEGORIES[number];
export const INSIGHT_EVENTS = [
  'page_view',
  'page_time',
  'study_start',
  'study_saved_exit',
  'practice_complete',
  'ui_error',
  'import_review_required',
  'import_ready',
  'import_complete',
  'import_apply_error',
  'export_started',
  'export_ready',
  'export_error',
  'export_download_clicked',
  'login_complete',
  'registration_confirmation',
  'onboarding_complete',
] as const;
export const DURATION_BUCKETS = [
  'none',
  'under_1m',
  '1_5m',
  '5_15m',
  '15_60m',
] as const;
export type InsightEvent = {
  event: (typeof INSIGHT_EVENTS)[number];
  area: ProductArea;
  device: 'phone' | 'tablet' | 'desktop';
  duration: (typeof DURATION_BUCKETS)[number];
  browser?: string;
  build?: string;
};
export type BugReport = {
  id: string;
  receipt: string;
  title: string;
  description: string;
  area: ProductArea;
  category: FeedbackCategory;
  publicConsent: true;
  environment?: { build: string; browser: string; viewport: string };
};
export const UUID =
  /^[a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i;
export const RECEIPT = /^[a-f\d]{64}$/;
export const BUILD = /^(?:[a-f\d]{7,40}|local|unknown)$/;
export const BROWSERS = ['Chrome', 'Edge', 'Firefox', 'Safari', 'Other'];
export const VIEWPORTS = ['phone', 'tablet', 'desktop'];
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k));
export function validateReport(value: unknown): BugReport {
  if (
    !record(value) ||
    !keys(value, [
      'id',
      'receipt',
      'title',
      'description',
      'area',
      'publicConsent',
      'environment',
      'category',
    ]) ||
    typeof value.id !== 'string' ||
    !UUID.test(value.id) ||
    typeof value.receipt !== 'string' ||
    !RECEIPT.test(value.receipt) ||
    typeof value.title !== 'string' ||
    value.title.trim().length < 2 ||
    value.title.length > 120 ||
    typeof value.description !== 'string' ||
    value.description.trim().length < 10 ||
    value.description.length > 6000 ||
    !PRODUCT_AREAS.includes(value.area as ProductArea) ||
    (value.category !== undefined && !FEEDBACK_CATEGORIES.includes(value.category as FeedbackCategory)) ||
    value.publicConsent !== true
  )
    throw new Error(
      '请填写 2–120 字的问题标题、10–6000 字的问题描述，并确认公开提交。',
    );
  if (
    /(?:gh[pousr]_[a-z\d_]{20,}|github_pat_[a-z\d_]{20,}|sb_secret_[a-z\d_-]{15,}|eyJ[a-z\d_-]{20,}\.[a-z\d_-]+\.[a-z\d_-]+|-----BEGIN .*PRIVATE KEY-----)/i.test(
      value.title + '\n' + value.description,
    )
  )
    throw new Error('内容中疑似包含访问密钥，请移除后再提交。');
  if (value.environment !== undefined) {
    const e = value.environment;
    if (
      !record(e) ||
      !keys(e, ['build', 'browser', 'viewport']) ||
      typeof e.build !== 'string' ||
      !BUILD.test(e.build) ||
      !BROWSERS.includes(String(e.browser)) ||
      !VIEWPORTS.includes(String(e.viewport))
    )
      throw new Error('附带的环境信息格式不正确。');
  }
  return {
    ...value,
    category: value.category ?? 'bug',
    title: value.title.trim().replace(/[\u0000-\u001f\u007f]/g, ''),
    description: value.description.trim(),
  } as BugReport;
}
export function validateInsights(value: unknown): InsightEvent[] {
  if (!Array.isArray(value) || !value.length || value.length > 20)
    throw new Error('Invalid metrics batch');
  for (const e of value) {
    if (
      !record(e) ||
      !keys(e, ['event', 'area', 'device', 'duration', 'browser', 'build']) ||
      !INSIGHT_EVENTS.includes(e.event as InsightEvent['event']) ||
      !PRODUCT_AREAS.includes(e.area as ProductArea) ||
      !VIEWPORTS.includes(String(e.device)) ||
      !DURATION_BUCKETS.includes(e.duration as InsightEvent['duration']) ||
      (e.browser !== undefined && !BROWSERS.includes(String(e.browser))) ||
      (e.build !== undefined &&
        (typeof e.build !== 'string' || !BUILD.test(e.build)))
    )
      throw new Error('Invalid metric');
  }
  return value.map((e) => ({
    ...e,
    browser: e.browser ?? 'Other',
    build: e.build ?? 'unknown',
  })) as InsightEvent[];
}
export function productArea(page: string): ProductArea {
  if (
    ['plan', 'study', 'course', 'remedy', 'assessment', 'exam'].includes(page)
  )
    return 'study';
  if (['library', 'subjects'].includes(page)) return 'subjects';
  if (['results', 'analytics'].includes(page)) return 'results';
  if (
    [
      'forge',
      'enchant',
      'equipment',
      'shop',
      'chest',
      'workshop',
      'redeem',
      'super',
    ].includes(page)
  )
    return 'workshop';
  if (page === 'you') return 'profile';
  return PRODUCT_AREAS.includes(page as ProductArea)
    ? (page as ProductArea)
    : 'other';
}
export function durationBucket(ms: number): InsightEvent['duration'] {
  return ms < 60000
    ? 'under_1m'
    : ms < 300000
      ? '1_5m'
      : ms < 900000
        ? '5_15m'
        : '15_60m';
}
