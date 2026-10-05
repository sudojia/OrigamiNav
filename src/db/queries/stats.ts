import 'server-only';

import { asc, desc, eq, gt, sql } from 'drizzle-orm';

import { safeQuery } from '../client';
import { bookmarks, categories, tags } from '../schema';

/** Row counts for the admin overview. */
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
        database.select({ n: sql<number>`count(*)::int` }).from(categories),
        database.select({ n: sql<number>`count(*)::int` }).from(bookmarks),
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
        .orderBy(desc(bookmarks.createdAt))
        .limit(limit);
      return rows;
    },
    [],
  );
}

/** Bookmark count per category in display order, including empty ones. */
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
        .leftJoin(bookmarks, eq(bookmarks.categoryId, categories.id))
        .groupBy(categories.id, categories.name, categories.color, categories.sortOrder)
        .orderBy(asc(categories.sortOrder));
      return rows;
    },
    [],
  );
}

/** Most-opened bookmarks, plus the total number of opens. */
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
          .where(gt(bookmarks.clickCount, 0))
          .orderBy(desc(bookmarks.clickCount), asc(bookmarks.title))
          .limit(limit),
        database
          .select({
            n: sql<number>`coalesce(sum(${bookmarks.clickCount}), 0)::int`,
          })
          .from(bookmarks),
      ]);
      return { items: rows, total: totals[0]?.n ?? 0 };
    },
    { items: [], total: 0 },
  );
}
