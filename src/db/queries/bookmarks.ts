import 'server-only';

import { asc, eq, inArray, sql } from 'drizzle-orm';

import { newId, newRow, nowIso } from '@/lib/ids';
import { buildSearchIndex } from '@/lib/search-index';
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

export type AdminBookmark = Bookmark & { tags: NavTag[] };
export type AdminBookmarkGroup = { category: Category; bookmarks: AdminBookmark[] };

/** All categories with their bookmarks and tags, in three queries. */
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
      .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
    database
      .select()
      .from(bookmarks)
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

/** Creates a bookmark and its tag links, appended to the category end. */
export async function createBookmark(input: {
  categoryId: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  tagIds: string[];
  tagNames: string[];
}): Promise<Bookmark> {
  return db.transaction(async (tx) => {
    const maxRows = await tx
      .select({ max: sql<number>`coalesce(max(${bookmarks.sortOrder}), -1)::int` })
      .from(bookmarks)
      .where(eq(bookmarks.categoryId, input.categoryId));
    const rows = await tx
      .insert(bookmarks)
      .values({
        ...newRow(),
        categoryId: input.categoryId,
        title: input.title,
        url: input.url,
        description: input.description,
        iconUrl: input.iconUrl,
        sortOrder: (maxRows[0]?.max ?? -1) + 1,
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
      await tx
        .insert(bookmarksTags)
        .values(
          input.tagIds.map((tagId) => ({ bookmarkId: created.id, tagId })),
        )
        .onConflictDoNothing();
    }
    return created;
  });
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
    tagIds: string[];
    tagNames: string[];
  },
): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select()
      .from(bookmarks)
      .where(eq(bookmarks.id, id))
      .limit(1);
    const current = rows[0];
    if (!current) throw new Error('书签不存在或已被删除');

    let sortOrder = current.sortOrder;
    if (current.categoryId !== input.categoryId) {
      const maxRows = await tx
        .select({ max: sql<number>`coalesce(max(${bookmarks.sortOrder}), -1)::int` })
        .from(bookmarks)
        .where(eq(bookmarks.categoryId, input.categoryId));
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

export async function deleteBookmark(id: string): Promise<void> {
  // Tag links cascade via the FK.
  await db.delete(bookmarks).where(eq(bookmarks.id, id));
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
        .where(inArray(bookmarks.url, urls));
      return new Set(rows.map((r) => r.url));
    },
    new Set<string>(),
  );
}

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
      .groupBy(bookmarks.categoryId);
    const nextOrder = new Map(maxRows.map((r) => [r.categoryId, r.max + 1]));

    const createdIds: string[] = [];
    const links: Array<{ bookmarkId: string; tagId: string }> = [];
    const defaultStamp = nowIso();

    for (const input of inputs) {
      const order = nextOrder.get(input.categoryId) ?? 0;
      nextOrder.set(input.categoryId, order + 1);
      const id = newId();
      const createdAt = input.createdAt || defaultStamp;
      await tx.insert(bookmarks).values({
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
        createdAt,
        updatedAt: defaultStamp,
      });
      createdIds.push(id);
      for (const tagId of input.tagIds) {
        links.push({ bookmarkId: id, tagId });
      }
    }

    if (links.length) {
      await tx.insert(bookmarksTags).values(links).onConflictDoNothing();
    }
    return createdIds.length;
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
      .where(eq(bookmarks.categoryId, categoryId));
    const existing = new Set(rows.map((r) => r.id));
    if (
      existing.size !== orderedIds.length ||
      !orderedIds.every((id) => existing.has(id))
    ) {
      throw new Error('书签列表已变化，请刷新后重试');
    }
    const stamp = nowIso();
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(bookmarks)
        .set({ sortOrder: index, updatedAt: stamp })
        .where(eq(bookmarks.id, id));
    }
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

    for (const row of rows) {
      await tx
        .update(bookmarks)
        .set({
          searchIndex: buildSearchIndex({
            title: row.title,
            url: row.url,
            description: row.description,
            tagNames: namesBy.get(row.id) ?? [],
          }),
        })
        .where(eq(bookmarks.id, row.id));
    }
  });
}
