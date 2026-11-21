export const naviProgressType = 'application/x-ndjson';

const progressSteps = ['loading-pack', 'found-knowledge', 'analysis', 'study-advice', 'validation'] as const;
const summarySteps = ['problem', 'conditions', 'context', 'study', 'citations', 'response'] as const;

export type NaviProgress = typeof progressSteps[number];
export type NaviSummaryStep = typeof summarySteps[number];

export function isNaviProgress(value: unknown): value is NaviProgress {
  return progressSteps.some((step) => step === value);
}

export function naviSummary(value: unknown): NaviSummaryStep[] {
  if (!Array.isArray(value)) return [];
  return summarySteps.filter((step) => value.includes(step));
}

/** Consume only application events. Model output is released as a single validated result. */
export async function readNaviResponse(response: Response, onProgress?: (step: NaviProgress) => void) {
  if (!response.body || !response.headers.get('Content-Type')?.startsWith(naviProgressType))
    return response;
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = '';
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) throw new Error('Navi stream ended before its result');
      pending += value;
      if (pending.length > 1000000) throw new Error('Navi stream exceeded its limit');
      let boundary: number;
      while ((boundary = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, boundary);
        pending = pending.slice(boundary + 1);
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        if (event.type === 'progress' && isNaviProgress(event.step)) onProgress?.(event.step);
        if (event.type === 'result' && Number.isInteger(event.status) && event.status >= 200 && event.status <= 599)
          return Response.json(event.body, { status: event.status });
      }
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
