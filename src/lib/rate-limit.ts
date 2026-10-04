/** Fixed-window in-memory rate limiter; per-instance state, reset on restart. */
export function createFixedWindowLimiter(opts: {
  windowMs: number;
  max: number;
  maxKeys?: number;
}): { consume(key: string): boolean } {
  const { windowMs, max, maxKeys = 100 } = opts;
  const buckets = new Map<string, number[]>();

  return {
    /** Atomic check-and-record; true means the call is allowed. */
    consume(key: string): boolean {
      const now = Date.now();
      const bucket = (buckets.get(key) ?? []).filter(
        (t) => now - t < windowMs,
      );
      if (bucket.length >= max) {
        buckets.set(key, bucket);
        return false;
      }
      bucket.push(now);
      buckets.set(key, bucket);
      if (buckets.size > maxKeys) {
        // Sweeps stale keys when the map exceeds maxKeys.
        for (const [mapKey, times] of buckets) {
          if (times.length === 0 || now - times[times.length - 1]! > windowMs) {
            buckets.delete(mapKey);
          }
        }
      }
      return true;
    },
  };
}
