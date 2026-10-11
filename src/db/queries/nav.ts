import 'server-only';

import { and, asc, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';

import { hostnameOf } from '@/lib/utils';
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

 type NavDataOptions = {
  includeHidden?: boolean;
  tagSlug?: string;
  /**
   * Category page: this category's rows are never capped; every other
   * category is, so the payload stays bounded to what the page renders.
   */
  pinnedCategorySlug?: string;
  /**
   * Bookmarks kept per category; 0 or omitted keeps every row. The nav page
   * passes the preview setting, so the cap bounds the payload itself and not
   * just the rendered list. Admins are never capped: their payload feeds the
   * in-place editor and the hidden rows it edits.
   */
  previewLimit?: number;
};

/**
 * Returns the nav payload in a flat set of queries. Trashed rows are always
 * excluded; hidden categories and bookmarks are included only with
 * `includeHidden` (the signed-in admin), so public payloads never contain them.
 *
 * Rows are column-limited: `search_index` is the single largest column and
 * search now runs server-side, so it never reaches the client.
 */
export async function getNavData(
  options: NavDataOptions = {},
): Promise<NavData> {
  const includeHidden = options.includeHidden === true;
  const result = await safeQuery<NavData | null>(
    'getNavData',
    (database) =>
      assemble(database, includeHidden, options.tagSlug ?? null, {
        previewLimit: includeHidden
          ? 0
          : Math.max(0, Math.trunc(options.previewLimit ?? 0)),
        pinnedCategorySlug: options.pinnedCategorySlug ?? null,
      }),
    null,
  );
  return result ?? { ...EMPTY_NAV, generatedAt: new Date().toISOString() };
}

async function assemble(
  database: Database,
  includeHidden: boolean,
  tagSlug: string | null,
  options: { previewLimit: number; pinnedCategorySlug: string | null },
): Promise<NavData> {
  const previewLimit = options.previewLimit;

  const rankedBookmarks = database
    .select({
      id: bookmarks.id,
      categoryId: bookmarks.categoryId,
      title: bookmarks.title,
      url: bookmarks.url,
      description: bookmarks.description,
      iconUrl: bookmarks.iconUrl,
      hidden: bookmarks.hidden,
      rank:
        sql<number>`row_number() over (partition by ${bookmarks.categoryId} order by ${bookmarks.sortOrder}, ${bookmarks.id})`.as(
          'rank',
        ),
    })
    .from(bookmarks)
    .where(
      and(
        isNull(bookmarks.deletedAt),
        // Hidden rows never reach a public payload, and dropping them here
        // keeps the cap counting only rows the visitor could have seen.
        includeHidden ? undefined : eq(bookmarks.hidden, false),
      ),
    )
    .as('ranked');

  // The pinned category page keeps its rows uncapped; every other category is
  // held to the preview limit. Shared by the bookmark read and the links read
  // so both see exactly the rows the payload keeps.
  const pinnedCategoryIds = options.pinnedCategorySlug
    ? database
        .select({ id: categories.id })
        .from(categories)
        .where(
          and(
            eq(categories.slug, options.pinnedCategorySlug),
            isNull(categories.deletedAt),
          ),
        )
    : null;
  const keptRows = () =>
    previewLimit > 0
      ? or(
          sql`${rankedBookmarks.rank} <= ${previewLimit}`,
          pinnedCategoryIds
            ? inArray(rankedBookmarks.categoryId, pinnedCategoryIds)
            : undefined,
        )
      : undefined;

  const [
    categoryRows,
    bookmarkRows,
    linkRows,
    tagRows,
    tagCountRows,
    categoryTotals,
  ] = await Promise.all([
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
        id: rankedBookmarks.id,
        categoryId: rankedBookmarks.categoryId,
        title: rankedBookmarks.title,
        url: rankedBookmarks.url,
        description: rankedBookmarks.description,
        iconUrl: rankedBookmarks.iconUrl,
        hidden: rankedBookmarks.hidden,
      })
      .from(rankedBookmarks)
      .where(keptRows())
      .orderBy(
        asc(rankedBookmarks.categoryId),
        sql`${rankedBookmarks.rank} asc`,
      ),
    // Links of the kept bookmarks only, so the cap bounds these rows too.
    database
      .select({
        bookmarkId: bookmarksTags.bookmarkId,
        tagId: bookmarksTags.tagId,
      })
      .from(bookmarksTags)
      .where(
        inArray(
          bookmarksTags.bookmarkId,
          database
            .select({ id: rankedBookmarks.id })
            .from(rankedBookmarks)
            .where(keptRows()),
        ),
      ),
    database
      .select({ id: tags.id, name: tags.name, slug: tags.slug })
      .from(tags)
      .orderBy(asc(tags.name)),
    // Tag counts over every visible bookmark rather than over the rows above:
    // the tag bar keeps the same reference values on every page, capped or not.
    database
      .select({ tagId: bookmarksTags.tagId, n: sql<number>`count(*)::int` })
      .from(bookmarksTags)
      .innerJoin(bookmarks, eq(bookmarks.id, bookmarksTags.bookmarkId))
      .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
      .where(
        and(
          isNull(bookmarks.deletedAt),
          isNull(categories.deletedAt),
          includeHidden ? undefined : eq(bookmarks.hidden, false),
          includeHidden ? undefined : eq(categories.hidden, false),
        ),
      )
      .groupBy(bookmarksTags.tagId),
    // Totals behind the preview cap, so a capped section can still say how many
    // bookmarks it is holding back. Capping only ever happens for the public
    // payload, where hidden rows are already excluded above.
    previewLimit > 0
      ? database
          .select({
            categoryId: bookmarks.categoryId,
            n: sql<number>`count(*)::int`,
          })
          .from(bookmarks)
          .where(
            and(isNull(bookmarks.deletedAt), eq(bookmarks.hidden, false)),
          )
          .groupBy(bookmarks.categoryId)
      : Promise.resolve(null),
  ]);

  const visibleCategories = includeHidden
    ? categoryRows
    : categoryRows.filter((row) => !row.hidden);
  const visibleCategoryIds = new Set(visibleCategories.map((row) => row.id));

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
  for (const link of linkRows) {
    const tag = tagById.get(link.tagId);
    if (!tag) continue;
    const list = tagsByBookmark.get(link.bookmarkId);
    if (list) list.push(tag);
    else tagsByBookmark.set(link.bookmarkId, [tag]);
  }

  const tagCounts = new Map<string, number>(
    tagCountRows.map((row) => [row.tagId, row.n]),
  );

  const bookmarksByCategory = new Map<string, NavBookmark[]>();
  for (const row of bookmarkRows) {
    if (!visibleCategoryIds.has(row.categoryId)) continue;
    const bookmarkTags = tagsByBookmark.get(row.id) ?? [];
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

  const totals = categoryTotals
    ? new Map(categoryTotals.map((row) => [row.categoryId, row.n]))
    : null;

  const assembled: NavCategory[] = (
    // A tag page drops the categories it holds no bookmark of, so every section
    // it renders has content.
    tagId === null
      ? visibleCategories
      : visibleCategories.filter(
          (row) => (bookmarksByCategory.get(row.id) ?? []).length > 0,
        )
  ).map((row) => {
    const bookmarks = bookmarksByCategory.get(row.id) ?? [];
    return {
      id: row.id,
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      // iconSvg is filled at the render boundary (withCategorySvgs), keeping
      // the icon registry out of the query layer.
      color: row.color,
      hidden: row.hidden,
      ...(totals ? { bookmarksTotal: totals.get(row.id) ?? bookmarks.length } : {}),
      bookmarks,
    };
  });

  const navTags: NavTagCount[] = [...tagById.values()]
    // Only tags attached to at least one visible bookmark.
    .filter((t) => tagCounts.has(t.id))
    .map((t) => ({ ...t, count: tagCounts.get(t.id) ?? 0 }));

  return {
    categories: assembled,
    tags: navTags,
    available: true,
    generatedAt: new Date().toISOString(),
  };
}

type TagUsage = {
  id: string;
  name: string;
  slug: string;
  count: number;
};

/** Tag columns with a SQL bookmark count over the link join. */
const tagUsageColumns = {
  id: tags.id,
  name: tags.name,
  slug: tags.slug,
  count: sql<number>`count(${bookmarksTags.bookmarkId})::int`,
};

/** Most-used tags, usage-desc then name; only tags with at least one link. */
export async function getTopTags(limit: number): Promise<TagUsage[]> {
  return safeQuery(
    'getTopTags',
    async (database) =>
      database
        .select(tagUsageColumns)
        .from(tags)
        .innerJoin(bookmarksTags, eq(bookmarksTags.tagId, tags.id))
        .groupBy(tags.id, tags.name, tags.slug)
        .orderBy(desc(sql`count(${bookmarksTags.bookmarkId})`), asc(tags.name))
        .limit(limit),
    [],
  );
}
