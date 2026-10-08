import { z } from 'zod';

import { getNavData } from '@/db/queries/nav';
import {
  cursorSchema,
  searchBookmarks,
  SEARCH_PAGE_SIZE,
} from '@/db/queries/search';
import { isAdmin } from '@/lib/session';
import type { NavData, NavSearchResult } from '@/types/nav';

export const dynamic = 'force-dynamic';

/**
 * Navigation payload for the client-side refetch, and the server-side search
 * endpoint. `?q=` or `?tags=` runs the bookmark search; without either the full
 * nav payload is returned. Signed-in admins receive hidden rows as well; public
 * callers get only visible data. `no-store` plus `Vary: Cookie` keeps a CDN from
 * serving one visitor's payload to another.
 */

const querySchema = z.object({
  q: z.string().trim().max(200).default(''),
  /** Comma-separated tag ids. */
  tags: z
    .string()
    .max(2000)
    .default('')
    .transform((value) =>
      [...new Set(value.split(',').map((id) => id.trim()).filter(Boolean))].slice(
        0,
        50,
      ),
    ),
  /** Opaque page cursor; absent on the first page. */
  cursor: cursorSchema.optional(),
  limit: z.coerce.number().int().min(1).max(SEARCH_PAGE_SIZE).optional(),
});

const CACHE_HEADERS = {
  'Cache-Control': 'no-store, max-age=0',
  Vary: 'Cookie',
} as const;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const rawCursor = params.get('cursor');
  const parsed = querySchema.safeParse({
    q: params.get('q') ?? '',
    tags: params.get('tags') ?? '',
    cursor: rawCursor === null ? undefined : rawCursor,
    limit: params.get('limit') ?? undefined,
  });
  if (!parsed.success) {
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? '查询参数无效' },
      { status: 400, headers: CACHE_HEADERS },
    );
  }

  const includeHidden = await isAdmin();
  const { q, tags, cursor, limit } = parsed.data;

  // A search is any request carrying a query, a tag filter or a page cursor.
  if (q || tags.length > 0 || cursor) {
    const result: NavSearchResult = await searchBookmarks({
      query: q,
      tagIds: tags,
      includeHidden,
      cursor: cursor ?? null,
      limit,
    });
    return Response.json(result, { headers: CACHE_HEADERS });
  }

  const nav: NavData = await getNavData({ includeHidden });
  return Response.json(nav, { headers: CACHE_HEADERS });
}
