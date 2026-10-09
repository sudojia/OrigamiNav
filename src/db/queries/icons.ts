import 'server-only';

import { eq, sql } from 'drizzle-orm';

import { nowIso } from '@/lib/ids';

import { db, safeQuery } from '../client';
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

/** Cache footprint for the settings panel. */
export type IconCacheStats = {
  entries: number;
  /** Rows cached as "no icon anywhere", so the total is not read as icons. */
  misses: number;
  /** Decoded icon bytes, not the base64 text length. */
  bytes: number;
};

export async function getIconCacheStats(): Promise<IconCacheStats> {
  return safeQuery(
    'getIconCacheStats',
    async (database) => {
      const rows = await database
        .select({
          entries: sql<number>`count(*)::int`,
          misses: sql<number>`count(*) filter (where ${bookmarkIcons.data} = '')::int`,
          // Summed as bigint, which node-postgres hands back as a string.
          base64Length: sql<string>`coalesce(sum(octet_length(${bookmarkIcons.data})), 0)::bigint`,
        })
        .from(bookmarkIcons);

      const row = rows[0];
      return {
        entries: row?.entries ?? 0,
        misses: row?.misses ?? 0,
        // base64 carries 3 bytes per 4 characters; padding makes this off by at
        // most two bytes per row, which does not matter for a size readout.
        bytes: Math.floor((Number(row?.base64Length ?? 0) * 3) / 4),
      };
    },
    { entries: 0, misses: 0, bytes: 0 },
  );
}

/** Empties the cache; every entry is refetched on its next request. */
export async function clearIconCache(): Promise<number> {
  const result = await db.delete(bookmarkIcons);
  return result.rowCount ?? 0;
}
