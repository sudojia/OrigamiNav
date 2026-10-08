import 'server-only';

import { and, asc, desc, eq, gt, isNull, sql } from 'drizzle-orm';

import { safeQuery } from '../client';
import { bookmarks, categories, tags } from '../schema';

/** Row counts for the admin overview; trashed rows are not counted. */
export type AdminCounts = {
  categories: number;
  bookmarks: number;
  tags: number;
};

export async function getAdminCounts(): Promise<AdminCounts> {
  return safeQuery(
    'getAdminCounts',
    async (database) => {
      const [categoryRows, bookmarkRows, tagRows] = await Promise.all([
        database
          .select({ n: sql<number>`count(*)::int` })
          .from(categories)
          .where(isNull(categories.deletedAt)),
        database
          .select({ n: sql<number>`count(*)::int` })
          .from(bookmarks)
          .where(isNull(bookmarks.deletedAt)),
        database.select({ n: sql<number>`count(*)::int` }).from(tags),
      ]);
      return {
        categories: categoryRows[0]?.n ?? 0,
        bookmarks: bookmarkRows[0]?.n ?? 0,
        tags: tagRows[0]?.n ?? 0,
      };
    },
    { categories: 0, bookmarks: 0, tags: 0 },
  );
}

/** Newest bookmarks first; ISO text sorts by time. */
export async function getRecentBookmarks(
  limit: number,
): Promise<
  Array<{ id: string; title: string; url: string; createdAt: string; categoryName: string }>
> {
  return safeQuery(
    'getRecentBookmarks',
    async (database) => {
      const rows = await database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          url: bookmarks.url,
          createdAt: bookmarks.createdAt,
          categoryName: categories.name,
        })
        .from(bookmarks)
        .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
        .where(and(isNull(bookmarks.deletedAt), isNull(categories.deletedAt)))
        .orderBy(desc(bookmarks.createdAt))
        .limit(limit);
      return rows;
    },
    [],
  );
}

/** Bookmark count per live category in display order, including empty ones. */
export async function getCategoryDistribution(): Promise<
  Array<{ id: string; name: string; color: string | null; count: number }>
> {
  return safeQuery(
    'getCategoryDistribution',
    async (database) => {
      const rows = await database
        .select({
          id: categories.id,
          name: categories.name,
          color: categories.color,
          count: sql<number>`count(${bookmarks.id})::int`,
        })
        .from(categories)
        .leftJoin(
          bookmarks,
          and(
            eq(bookmarks.categoryId, categories.id),
            isNull(bookmarks.deletedAt),
          ),
        )
        .where(isNull(categories.deletedAt))
        .groupBy(categories.id, categories.name, categories.color, categories.sortOrder)
        .orderBy(asc(categories.sortOrder));
      return rows;
    },
    [],
  );
}

/** Most-opened live bookmarks, plus the total number of opens. */
export async function getClickStats(limit: number): Promise<{
  items: Array<{ id: string; title: string; clickCount: number }>;
  total: number;
}> {
  return safeQuery(
    'getClickStats',
    async (database) => {
      const [rows, totals] = await Promise.all([
        database
          .select({
            id: bookmarks.id,
            title: bookmarks.title,
            clickCount: bookmarks.clickCount,
          })
          .from(bookmarks)
          .where(and(gt(bookmarks.clickCount, 0), isNull(bookmarks.deletedAt)))
          .orderBy(desc(bookmarks.clickCount), asc(bookmarks.title))
          .limit(limit),
        database
          .select({
            n: sql<number>`coalesce(sum(${bookmarks.clickCount}), 0)::int`,
          })
          .from(bookmarks)
          .where(isNull(bookmarks.deletedAt)),
      ]);
      return { items: rows, total: totals[0]?.n ?? 0 };
    },
    { items: [], total: 0 },
  );
}
