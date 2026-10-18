/** Monotonic clock for review telemetry. No browser globals; callers supply interaction/visibility. */
export function createLearningTimer(start = 0, idleAfterMs = 30000) {
  let last = start,
    active = 0,
    lastInteraction = start,
    visible = true;
  const advance = (now: number) => {
    const next = Math.max(last, Number.isFinite(now) ? now : last);
    if (visible)
      active += Math.max(
        0,
        Math.min(next, lastInteraction + idleAfterMs) - last,
      );
    last = next;
  };
  return {
    activity(now: number) {
      advance(now);
      lastInteraction = last;
    },
    visibility(next: boolean, now: number) {
      advance(now);
      visible = next;
      if (next) lastInteraction = last;
    },
    snapshot(now: number) {
      advance(now);
      const wallTimeMs = Math.max(0, last - start),
        activeThinkMs = Math.min(wallTimeMs, active);
      return {
        activeThinkMs: Math.round(activeThinkMs),
        wallTimeMs: Math.round(wallTimeMs),
        idleMs: Math.round(wallTimeMs - activeThinkMs),
      };
    },
  };
}
