import 'server-only';

import { asc, eq, isNull, sql } from 'drizzle-orm';

import { hostnameOf } from '@/lib/utils';
import { categoryIconSvg } from '@/lib/category-icon-svg';
import {
  EMPTY_NAV,
  type NavBookmark,
  type NavCategory,
  type NavData,
  type NavTag,
  type NavTagCount,
} from '@/types/nav';

import { safeQuery, type Database } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/**
 * Returns the nav payload in three flat queries. Trashed rows are always
 * excluded; hidden categories and bookmarks are included only with
 * `includeHidden` (the signed-in admin), so public payloads never contain them.
 *
 * Rows are column-limited: `search_index` is the single largest column and
 * search now runs server-side, so it never reaches the client.
 */
export async function getNavData(
  options: { includeHidden?: boolean; tagSlug?: string } = {},
): Promise<NavData> {
  const includeHidden = options.includeHidden === true;
  const result = await safeQuery<NavData | null>(
    'getNavData',
    (database) => assemble(database, includeHidden, options.tagSlug ?? null),
    null,
  );
  return result ?? { ...EMPTY_NAV, generatedAt: new Date().toISOString() };
}

async function assemble(
  database: Database,
  includeHidden: boolean,
  tagSlug: string | null,
): Promise<NavData> {
  const [categoryRows, bookmarkRows, linkRows, tagRows] = await Promise.all([
    database
      .select({
        id: categories.id,
        name: categories.name,
        slug: categories.slug,
        description: categories.description,
        icon: categories.icon,
        color: categories.color,
        hidden: categories.hidden,
      })
      .from(categories)
      .where(isNull(categories.deletedAt))
      // id breaks sort-order ties, so the order matches the search keyset.
      .orderBy(asc(categories.sortOrder), asc(categories.id)),
    database
      .select({
        id: bookmarks.id,
        categoryId: bookmarks.categoryId,
        title: bookmarks.title,
        url: bookmarks.url,
        description: bookmarks.description,
        iconUrl: bookmarks.iconUrl,
        hidden: bookmarks.hidden,
      })
      .from(bookmarks)
      .where(isNull(bookmarks.deletedAt))
      // id breaks sort-order ties, so the order matches the search keyset.
      .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.id)),
    database
      .select({
        bookmarkId: bookmarksTags.bookmarkId,
        tagId: bookmarksTags.tagId,
      })
      .from(bookmarksTags),
    database
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .orderBy(asc(tags.name)),
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

  // Resolved from the tag rows already read, so a tag page costs no extra
  // round trip. An unknown slug gets an empty payload: falling back to the
  // whole site would serve a page the URL does not describe.
  const tagId = tagSlug
    ? (tagRows.find((row) => row.slug === tagSlug)?.id ?? null)
    : null;
  if (tagSlug !== null && tagId === null) {
    return {
      categories: [],
      tags: [],
      available: true,
      generatedAt: new Date().toISOString(),
    };
  }

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
  const tagCounts = new Map<string, number>();
  for (const row of visibleBookmarks) {
    const bookmarkTags = tagsByBookmark.get(row.id) ?? [];
    // Counts stay site-wide even when the listed bookmarks are narrowed to one
    // tag, so the tag bar keeps the reference values it shows elsewhere.
    for (const tag of bookmarkTags) {
      tagCounts.set(tag.id, (tagCounts.get(tag.id) ?? 0) + 1);
    }
    if (tagId !== null && !bookmarkTags.some((tag) => tag.id === tagId)) {
      continue;
    }
    const bookmark: NavBookmark = {
      id: row.id,
      title: row.title,
      url: row.url,
      description: row.description,
      iconUrl: row.iconUrl,
      hostname: hostnameOf(row.url),
      hidden: row.hidden,
      tags: bookmarkTags,
    };
    const list = bookmarksByCategory.get(row.categoryId);
    if (list) list.push(bookmark);
    else bookmarksByCategory.set(row.categoryId, [bookmark]);
  }

  const assembled: NavCategory[] = await Promise.all(
    // A tag page drops the categories it holds no bookmark of, so every section
    // it renders has content.
    (tagId === null
      ? visibleCategories
      : visibleCategories.filter(
          (row) => (bookmarksByCategory.get(row.id) ?? []).length > 0,
        )
    ).map(async (row) => ({
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

  const navTags: NavTagCount[] = [...tagById.values()]
    // Only tags attached to at least one visible bookmark.
    .filter((t) => linkedTagIds.has(t.id))
    .map((t) => ({ ...t, count: tagCounts.get(t.id) ?? 0 }));

  return {
    categories: assembled,
    tags: navTags,
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
