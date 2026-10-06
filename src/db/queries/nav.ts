import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';

import { hostnameOf } from '@/lib/utils';
import { categoryIconSvg } from '@/lib/category-icon-svg';
import {
  EMPTY_NAV,
  type NavBookmark,
  type NavCategory,
  type NavData,
  type NavTag,
} from '@/types/nav';

import { safeQuery, type Database } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/**
 * Returns the nav payload in three flat queries. Hidden categories and
 * bookmarks are included only with `includeHidden` (the signed-in admin);
 * public payloads never contain them.
 */
export async function getNavData(
  options: { includeHidden?: boolean } = {},
): Promise<NavData> {
  const includeHidden = options.includeHidden === true;
  const result = await safeQuery<NavData | null>(
    'getNavData',
    (database) => assemble(database, includeHidden),
    null,
  );
  return result ?? { ...EMPTY_NAV, generatedAt: new Date().toISOString() };
}

async function assemble(
  database: Database,
  includeHidden: boolean,
): Promise<NavData> {
  const [categoryRows, bookmarkRows, linkRows, tagRows] = await Promise.all([
    database.select().from(categories).orderBy(asc(categories.sortOrder)),
    database.select().from(bookmarks).orderBy(asc(bookmarks.sortOrder)),
    database.select().from(bookmarksTags),
    database.select().from(tags).orderBy(asc(tags.name)),
  ]);

  const visibleCategories = includeHidden
    ? categoryRows
    : categoryRows.filter((row) => !row.hidden);
  // Public tag statistics only count bookmarks under visible categories.
  const visibleCategoryIds = new Set(visibleCategories.map((row) => row.id));
  const visibleBookmarks = includeHidden
    ? bookmarkRows
    : bookmarkRows.filter(
        (row) => !row.hidden && visibleCategoryIds.has(row.categoryId),
      );
  const visibleBookmarkIds = new Set(visibleBookmarks.map((row) => row.id));

  const tagById = new Map<string, NavTag>(
    tagRows.map((t) => [t.id, { id: t.id, name: t.name, slug: t.slug }]),
  );

  const tagsByBookmark = new Map<string, NavTag[]>();
  const linkedTagIds = new Set<string>();
  for (const link of linkRows) {
    // Links of hidden bookmarks are skipped on the public payload.
    if (!visibleBookmarkIds.has(link.bookmarkId)) continue;
    linkedTagIds.add(link.tagId);
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const list = tagsByBookmark.get(link.bookmarkId);
    if (list) list.push(tag);
    else tagsByBookmark.set(link.bookmarkId, [tag]);
  }

  const bookmarksByCategory = new Map<string, NavBookmark[]>();
  for (const row of visibleBookmarks) {
    const bookmark: NavBookmark = {
      id: row.id,
      title: row.title,
      url: row.url,
      description: row.description,
      iconUrl: row.iconUrl,
      hostname: hostnameOf(row.url),
      searchIndex: row.searchIndex,
      hidden: row.hidden,
      tags: tagsByBookmark.get(row.id) ?? [],
    };
    const list = bookmarksByCategory.get(row.categoryId);
    if (list) list.push(bookmark);
    else bookmarksByCategory.set(row.categoryId, [bookmark]);
  }

  const assembled: NavCategory[] = await Promise.all(
    visibleCategories.map(async (row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      // Rendered here rather than on the client: the icon registry is far
      // larger than the handful of glyphs a nav payload actually needs.
      iconSvg: await categoryIconSvg(row.icon),
      color: row.color,
      hidden: row.hidden,
      bookmarks: bookmarksByCategory.get(row.id) ?? [],
    })),
  );

  return {
    categories: assembled,
    // Only tags attached to at least one visible bookmark.
    tags: [...tagById.values()].filter((t) => linkedTagIds.has(t.id)),
    available: true,
    generatedAt: new Date().toISOString(),
  };
}

export type TagUsage = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

/** Tag columns with a SQL bookmark count over a LEFT JOIN. */
const tagUsageColumns = {
  id: tags.id,
  name: tags.name,
  slug: tags.slug,
  count: sql<number>`count(${bookmarksTags.bookmarkId})::int`,
};

/** Every tag with its bookmark count, name-ordered. */
export async function getTagUsage(): Promise<TagUsage[]> {
  return safeQuery(
    'getTagUsage',
    async (database) =>
      database
        .select(tagUsageColumns)
        .from(tags)
        .leftJoin(bookmarksTags, eq(bookmarksTags.tagId, tags.id))
        .groupBy(tags.id, tags.name, tags.slug)
        .orderBy(asc(tags.name)),
    [],
  );
}

/** Bookmark ids that currently exist, used to validate imports and reorders. */
