'use server';

import { guardActionWithAdmin } from '@/lib/action-guard';
import { fetchUrlMeta, type FetchMetaResult } from '@/lib/fetch-meta';
import { createFixedWindowLimiter } from '@/lib/rate-limit';

/** Scraping server actions: auth + rate limit, then the lib core. */

// ── Rate limit: 20 requests/minute per admin ────────────────────────────────
const rateLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 20 });

export async function fetchUrlMetaAction(url: string): Promise<FetchMetaResult> {
  const auth = await guardActionWithAdmin();
  if (!auth.ok) return { ok: false, message: auth.message };

  if (!rateLimiter.consume(auth.adminId)) {
    return { ok: false, message: '抓取过于频繁，请稍后再试（每分钟 20 次）' };
  }

  // URL validation and all network work happen in the lib core.
  return fetchUrlMeta(url);
}
