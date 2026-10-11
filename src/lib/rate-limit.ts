import { isIP } from 'node:net';

/** Fixed-window in-memory rate limiter; per-instance state, reset on restart. */
export function createFixedWindowLimiter(opts: {
  windowMs: number;
  max: number;
  maxKeys?: number;
}): {
  /** Atomic check-and-record; true means the call is allowed. */
  consume(key: string): boolean;
  /** True while `key` still has free slots; records nothing. */
  hasCapacity(key: string): boolean;
  /** Clears every recorded slot for `key`. */
  reset(key: string): void;
} {
  const { windowMs, max, maxKeys = 100 } = opts;
  const buckets = new Map<string, number[]>();

  // Drops expired timestamps, removing the key entirely once empty.
  const fresh = (key: string): number[] => {
    const now = Date.now();
    const stored = buckets.get(key) ?? [];
    const times = stored.filter((t) => now - t < windowMs);
    if (times.length !== stored.length) {
      if (times.length) buckets.set(key, times);
      else buckets.delete(key);
    }
    return times;
  };

  return {
    consume(key: string): boolean {
      const bucket = fresh(key);
      if (bucket.length >= max) return false;
      bucket.push(Date.now());
      buckets.set(key, bucket);
      if (buckets.size > maxKeys) {
        // Sweeps stale keys when the map exceeds maxKeys.
        const now = Date.now();
        for (const [mapKey, times] of buckets) {
          if (times.length === 0 || now - times[times.length - 1]! > windowMs) {
            buckets.delete(mapKey);
          }
        }
      }
      return true;
    },
    hasCapacity(key: string): boolean {
      return fresh(key).length < max;
    },
    reset(key: string): void {
      buckets.delete(key);
    },
  };
}

/** `ip:<addr>` from x-real-ip when TRUSTED_PROXY=true, else null. */
export function trustedClientKey(headers: {
  get(name: string): string | null;
}): string | null {
  if (process.env.TRUSTED_PROXY !== 'true') return null;
  // Accepts only a bare IP address.
  const real = headers.get('x-real-ip')?.trim();
  if (!real || isIP(real) === 0) return null;
  return `ip:${real}`;
}
