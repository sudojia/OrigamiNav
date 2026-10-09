import 'server-only';

import { and, asc, desc, eq, exists, inArray, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';

import { categoryIconSvg } from '@/lib/category-icon-svg';
import { termConditions, tokenize } from '@/lib/search-query';
import { hostnameOf } from '@/lib/utils';
import type {
  NavBookmark,
  NavCategory,
  NavSearchResult,
  NavTag,
} from '@/types/nav';

import { safeQuery, type Database } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/**
 * Server-side bookmark search. Replaces the former client-side filter over the
 * whole `search_index`: the index is ~3x its source text, so keeping it in the
 * browser cost more than one round trip per keystroke burst.
 *
 * Semantics match the old client filter: every whitespace-separated term must
 * appear in the index (AND), while `tagIds` is an OR over the bookmark's tags.
 * Paging is keyset-based over (category sort, bookmark sort, id), so a deep
 * page costs the same as the first one.
 */

/** Rows per page. */
export const SEARCH_PAGE_SIZE = 200;

/** Opaque page cursor. Malformed input is rejected, never interpolated. */
export const cursorSchema = z
  .string()
  .max(512)
  .transform((value, ctx) => {
    try {
      const parsed = JSON.parse(
        Buffer.from(value, 'base64url').toString('utf8'),
      ) as unknown;
      const shape = z
        .object({ c: z.number().int(), s: z.number().int(), i: z.string().min(1) })
        .safeParse(parsed);
      if (!shape.success) throw new Error('shape');
      return { categorySortOrder: shape.data.c, sortOrder: shape.data.s, id: shape.data.i };
    } catch {
      ctx.addIssue({ code: 'custom', message: '游标无效' });
      return z.NEVER;
    }
  });

export type SearchCursor = z.output<typeof cursorSchema>;

/** Encodes the last row of a page into the cursor for the next one. */
function encodeCursor(row: {
  categorySortOrder: number;
  sortOrder: number;
  id: string;
}): string {
  return Buffer.from(
    JSON.stringify({ c: row.categorySortOrder, s: row.sortOrder, i: row.id }),
  ).toString('base64url');
}

/** Tag filter as an EXISTS subquery: true when the bookmark carries any of them. */
function tagFilter(tagIds: string[]) {
  if (tagIds.length === 0) return undefined;
  const matching =
    tagIds.length === 1
      ? eq(bookmarksTags.tagId, tagIds[0]!)
      : inArray(bookmarksTags.tagId, tagIds);
  return exists(
    sql`(select 1 from ${bookmarksTags} where ${bookmarksTags.bookmarkId} = ${bookmarks.id} and ${matching})`,
  );
}

/** Everything strictly after the cursor row, in display order. */
function afterCursor(cursor: SearchCursor) {
  return or(
    sql`${categories.sortOrder} > ${cursor.categorySortOrder}`,
    and(
      eq(categories.sortOrder, cursor.categorySortOrder),
      sql`${bookmarks.sortOrder} > ${cursor.sortOrder}`,
    ),
    and(
      eq(categories.sortOrder, cursor.categorySortOrder),
      eq(bookmarks.sortOrder, cursor.sortOrder),
      sql`${bookmarks.id} > ${cursor.id}`,
    ),
  );
}

type SearchRow = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hidden: boolean;
  sortOrder: number;
  categoryId: string;
  categoryName: string;
  categorySlug: string;
  categoryDescription: string;
  categoryIcon: string | null;
  categoryColor: string | null;
  categoryHidden: boolean;
  categorySortOrder: number;
};

/** Tags of the given bookmarks, grouped by bookmark id. */
async function tagsByBookmark(
  database: Database,
  bookmarkIds: string[],
): Promise<Map<string, NavTag[]>> {
  const map = new Map<string, NavTag[]>();
  if (bookmarkIds.length === 0) return map;

  const rows = await database
    .select({
      bookmarkId: bookmarksTags.bookmarkId,
      id: tags.id,
      name: tags.name,
      slug: tags.slug,
    })
    .from(bookmarksTags)
    .innerJoin(tags, eq(tags.id, bookmarksTags.tagId))
    .where(inArray(bookmarksTags.bookmarkId, bookmarkIds))
    .orderBy(asc(tags.name));

  for (const row of rows) {
    const tag: NavTag = { id: row.id, name: row.name, slug: row.slug };
    const list = map.get(row.bookmarkId);
    if (list) list.push(tag);
    else map.set(row.bookmarkId, [tag]);
  }
  return map;
}

/** Searches bookmarks and groups the matches under their category. */
export async function searchBookmarks(options: {
  query: string;
  tagIds?: string[];
  /** Signed-in admin: hidden categories and bookmarks are searchable too. */
  includeHidden?: boolean;
  /** Opaque cursor from the previous page; omitted for the first page. */
  cursor?: SearchCursor | null;
  limit?: number;
}): Promise<NavSearchResult> {
  const terms = tokenize(options.query);
  const tagIds = options.tagIds ?? [];
  // An empty query with no tag filter has nothing to narrow down.
  if (terms.length === 0 && tagIds.length === 0) {
    return { categories: [], truncated: false, cursor: null };
  }

  const includeHidden = options.includeHidden === true;
  const cursor = options.cursor ?? null;
  const limit = Math.min(Math.max(options.limit ?? SEARCH_PAGE_SIZE, 1), SEARCH_PAGE_SIZE);

  return safeQuery(
    'searchBookmarks',
    async (database) => {
      const rows: SearchRow[] = await database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          url: bookmarks.url,
          description: bookmarks.description,
          iconUrl: bookmarks.iconUrl,
          hidden: bookmarks.hidden,
          sortOrder: bookmarks.sortOrder,
          categoryId: categories.id,
          categoryName: categories.name,
          categorySlug: categories.slug,
          categoryDescription: categories.description,
          categoryIcon: categories.icon,
          categoryColor: categories.color,
          categoryHidden: categories.hidden,
          categorySortOrder: categories.sortOrder,
        })
        .from(bookmarks)
        .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
        .where(
          and(
            ...termConditions(options.query, bookmarks.searchIndex),
            tagFilter(tagIds),
            cursor ? afterCursor(cursor) : undefined,
            isNull(bookmarks.deletedAt),
            isNull(categories.deletedAt),
            includeHidden
              ? undefined
              : and(eq(bookmarks.hidden, false), eq(categories.hidden, false)),
          ),
        )
        .orderBy(
          asc(categories.sortOrder),
          asc(bookmarks.sortOrder),
          asc(bookmarks.id),
        )
        .limit(limit);

      const tagMap = await tagsByBookmark(
        database,
        rows.map((row) => row.id),
      );

      // Several rows share a category; resolve each icon once.
      const iconCache = new Map<string | null, Promise<string | null>>();
      const iconFor = (icon: string | null) => {
        let pending = iconCache.get(icon);
        if (!pending) {
          pending = categoryIconSvg(icon);
          iconCache.set(icon, pending);
        }
        return pending;
      };

      const grouped = new Map<string, NavCategory>();
      for (const row of rows) {
        let category = grouped.get(row.categoryId);
        if (!category) {
          category = {
            id: row.categoryId,
            name: row.categoryName,
            slug: row.categorySlug,
            description: row.categoryDescription,
            icon: row.categoryIcon,
            iconSvg: await iconFor(row.categoryIcon),
            color: row.categoryColor,
            hidden: row.categoryHidden,
            bookmarks: [],
          };
          grouped.set(row.categoryId, category);
        }
        const bookmark: NavBookmark = {
          id: row.id,
          title: row.title,
          url: row.url,
          description: row.description,
          iconUrl: row.iconUrl,
          hostname: hostnameOf(row.url),
          hidden: row.hidden,
          tags: tagMap.get(row.id) ?? [],
        };
        category.bookmarks.push(bookmark);
      }

      const last = rows[rows.length - 1];
      // A full page means a successor may exist; a short page is the last one.
      const full = rows.length === limit && last !== undefined;
      return {
        categories: [...grouped.values()],
        truncated: full,
        cursor: full
          ? encodeCursor({
              categorySortOrder: last.categorySortOrder,
              sortOrder: last.sortOrder,
              id: last.id,
            })
          : null,
      };
    },
    { categories: [], truncated: false, cursor: null },
  );
}

/** One row of the extension's bookmark manager. */
export type ExtBookmarkRow = {
  id: string;
  title: string;
  url: string;
  description: string;
  hidden: boolean;
  categoryId: string;
  categoryName: string;
  tags: NavTag[];
};

/**
 * Live bookmarks matching the same terms as the public search, newest first,
 * with their category and tags. Hidden rows are included: the caller holds the
 * extension's write token. An empty query matches nothing.
 */
export async function searchExtBookmarks(
  query: string,
  limit: number,
): Promise<ExtBookmarkRow[]> {
  const terms = termConditions(query, bookmarks.searchIndex);
  if (terms.length === 0) return [];

  return safeQuery(
    'searchExtBookmarks',
    async (database) => {
      const rows = await database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          url: bookmarks.url,
          description: bookmarks.description,
          hidden: bookmarks.hidden,
          categoryId: categories.id,
          categoryName: categories.name,
        })
        .from(bookmarks)
        .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
        .where(
          and(
            ...terms,
            isNull(bookmarks.deletedAt),
            isNull(categories.deletedAt),
          ),
        )
        .orderBy(desc(bookmarks.createdAt), asc(bookmarks.id))
        .limit(limit);

      const tagMap = await tagsByBookmark(
        database,
        rows.map((row) => row.id),
      );
      return rows.map((row) => ({ ...row, tags: tagMap.get(row.id) ?? [] }));
    },
    [],
  );
}
