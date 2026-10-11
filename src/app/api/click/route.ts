import { z } from 'zod';

import { incrementBookmarkClick } from '@/db/queries/bookmarks';
import { createFixedWindowLimiter, trustedClientKey } from '@/lib/rate-limit';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ id: z.string().min(1).max(64) });

// Public counter: per-IP when the proxy is trusted, a permissive global cap
// otherwise, so the write can't be flooded either way.
const clickIpLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 60 });
const clickGlobalLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 600 });

/** Counts one open of a bookmark from the public site. */
export async function POST(request: Request) {
  const ipKey = trustedClientKey(request.headers);
  const allowed = ipKey
    ? clickIpLimiter.consume(ipKey)
    : clickGlobalLimiter.consume('global');
  if (!allowed) {
    return new Response(null, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  await incrementBookmarkClick(parsed.data.id);
  return new Response(null, { status: 204 });
}
