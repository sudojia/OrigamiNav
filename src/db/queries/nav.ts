import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';

import { hostnameOf } from '@/lib/utils';
import {
  EMPTY_NAV,
  type NavBookmark,
  type NavCategory,
  type NavData,
  type NavTag,
} from '@/types/nav';

import { safeQuery, type Database } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/** Returns the full public nav payload in three flat queries. */
export async function getNavData(): Promise<NavData> {
  const result = await safeQuery<NavData | null>('getNavData', assemble, null);
  return result ?? { ...EMPTY_NAV, generatedAt: new Date().toISOString() };
}

async function assemble(database: Database): Promise<NavData> {
  const [categoryRows, bookmarkRows, linkRows, tagRows] = await Promise.all([
    database.select().from(categories).orderBy(asc(categories.sortOrder)),
    database.select().from(bookmarks).orderBy(asc(bookmarks.sortOrder)),
    database.select().from(bookmarksTags),
    database.select().from(tags).orderBy(asc(tags.name)),
  ]);

  const tagById = new Map<string, NavTag>(
    tagRows.map((t) => [t.id, { id: t.id, name: t.name, slug: t.slug }]),
  );

  const tagsByBookmark = new Map<string, NavTag[]>();
  for (const link of linkRows) {
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const list = tagsByBookmark.get(link.bookmarkId);
    if (list) list.push(tag);
    else tagsByBookmark.set(link.bookmarkId, [tag]);
  }

  const bookmarksByCategory = new Map<string, NavBookmark[]>();
  for (const row of bookmarkRows) {
    const bookmark: NavBookmark = {
      id: row.id,
      title: row.title,
      url: row.url,
      description: row.description,
      iconUrl: row.iconUrl,
      hostname: hostnameOf(row.url),
      searchIndex: row.searchIndex,
      tags: tagsByBookmark.get(row.id) ?? [],
    };
    const list = bookmarksByCategory.get(row.categoryId);
    if (list) list.push(bookmark);
    else bookmarksByCategory.set(row.categoryId, [bookmark]);
  }

  const assembled: NavCategory[] = categoryRows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    color: row.color,
    bookmarks: bookmarksByCategory.get(row.id) ?? [],
  }));

  return {
    categories: assembled,
    // Only tags attached to at least one bookmark.
    tags: [...tagById.values()].filter((t) =>
      linkRows.some((l) => l.tagId === t.id),
    ),
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
