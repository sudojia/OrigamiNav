import 'server-only';

import {
  and,
  asc,
  count,
  desc,
  eq,
  exists,
  ilike,
  inArray,
  ne,
  notExists,
  notInArray,
  or,
  sql,
} from 'drizzle-orm';

import { tokenize } from '@/lib/search-query';
import { newId, nowIso } from '@/lib/ids';
import { slugifyUnique } from '@/lib/pinyin';
import type { TagListQuery, TagSort } from '@/lib/tag-list';

import { db, safeQuery, type Database } from '../client';
import { bookmarksTags, tags, type Tag } from '../schema';
import { rebuildSearchIndexesFor } from './bookmarks';

/** True when the name is already used by a tag other than `excludeId`. */
export async function tagNameTaken(
  name: string,
  excludeId?: string,
): Promise<boolean> {
  return safeQuery(
    'tagNameTaken',
    async (database) => {
      const condition = excludeId
        ? and(eq(tags.name, name), ne(tags.id, excludeId))
        : eq(tags.name, name);
      const rows = await database
        .select({ id: tags.id })
        .from(tags)
        .where(condition)
        .limit(1);
      return rows.length > 0;
    },
    false,
  );
}

/** True when a tag slug is already taken. */
export async function tagSlugTaken(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  return safeQuery(
    'tagSlugTaken',
    async (database) => {
      const condition = excludeId
        ? and(eq(tags.slug, slug), ne(tags.id, excludeId))
        : eq(tags.slug, slug);
      const rows = await database
        .select({ id: tags.id })
        .from(tags)
        .where(condition)
        .limit(1);
      return rows.length > 0;
    },
    false,
  );
}

/** Finds the first free `base`, `base-2`, `base-3`, … tag slug. */
export async function ensureUniqueTagSlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  if (!(await tagSlugTaken(base, excludeId))) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await tagSlugTaken(candidate, excludeId))) return candidate;
  }
  // Fall back to an id-suffixed slug.
  return `${base}-${newId().slice(-6)}`;
}

export async function createTag(name: string): Promise<Tag> {
  const id = newId();
  const rows = await db
    .insert(tags)
    .values({
      id,
      name,
      // Pinyin slug, disambiguated when another name slugs identically.
      slug: await ensureUniqueTagSlug(slugifyUnique(name, id)),
      createdAt: nowIso(),
    })
    .returning();
  const created = rows[0];
  if (!created) throw new Error('Failed to create tag');
  return created;
}

export async function renameTag(
  id: string,
  name: string,
): Promise<Tag | null> {
  // Collect affected bookmarks before the rename for index rebuild.
  const affected = await db
    .select({ bookmarkId: bookmarksTags.bookmarkId })
    .from(bookmarksTags)
    .where(eq(bookmarksTags.tagId, id));

  const rows = await db
    .update(tags)
    .set({ name, slug: await ensureUniqueTagSlug(slugifyUnique(name, id), id) })
    .where(eq(tags.id, id))
    .returning();
  const updated = rows[0];
  if (!updated) return null;

  await rebuildSearchIndexesFor(affected.map((a) => a.bookmarkId));
  return updated;
}

/** Deletes a tag and rebuilds the search indexes of affected bookmarks. */
export async function deleteTag(id: string): Promise<void> {
  const affected = await db
    .select({ bookmarkId: bookmarksTags.bookmarkId })
    .from(bookmarksTags)
    .where(eq(bookmarksTags.tagId, id));

  await db.delete(tags).where(eq(tags.id, id));
  await rebuildSearchIndexesFor(affected.map((a) => a.bookmarkId));
}

/**
 * Deletes every tag no bookmark uses. Returns the number removed. Unused tags
 * have no bookmark links, so no search index needs rebuilding.
 */
export async function deleteUnusedTags(): Promise<number> {
  const removed = await db
    .delete(tags)
    .where(
      notExists(
        db
          .select({ tagId: bookmarksTags.tagId })
          .from(bookmarksTags)
          .where(eq(bookmarksTags.tagId, tags.id)),
      ),
    )
    .returning({ id: tags.id });
  return removed.length;
}

/** Attaches tags (creating missing ones) to an existing bookmark, then rebuilds its search index. */
export async function attachTagsToBookmark(
  bookmarkId: string,
  names: string[],
): Promise<void> {
  const tagIds = await resolveTagIds(names);
  if (tagIds.length === 0) return;
  await db
    .insert(bookmarksTags)
    .values(tagIds.map((tagId) => ({ bookmarkId, tagId })))
    .onConflictDoNothing();
  await rebuildSearchIndexesFor([bookmarkId]);
}

/**
 * Attaches tags to many bookmarks in one pass: a single tag resolution for the
 * whole set, one multi-row link insert, one search-index rebuild. Returns how
 * many bookmarks got at least one tag.
 */
export async function attachTagsToBookmarks(
  entries: Array<{ bookmarkId: string; names: string[] }>,
): Promise<number> {
  const normalized = entries
    .map((entry) => ({
      bookmarkId: entry.bookmarkId,
      names: [...new Set(entry.names.map((name) => name.trim()).filter(Boolean))],
    }))
    .filter((entry) => entry.names.length > 0);
  if (!normalized.length) return 0;

  const idByName = await mapTagNamesToIds(normalized.flatMap((e) => e.names));

  const links: Array<{ bookmarkId: string; tagId: string }> = [];
  const touched: string[] = [];
  for (const entry of normalized) {
    const tagIds = entry.names
      .map((name) => idByName.get(name))
      .filter((id): id is string => Boolean(id));
    if (!tagIds.length) continue;
    touched.push(entry.bookmarkId);
    for (const tagId of tagIds) {
      links.push({ bookmarkId: entry.bookmarkId, tagId });
    }
  }
  if (!links.length) return 0;

  await db.insert(bookmarksTags).values(links).onConflictDoNothing();
  await rebuildSearchIndexesFor(touched);
  return touched.length;
}

/**
 * Replaces every tag of a bookmark with the given names. Delete and insert
 * share one transaction so the bookmark is never left without tags.
 */
export async function replaceBookmarkTags(
  bookmarkId: string,
  names: string[],
): Promise<void> {
  const tagIds = await resolveTagIds(names);
  await db.transaction(async (tx) => {
    await tx
      .delete(bookmarksTags)
      .where(eq(bookmarksTags.bookmarkId, bookmarkId));
    if (tagIds.length === 0) return;
    await tx
      .insert(bookmarksTags)
      .values(tagIds.map((tagId) => ({ bookmarkId, tagId })))
      .onConflictDoNothing();
  });
  await rebuildSearchIndexesFor([bookmarkId]);
}

/** Maps tag names to ids, creating missing tags. */
export async function resolveTagIds(names: string[]): Promise<string[]> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return [];

  return db.transaction(async (tx) => {
    const existing = await tx
      .select({ id: tags.id, name: tags.name })
      .from(tags)
      .where(inArray(tags.name, unique));
    const idByName = new Map(existing.map((r) => [r.name, r.id]));

    for (const name of unique) {
      if (idByName.has(name)) continue;
      const id = newId();
      const inserted = await tx
        .insert(tags)
        .values({ id, name, slug: slugifyUnique(name, id), createdAt: nowIso() })
        .onConflictDoNothing({ target: tags.slug })
        .returning({ id: tags.id });
      const row = inserted[0];
      if (row) {
        idByName.set(name, row.id);
        continue;
      }
      // Slug collision; retry once with an id-suffixed slug.
      const retry = await tx
        .insert(tags)
        .values({
          id,
          name,
          slug: `${slugifyUnique(name, id)}-${id.slice(-6)}`,
          createdAt: nowIso(),
        })
        .onConflictDoNothing({ target: tags.slug })
        .returning({ id: tags.id });
      const retryRow = retry[0];
      if (retryRow) idByName.set(name, retryRow.id);
    }

    return unique
      .map((name) => idByName.get(name))
      .filter((id): id is string => id !== undefined);
  });
}

/** Name → id map for a batch, creating missing tags. */
export async function mapTagNamesToIds(names: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(names.map((n) => n.trim()).filter(Boolean))];
  if (!unique.length) return new Map();

  await resolveTagIds(unique);

  const rows = await db
    .select({ id: tags.id, name: tags.name })
    .from(tags)
    .where(inArray(tags.name, unique));
  return new Map(rows.map((row) => [row.name, row.id]));
}

// ─── Admin tag list ──────────────────────────────────────────────────────────
// The tag manager never loads the whole table: it pages, searches and sorts in
// SQL so the payload and the DOM stay the same size at thousands of tags.

export type TagListRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  count: number;
};

export type TagListPage = {
  items: TagListRow[];
  /** Rows matching the filters, across every page. */
  total: number;
};

export type TagStats = {
  total: number;
  used: number;
  unused: number;
  /** Bookmark links over all tags. */
  refs: number;
};

const EMPTY_TAG_STATS: TagStats = { total: 0, used: 0, unused: 0, refs: 0 };

/** Correlated bookmark-link count, so a page needs no GROUP BY. */
const usageCount = sql<number>`(select count(*) from ${bookmarksTags} where ${bookmarksTags.tagId} = ${tags.id})::int`;

const tagListColumns = {
  id: tags.id,
  name: tags.name,
  slug: tags.slug,
  createdAt: tags.createdAt,
  count: usageCount,
};

/** Escapes LIKE metacharacters, so a typed `%` matches a literal percent sign. */
function likeTerm(term: string): string {
  return `%${term.replace(/[\\%_]/g, (char) => `\\${char}`)}%`;
}

/** One OR-group per term; every term must match the name or the slug. */
function searchConditions(query: string) {
  return tokenize(query).map((term) => {
    const pattern = likeTerm(term);
    return or(ilike(tags.name, pattern), ilike(tags.slug, pattern));
  });
}

function usageCondition(database: Database, used: boolean) {
  const linked = database
    .select({ tagId: bookmarksTags.tagId })
    .from(bookmarksTags)
    .where(eq(bookmarksTags.tagId, tags.id));
  return used ? exists(linked) : notExists(linked);
}

/**
 * Slug is the pinyin of the name, so name sorts run on it and every sort ends
 * with it: unique, and stable across pages.
 */
function sortOrder(sort: TagSort) {
  switch (sort) {
    case 'name-desc':
      return [desc(tags.slug)];
    case 'count':
      return [desc(usageCount), asc(tags.slug)];
    case 'count-asc':
      return [asc(usageCount), asc(tags.slug)];
    case 'newest':
      return [desc(tags.createdAt), asc(tags.slug)];
    case 'oldest':
      return [asc(tags.createdAt), asc(tags.slug)];
    default:
      return [asc(tags.slug)];
  }
}

function tagListConditions(
  database: Database,
  query: Pick<TagListQuery, 'query' | 'usage'>,
) {
  const conditions = searchConditions(query.query);
  if (query.usage !== 'all') {
    conditions.push(usageCondition(database, query.usage === 'used'));
  }
  return conditions;
}

/** One page of tags, plus how many rows the same filters match in total. */
export async function listTagPage(query: TagListQuery): Promise<TagListPage> {
  return safeQuery(
    'listTagPage',
    async (database) => {
      const conditions = tagListConditions(database, query);
      const where = conditions.length ? and(...conditions) : undefined;

      const [items, totals] = await Promise.all([
        database
          .select(tagListColumns)
          .from(tags)
          .where(where)
          .orderBy(...sortOrder(query.sort))
          .limit(query.limit)
          .offset((query.page - 1) * query.limit),
        database.select({ total: count() }).from(tags).where(where),
      ]);

      return { items, total: totals[0]?.total ?? 0 };
    },
    { items: [], total: 0 },
  );
}

/** Whole-table counters for the toolbar; three index scans, no tag rows read. */
export async function getTagStats(): Promise<TagStats> {
  return safeQuery(
    'getTagStats',
    async (database) => {
      const [totals, used, refs] = await Promise.all([
        database.select({ value: count() }).from(tags),
        database
          .select({
            value: sql<number>`count(distinct ${bookmarksTags.tagId})::int`,
          })
          .from(bookmarksTags),
        database.select({ value: count() }).from(bookmarksTags),
      ]);

      const total = totals[0]?.value ?? 0;
      const usedCount = used[0]?.value ?? 0;
      return {
        total,
        used: usedCount,
        unused: Math.max(0, total - usedCount),
        refs: refs[0]?.value ?? 0,
      };
    },
    EMPTY_TAG_STATS,
  );
}

/** Most-referenced tags, for rankings that only need the head of the list. */
export async function getTopTagUsage(limit: number): Promise<TagListRow[]> {
  return safeQuery(
    'getTopTagUsage',
    async (database) =>
      database
        .select(tagListColumns)
        .from(tags)
        .where(
          exists(
            database
              .select({ tagId: bookmarksTags.tagId })
              .from(bookmarksTags)
              .where(eq(bookmarksTags.tagId, tags.id)),
          ),
        )
        .orderBy(desc(usageCount), asc(tags.slug))
        .limit(limit),
    [],
  );
}

/** Merge targets that match a query, most-used first. */
export async function searchTagOptions(options: {
  query: string;
  excludeIds: string[];
  limit: number;
}): Promise<TagListRow[]> {
  return safeQuery(
    'searchTagOptions',
    async (database) => {
      const conditions = searchConditions(options.query);
      if (options.excludeIds.length) {
        conditions.push(notInArray(tags.id, options.excludeIds));
      }

      return database
        .select(tagListColumns)
        .from(tags)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(usageCount), asc(tags.slug))
        .limit(options.limit);
    },
    [],
  );
}

/** Bookmark ids linked to any of the given tags. */
async function linkedBookmarkIds(tagIds: string[]): Promise<string[]> {
  const rows = await db
    .select({ bookmarkId: bookmarksTags.bookmarkId })
    .from(bookmarksTags)
    .where(inArray(bookmarksTags.tagId, tagIds));
  return [...new Set(rows.map((row) => row.bookmarkId))];
}

/** Deletes several tags at once; returns how many existed. */
export async function deleteTags(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  const affected = await linkedBookmarkIds(ids);
  const removed = await db
    .delete(tags)
    .where(inArray(tags.id, ids))
    .returning({ id: tags.id });
  await rebuildSearchIndexesFor(affected);
  return removed.length;
}

/**
 * Merges source tags into the target: their bookmark links move over, the
 * sources are deleted, and every touched bookmark gets a fresh search index.
 * Links a bookmark already had on the target are left as they are.
 */
export async function mergeTags(
  targetId: string,
  sourceIds: string[],
): Promise<{ removed: number; moved: number }> {
  const sources = [...new Set(sourceIds)].filter((id) => id !== targetId);
  if (!sources.length) return { removed: 0, moved: 0 };

  // Bookmarks that lose a tag name, taken before the links disappear.
  const affected = await linkedBookmarkIds(sources);

  const result = await db.transaction(async (tx) => {
    const inserted = await tx
      .insert(bookmarksTags)
      .select(
        tx
          .select({
            bookmarkId: bookmarksTags.bookmarkId,
            tagId: sql<string>`${targetId}`.as('tagId'),
          })
          .from(bookmarksTags)
          .where(inArray(bookmarksTags.tagId, sources)),
      )
      .onConflictDoNothing()
      .returning({ bookmarkId: bookmarksTags.bookmarkId });

    await tx.delete(bookmarksTags).where(inArray(bookmarksTags.tagId, sources));
    const deleted = await tx
      .delete(tags)
      .where(inArray(tags.id, sources))
      .returning({ id: tags.id });

    return { removed: deleted.length, moved: inserted.length };
  });

  await rebuildSearchIndexesFor(affected);
  return result;
}
