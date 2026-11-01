import {
  validateInsights,
  type InsightEvent,
} from '@/supabase/functions/review-feedback/contract';
import { PRODUCT_ENDPOINT, browserEnvironment } from './product-feedback';
export type CollectionPreference = { enabled: boolean; updatedAt: string };
const preferenceKey = (namespace: string) => 'review-product-data:' + namespace;
const memoryPreferences = new Map<string, CollectionPreference>();
function valid(p: any): p is CollectionPreference {
  return (
    typeof p?.enabled === 'boolean' && Number.isFinite(Date.parse(p.updatedAt))
  );
}
export function collectionEnabled(
  namespace: string,
  synced?: CollectionPreference,
) {
  let local: CollectionPreference | undefined;
  try {
    const p = JSON.parse(
      localStorage.getItem(preferenceKey(namespace)) ?? 'null',
    );
    if (valid(p)) local = p;
  } catch {
    /* storage unavailable */
  }
  const choices = [memoryPreferences.get(namespace), local, synced].filter(
    valid,
  );
  choices.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
  return choices[0]?.enabled ?? true;
}
export function storeCollectionPreference(
  namespace: string,
  preference: CollectionPreference,
) {
  memoryPreferences.set(namespace, preference);
  try {
    localStorage.setItem(preferenceKey(namespace), JSON.stringify(preference));
  } catch {
    /* Account storage is also updated by the caller. */
  }
  window.dispatchEvent(new Event('review-product-privacy'));
}
/** Only allowlisted, coarse events. No user/session/question ids, scores, content, URLs or error messages. */
export class InsightsBuffer {
  private enabled = false;
  private pending: InsightEvent[] = [];
  private flight: AbortController | undefined;
  constructor(private request: typeof fetch = fetch) {}
  configure(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) {
      this.pending = [];
      this.flight?.abort();
      this.flight = undefined;
    }
  }
  add(event: InsightEvent) {
    if (!this.enabled) return;
    validateInsights([event]);
    if (this.pending.length < 20) this.pending.push({ ...event });
  }
  async flush() {
    if (!this.enabled || this.flight || !this.pending.length) return;
    const events = this.pending.splice(0, 20);
    const controller = new AbortController();
    this.flight = controller;
    try {
      await this.request(PRODUCT_ENDPOINT + 'metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events, consentVersion: '2026-11-01' }),
        referrerPolicy: 'no-referrer',
        keepalive: true,
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(10000),
        ]),
      });
    } catch {
      /* Best effort: never resend an uncertain delivery or block learning. */
    } finally {
      if (this.flight === controller) this.flight = undefined;
    }
  }
}
export const productInsights = new InsightsBuffer();
export function trackProductEvent(
  event: InsightEvent['event'],
  area: InsightEvent['area'],
  duration: InsightEvent['duration'] = 'none',
) {
  if (typeof window === 'undefined') return;
  try {
    const environment = browserEnvironment();
    productInsights.add({ event, area, duration, device: environment.viewport as InsightEvent['device'],
      browser: environment.browser, build: environment.build });
  } catch { /* Optional statistics must never interrupt saving, learning or navigation. */ }
}
