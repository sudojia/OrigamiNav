import 'server-only';

import { eq } from 'drizzle-orm';

import { nowIso } from '@/lib/ids';

import { safeQuery } from '../client';
import { bookmarkIcons } from '../schema';

/** Cached bookmark favicons; a row with empty `data` is a cached miss. */

/** How long a resolved icon is trusted before it is fetched again. */
export const ICON_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Misses expire sooner: the site may publish a favicon at any time. */
export const ICON_MISS_TTL_MS = 60 * 60 * 1000;

export type CachedIcon = {
  mimeType: string;
  data: string;
  fetchedAt: string;
};

export async function getCachedIcon(host: string): Promise<CachedIcon | null> {
  return safeQuery(
    'getCachedIcon',
    async (database) => {
      const rows = await database
        .select({
          mimeType: bookmarkIcons.mimeType,
          data: bookmarkIcons.data,
          fetchedAt: bookmarkIcons.fetchedAt,
        })
        .from(bookmarkIcons)
        .where(eq(bookmarkIcons.host, host))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Upserts one cache row; a write failure must not break icon serving. */
export async function putCachedIcon(input: {
  host: string;
  mimeType: string;
  data: string;
}): Promise<void> {
  const fetchedAt = nowIso();
  await safeQuery(
    'putCachedIcon',
    async (database) => {
      await database
        .insert(bookmarkIcons)
        .values({ ...input, fetchedAt })
        .onConflictDoUpdate({
          target: bookmarkIcons.host,
          set: { mimeType: input.mimeType, data: input.data, fetchedAt },
        });
    },
    undefined,
  );
}
