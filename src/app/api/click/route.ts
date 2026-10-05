import { z } from 'zod';

import { incrementBookmarkClick } from '@/db/queries/bookmarks';

export const dynamic = 'force-dynamic';

const bodySchema = z.object({ id: z.string().min(1).max(64) });

/** Counts one open of a bookmark from the public site. */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return new Response(null, { status: 400 });
  }

  await incrementBookmarkClick(parsed.data.id);
  return new Response(null, { status: 204 });
}
