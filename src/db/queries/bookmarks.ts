import 'server-only';

import {
  and,
  asc,
  eq,
  inArray,
  isNull,
  notInArray,
  sql,
  type SQL,
} from 'drizzle-orm';

import { newId, newRow, nowIso } from '@/lib/ids';
import { buildSearchIndex } from '@/lib/search-index';
import { termConditions } from '@/lib/search-query';
import type { NavTag } from '@/types/nav';

import { db, safeQuery, type Database } from '../client';
import {
  bookmarks,
  bookmarksTags,
  categories,
  tags,
  type Bookmark,
  type Category,
} from '../schema';

export type AdminBookmark = {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  sortOrder: number;
  clickCount: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  tags: NavTag[];
};
export type AdminBookmarkGroup = { category: Category; bookmarks: AdminBookmark[] };

/**
 * Columns the admin manager renders. `search_index` is deliberately absent: it
 * is ~3x its source text and the admin search runs on the server instead.
 */
const adminBookmarkColumns = {
  id: bookmarks.id,
  categoryId: bookmarks.categoryId,
  title: bookmarks.title,
  url: bookmarks.url,
  description: bookmarks.description,
  iconUrl: bookmarks.iconUrl,
  sortOrder: bookmarks.sortOrder,
  clickCount: bookmarks.clickCount,
  hidden: bookmarks.hidden,
  createdAt: bookmarks.createdAt,
  updatedAt: bookmarks.updatedAt,
};

/** Live categories with their live bookmarks and tags, in four queries. */
export async function getAdminBookmarkGroups(): Promise<AdminBookmarkGroup[]> {
  return safeQuery('getAdminBookmarkGroups', assembleGroups, []);
}

async function assembleGroups(
  database: Database,
): Promise<AdminBookmarkGroup[]> {
  const [categoryRows, bookmarkRows, linkRows, tagRows] = await Promise.all([
    database
      .select()
      .from(categories)
      .where(isNull(categories.deletedAt))
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
    database
      .select(adminBookmarkColumns)
      .from(bookmarks)
      .where(isNull(bookmarks.deletedAt))
      .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.createdAt)),
    database.select().from(bookmarksTags),
    database.select().from(tags),
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

  const byCategory = new Map<string, AdminBookmark[]>();
  for (const row of bookmarkRows) {
    const admin: AdminBookmark = { ...row, tags: tagsByBookmark.get(row.id) ?? [] };
    const list = byCategory.get(row.categoryId);
    if (list) list.push(admin);
    else byCategory.set(row.categoryId, [admin]);
  }

  return categoryRows.map((category) => ({
    category,
    bookmarks: byCategory.get(category.id) ?? [],
  }));
}

/**
 * Admin bookmark search, running on the server so `search_index` never has to
 * be shipped. Returns the matched rows in display order; the caller groups them.
 */
export async function searchAdminBookmarks(
  query: string,
  limit: number,
): Promise<AdminBookmark[]> {
  const terms = termConditions(query, bookmarks.searchIndex);
  if (terms.length === 0) return [];

  return safeQuery(
    'searchAdminBookmarks',
    async (database) => {
      const rows = await database
        .select(adminBookmarkColumns)
        .from(bookmarks)
        .where(and(isNull(bookmarks.deletedAt), ...terms))
        // Same keyset order as the public search, so both agree on ordering.
        .orderBy(asc(bookmarks.sortOrder), asc(bookmarks.id))
        .limit(limit);

      const ids = rows.map((row) => row.id);
      const tagsByBookmark = new Map<string, NavTag[]>();
      if (ids.length > 0) {
        const links = await database
          .select({ bookmarkId: bookmarksTags.bookmarkId, id: tags.id, name: tags.name, slug: tags.slug })
          .from(bookmarksTags)
          .innerJoin(tags, eq(tags.id, bookmarksTags.tagId))
          .where(inArray(bookmarksTags.bookmarkId, ids))
          .orderBy(asc(tags.name));
        for (const link of links) {
          const tag: NavTag = { id: link.id, name: link.name, slug: link.slug };
          const list = tagsByBookmark.get(link.bookmarkId);
          if (list) list.push(tag);
          else tagsByBookmark.set(link.bookmarkId, [tag]);
        }
      }

      return rows.map((row) => ({
        ...row,
        tags: tagsByBookmark.get(row.id) ?? [],
      }));
    },
    [],
  );
}

/** Creates a bookmark and its tag links, appended to the category end.
 * The sort order is computed inside the INSERT, so the common no-tags path
 * is a single round-trip. */
export async function createBookmark(input: {
  categoryId: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hidden: boolean;
  tagIds: string[];
  tagNames: string[];
}): Promise<Bookmark> {
  const rows = await db
    .insert(bookmarks)
    .values({
      ...newRow(),
      categoryId: input.categoryId,
      title: input.title,
      url: input.url,
      description: input.description,
      iconUrl: input.iconUrl,
      sortOrder: sql`(select coalesce(max(${bookmarks.sortOrder}), -1) + 1 from ${bookmarks} where ${bookmarks.categoryId} = ${input.categoryId} and ${bookmarks.deletedAt} is null)`,
      hidden: input.hidden,
      searchIndex: buildSearchIndex({
        title: input.title,
        url: input.url,
        description: input.description,
        tagNames: input.tagNames,
      }),
    })
    .returning();
  const created = rows[0];
  if (!created) throw new Error('Failed to create bookmark');

  if (input.tagIds.length) {
    try {
      await db
        .insert(bookmarksTags)
        .values(
          input.tagIds.map((tagId) => ({ bookmarkId: created.id, tagId })),
        )
        .onConflictDoNothing();
    } catch (error) {
      // Compensate so a failed tag write never leaves a half-created row.
      await db.delete(bookmarks).where(eq(bookmarks.id, created.id));
      throw error;
    }
  }
  return created;
}

/** Updates a bookmark and its tags; a category change appends to the end. */
export async function updateBookmark(
  id: string,
  input: {
    categoryId: string;
    title: string;
    url: string;
    description: string;
    iconUrl: string | null;
    hidden: boolean;
    tagIds: string[];
    tagNames: string[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(bookmarks)
      .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
      .limit(1);
    const current = rows[0];
    if (!current) throw new Error('书签不存在或已被删除');

    let sortOrder = current.sortOrder;
    if (current.categoryId !== input.categoryId) {
      const maxRows = await tx
        .select({ max: sql<number>`coalesce(max(${bookmarks.sortOrder}), -1)::int` })
        .from(bookmarks)
        .where(
          and(
            eq(bookmarks.categoryId, input.categoryId),
            isNull(bookmarks.deletedAt),
          ),
        );
      sortOrder = (maxRows[0]?.max ?? -1) + 1;
    }

    await tx
      .update(bookmarks)
      .set({
        categoryId: input.categoryId,
        title: input.title,
        url: input.url,
        description: input.description,
        iconUrl: input.iconUrl,
        sortOrder,
        hidden: input.hidden,
        searchIndex: buildSearchIndex({
          title: input.title,
          url: input.url,
          description: input.description,
          tagNames: input.tagNames,
        }),
        updatedAt: nowIso(),
      })
      .where(eq(bookmarks.id, id));

    await tx.delete(bookmarksTags).where(eq(bookmarksTags.bookmarkId, id));
    if (input.tagIds.length) {
      await tx
        .insert(bookmarksTags)
        .values(input.tagIds.map((tagId) => ({ bookmarkId: id, tagId })))
        .onConflictDoNothing();
    }
  });
}

/**
 * Correlated stash of a bookmark's tag ids, written to `deleted_tag_ids` when a
 * row is soft-deleted so a restore re-attaches exactly the tags it had.
 * `rowId` is the outer row's id column as referenced in that statement, which
 * matters when the table is aliased.
 */
export function stashTagIdsSql(rowId: SQL): SQL {
  return sql`coalesce((
    select string_agg(bt.tag_id, ',')
    from ${bookmarksTags} as bt
    where bt.bookmark_id = ${rowId}
  ), '')`;
}

/**
 * Moves a bookmark to the recycle bin. Its tag links are detached and stashed
 * on the row, so a restore re-attaches exactly the tags it had.
 */
export async function deleteBookmark(id: string): Promise<void> {
  await deleteBookmarks([id]);
}

/**
 * Moves many bookmarks to the recycle bin in two statements: the tag ids are
 * stashed on each row, then the links are dropped. Returns how many moved, so a
 * selection that is already gone reports zero instead of failing.
 */
export async function deleteBookmarks(ids: string[]): Promise<number> {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const stamp = nowIso();
    const moved = await tx
      .update(bookmarks)
      .set({
        deletedAt: stamp,
        deletedTagIds: stashTagIdsSql(sql`${bookmarks.id}`),
        updatedAt: stamp,
      })
      .where(and(inArray(bookmarks.id, ids), isNull(bookmarks.deletedAt)))
      .returning({ id: bookmarks.id });
    if (!moved.length) return 0;

    await tx
      .delete(bookmarksTags)
      .where(
        inArray(
          bookmarksTags.bookmarkId,
          moved.map((row) => row.id),
        ),
      );
    return moved.length;
  });
}

/**
 * Moves many bookmarks into one category, appended after its existing rows in
 * the order given. Two statements: read the target's current end (ignoring the
 * rows being moved, so a same-category move is a no-op reorder), then one
 * `UPDATE ... FROM (VALUES ...)`.
 */
export async function setBookmarksCategory(
  ids: string[],
  categoryId: string,
): Promise<number> {
  if (!ids.length) return 0;
  return db.transaction(async (tx) => {
    const stamp = nowIso();
    const maxRows = await tx
      .select({ max: sql<number>`coalesce(max(${bookmarks.sortOrder}), -1)::int` })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.categoryId, categoryId),
          isNull(bookmarks.deletedAt),
          notInArray(bookmarks.id, ids),
        ),
      );
    const base = (maxRows[0]?.max ?? -1) + 1;

    const pairs = ids.map((id, index) => sql`(${id}::text, ${index}::integer)`);
    const result = await tx.execute(sql`
      UPDATE ${bookmarks} AS b
      SET category_id = ${categoryId},
          sort_order = ${base} + v.ord,
          updated_at = ${stamp}
      FROM (VALUES ${sql.join(pairs, sql`, `)}) AS v(id, ord)
      WHERE b.id = v.id AND b.deleted_at IS NULL
      RETURNING b.id
    `);
    return result.rows.length;
  });
}

/** Sets the private flag on many bookmarks. Returns how many changed. */
export async function setBookmarksHidden(
  ids: string[],
  hidden: boolean,
): Promise<number> {
  if (!ids.length) return 0;
  const changed = await db
    .update(bookmarks)
    .set({ hidden, updatedAt: nowIso() })
    .where(and(inArray(bookmarks.id, ids), isNull(bookmarks.deletedAt)))
    .returning({ id: bookmarks.id });
  return changed.length;
}

/** Adds one to a bookmark's click count. */
export async function incrementBookmarkClick(id: string): Promise<void> {
  await safeQuery(
    'incrementBookmarkClick',
    async (database) => {
      await database
        .update(bookmarks)
        .set({ clickCount: sql`${bookmarks.clickCount} + 1` })
        .where(eq(bookmarks.id, id));
    },
    undefined,
  );
}

/** Existing URLs from the given list, for import de-duplication. */
export async function getExistingBookmarkUrls(urls: string[]): Promise<Set<string>> {
  if (!urls.length) return new Set();
  return safeQuery(
    'getExistingBookmarkUrls',
    async (database) => {
      const rows = await database
        .select({ url: bookmarks.url })
        .from(bookmarks)
        .where(and(inArray(bookmarks.url, urls), isNull(bookmarks.deletedAt)));
      return new Set(rows.map((r) => r.url));
    },
    new Set<string>(),
  );
}

export type ExistingBookmark = {
  id: string;
  title: string;
  categoryId: string;
  categoryName: string;
};

/** Finds a live bookmark by exact URL; null when it does not exist. */
export async function getBookmarkByUrl(
  url: string,
): Promise<ExistingBookmark | null> {
  return safeQuery(
    'getBookmarkByUrl',
    async (database) => {
      const rows = await database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          categoryId: bookmarks.categoryId,
          categoryName: categories.name,
        })
        .from(bookmarks)
        .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
        .where(and(eq(bookmarks.url, url), isNull(bookmarks.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** One bookmark's fields, without the large search index. */
export type BookmarkCore = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hidden: boolean;
  categoryId: string;
};

/** Core fields of a live bookmark; null when it is missing or in the bin. */
export async function getBookmarkById(id: string): Promise<BookmarkCore | null> {
  return safeQuery(
    'getBookmarkById',
    async (database) => {
      const rows = await database
        .select({
          id: bookmarks.id,
          title: bookmarks.title,
          url: bookmarks.url,
          description: bookmarks.description,
          iconUrl: bookmarks.iconUrl,
          hidden: bookmarks.hidden,
          categoryId: bookmarks.categoryId,
        })
        .from(bookmarks)
        .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Manual icon URL of a live bookmark; null when unset, missing or in the bin. */
export async function getBookmarkIconUrl(id: string): Promise<string | null> {
  return safeQuery(
    'getBookmarkIconUrl',
    async (database) => {
      const rows = await database
        .select({ iconUrl: bookmarks.iconUrl })
        .from(bookmarks)
        .where(and(eq(bookmarks.id, id), isNull(bookmarks.deletedAt)))
        .limit(1);
      return rows[0]?.iconUrl ?? null;
    },
    null,
  );
}

/** Multi-row insert chunk size; keeps statements under pg's parameter cap. */
const INSERT_CHUNK = 500;
/** Rows per UPDATE ... FROM (VALUES ...) statement. */
const UPDATE_CHUNK = 2000;

export type BulkBookmarkInput = {
  categoryId: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  tagIds: string[];
  tagNames: string[];
  /** Preserve the original timestamp on imports; defaults to now. */
  createdAt?: string | null;
};

/** Inserts many bookmarks in one transaction, preserving input order. */
export async function createBookmarksBulk(
  inputs: BulkBookmarkInput[],
): Promise<number> {
  if (!inputs.length) return 0;
  return db.transaction(async (tx) => {
    // One grouped query for all starting offsets.
    const maxRows = await tx
      .select({
        categoryId: bookmarks.categoryId,
        max: sql<number>`coalesce(max(${bookmarks.sortOrder}), -1)::int`,
      })
      .from(bookmarks)
      .where(isNull(bookmarks.deletedAt))
      .groupBy(bookmarks.categoryId);
    const nextOrder = new Map(maxRows.map((r) => [r.categoryId, r.max + 1]));

    const rows: Array<typeof bookmarks.$inferInsert> = [];
    const links: Array<{ bookmarkId: string; tagId: string }> = [];
    const defaultStamp = nowIso();

    for (const input of inputs) {
      const order = nextOrder.get(input.categoryId) ?? 0;
      nextOrder.set(input.categoryId, order + 1);
      const id = newId();
      rows.push({
        id,
        categoryId: input.categoryId,
        title: input.title,
        url: input.url,
        description: input.description,
        iconUrl: input.iconUrl,
        sortOrder: order,
        searchIndex: buildSearchIndex({
          title: input.title,
          url: input.url,
          description: input.description,
          tagNames: input.tagNames,
        }),
        createdAt: input.createdAt || defaultStamp,
        updatedAt: defaultStamp,
      });
      for (const tagId of input.tagIds) {
        links.push({ bookmarkId: id, tagId });
      }
    }

    // Chunked multi-row inserts instead of one roundtrip per row.
    for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
      await tx.insert(bookmarks).values(rows.slice(start, start + INSERT_CHUNK));
    }
    for (let start = 0; start < links.length; start += INSERT_CHUNK) {
      await tx
        .insert(bookmarksTags)
        .values(links.slice(start, start + INSERT_CHUNK))
        .onConflictDoNothing();
    }
    return rows.length;
  });
}

/** Persists a drag order within one category. */
export async function renumberBookmarksInCategory(
  categoryId: string,
  orderedIds: string[],
): Promise<void> {
  if (!orderedIds.length) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: bookmarks.id })
      .from(bookmarks)
      .where(
        and(
          eq(bookmarks.categoryId, categoryId),
          isNull(bookmarks.deletedAt),
        ),
      );
    const existing = new Set(rows.map((r) => r.id));
    if (
      existing.size !== orderedIds.length ||
      !orderedIds.every((id) => existing.has(id))
    ) {
      throw new Error('书签列表已变化，请刷新后重试');
    }
    const stamp = nowIso();
    // One statement for the whole order instead of one UPDATE per row.
    const pairs = orderedIds.map(
      (id, index) => sql`(${id}::text, ${index}::integer)`,
    );
    await tx.execute(sql`
      UPDATE ${bookmarks} AS b
      SET sort_order = v.ord, updated_at = ${stamp}
      FROM (VALUES ${sql.join(pairs, sql`, `)}) AS v(id, ord)
      WHERE b.id = v.id
    `);
  });
}

/** Recomputes search indexes for the given bookmarks from current fields. */
export async function rebuildSearchIndexesFor(
  bookmarkIds: string[],
): Promise<void> {
  if (!bookmarkIds.length) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        id: bookmarks.id,
        title: bookmarks.title,
        url: bookmarks.url,
        description: bookmarks.description,
      })
      .from(bookmarks)
      .where(inArray(bookmarks.id, bookmarkIds));
    if (!rows.length) return;

    const linkRows = await tx
      .select({ bookmarkId: bookmarksTags.bookmarkId, tagName: tags.name })
      .from(bookmarksTags)
      .innerJoin(tags, eq(tags.id, bookmarksTags.tagId))
      .where(inArray(bookmarksTags.bookmarkId, bookmarkIds));

    const namesBy = new Map<string, string[]>();
    for (const link of linkRows) {
      const list = namesBy.get(link.bookmarkId);
      if (list) list.push(link.tagName);
      else namesBy.set(link.bookmarkId, [link.tagName]);
    }

    const pairs = rows.map(
      (row) =>
        sql`(${row.id}::text, ${buildSearchIndex({
          title: row.title,
          url: row.url,
          description: row.description,
          tagNames: namesBy.get(row.id) ?? [],
        })}::text)`,
    );
    for (let start = 0; start < pairs.length; start += UPDATE_CHUNK) {
      await tx.execute(sql`
        UPDATE ${bookmarks} AS b
        SET search_index = v.idx
        FROM (VALUES ${sql.join(
          pairs.slice(start, start + UPDATE_CHUNK),
          sql`, `,
        )}) AS v(id, idx)
        WHERE b.id = v.id
      `);
    }
  });
}
