import 'server-only';

import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  sql,
} from 'drizzle-orm';

import { nowIso } from '@/lib/ids';
import { MS_PER_DAY } from '@/lib/utils';

import { db, safeQuery, type Transaction } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';
import { rebuildSearchIndexesFor } from './bookmarks';

/**
 * The recycle bin: soft-deleted categories and bookmarks, their restore paths
 * and the retention purge. A live bookmark always belongs to a live category,
 * so a category that goes down takes its bookmarks with it under one stamp.
 */

/** Multi-row insert chunk size; keeps statements under pg's parameter cap. */
const INSERT_CHUNK = 500;

/** Trashed bookmarks carry their detached tag ids comma-joined. */
function splitTagIds(value: string): string[] {
  return value ? value.split(',').filter(Boolean) : [];
}

/** A trashed bookmark listed under the category that went down with it. */
export type TrashCategoryBookmark = {
  id: string;
  title: string;
  url: string;
  deletedAt: string;
  /** Trashed before its category, so restoring the category leaves it behind. */
  earlierThanCategory: boolean;
};

export type TrashCategory = {
  id: string;
  name: string;
  color: string | null;
  deletedAt: string;
  bookmarks: TrashCategoryBookmark[];
};

/** A trashed bookmark whose category is still live; restorable on its own. */
export type TrashLooseBookmark = {
  id: string;
  title: string;
  url: string;
  deletedAt: string;
  categoryName: string;
};

export type TrashContents = {
  categories: TrashCategory[];
  bookmarks: TrashLooseBookmark[];
};

/** Everything waiting in the recycle bin, newest first. */
export async function getTrashContents(): Promise<TrashContents> {
  return safeQuery(
    'getTrashContents',
    async (database) => {
      const [categoryRows, looseRows, nestedRows] = await Promise.all([
        database
          .select({
            id: categories.id,
            name: categories.name,
            color: categories.color,
            // Guaranteed by the WHERE clause; the cast keeps it non-null.
            deletedAt: sql<string>`${categories.deletedAt}`,
          })
          .from(categories)
          .where(isNotNull(categories.deletedAt))
          .orderBy(desc(categories.deletedAt), asc(categories.id)),
        database
          .select({
            id: bookmarks.id,
            title: bookmarks.title,
            url: bookmarks.url,
            deletedAt: sql<string>`${bookmarks.deletedAt}`,
            categoryName: categories.name,
          })
          .from(bookmarks)
          .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
          .where(and(isNotNull(bookmarks.deletedAt), isNull(categories.deletedAt)))
          .orderBy(desc(bookmarks.deletedAt), asc(bookmarks.id)),
        database
          .select({
            id: bookmarks.id,
            title: bookmarks.title,
            url: bookmarks.url,
            categoryId: bookmarks.categoryId,
            deletedAt: sql<string>`${bookmarks.deletedAt}`,
            earlierThanCategory: sql<boolean>`${bookmarks.deletedAt} < ${categories.deletedAt}`,
          })
          .from(bookmarks)
          .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
          .where(
            and(isNotNull(bookmarks.deletedAt), isNotNull(categories.deletedAt)),
          )
          .orderBy(desc(bookmarks.deletedAt), asc(bookmarks.id)),
      ]);

      const byCategory = new Map<string, TrashCategoryBookmark[]>();
      for (const row of nestedRows) {
        const list = byCategory.get(row.categoryId);
        const entry: TrashCategoryBookmark = {
          id: row.id,
          title: row.title,
          url: row.url,
          deletedAt: row.deletedAt,
          earlierThanCategory: row.earlierThanCategory,
        };
        if (list) list.push(entry);
        else byCategory.set(row.categoryId, [entry]);
      }

      return {
        categories: categoryRows.map((row) => ({
          ...row,
          bookmarks: byCategory.get(row.id) ?? [],
        })),
        bookmarks: looseRows,
      };
    },
    { categories: [], bookmarks: [] },
  );
}

/** Re-attaches stashed tags, skipping any tag that was purged meanwhile. */
async function relinkTags(
  tx: Transaction,
  entries: Array<{ id: string; tagIds: string[] }>,
): Promise<void> {
  const wanted = [...new Set(entries.flatMap((entry) => entry.tagIds))];
  if (!wanted.length) return;

  const alive = await tx
    .select({ id: tags.id })
    .from(tags)
    .where(inArray(tags.id, wanted));
  const aliveIds = new Set(alive.map((row) => row.id));

  const rows = entries.flatMap((entry) =>
    entry.tagIds
      .filter((tagId) => aliveIds.has(tagId))
      .map((tagId) => ({ bookmarkId: entry.id, tagId })),
  );
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    await tx
      .insert(bookmarksTags)
      .values(rows.slice(start, start + INSERT_CHUNK))
      .onConflictDoNothing();
  }
}

/** Restores a trashed bookmark; rejects one whose category is still trashed. */
export async function restoreBookmark(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({
        deletedTagIds: bookmarks.deletedTagIds,
        categoryDeletedAt: categories.deletedAt,
      })
      .from(bookmarks)
      .innerJoin(categories, eq(categories.id, bookmarks.categoryId))
      .where(and(eq(bookmarks.id, id), isNotNull(bookmarks.deletedAt)))
      .limit(1);
    const row = rows[0];
    if (!row) throw new Error('书签不在回收站中');
    if (row.categoryDeletedAt) {
      throw new Error('所属分类也在回收站中，请先恢复该分类');
    }

    await tx
      .update(bookmarks)
      .set({ deletedAt: null, deletedTagIds: '', updatedAt: nowIso() })
      .where(eq(bookmarks.id, id));
    await relinkTags(tx, [{ id, tagIds: splitTagIds(row.deletedTagIds) }]);
  });

  // Tags may have been renamed while the bookmark sat in the bin.
  await rebuildSearchIndexesFor([id]);
}

/** Restores a category and the bookmarks it took down with it. */
export async function restoreCategory(id: string): Promise<number> {
  const restored = await db.transaction(async (tx) => {
    const rows = await tx
      .select({ deletedAt: categories.deletedAt })
      .from(categories)
      .where(eq(categories.id, id))
      .limit(1);
    const stamp = rows[0]?.deletedAt;
    if (!stamp) throw new Error('分类不在回收站中');

    const batch = await tx
      .select({ id: bookmarks.id, deletedTagIds: bookmarks.deletedTagIds })
      .from(bookmarks)
      .where(and(eq(bookmarks.categoryId, id), eq(bookmarks.deletedAt, stamp)));

    const now = nowIso();
    await tx
      .update(categories)
      .set({ deletedAt: null, updatedAt: now })
      .where(eq(categories.id, id));

    if (batch.length) {
      await tx
        .update(bookmarks)
        .set({ deletedAt: null, deletedTagIds: '', updatedAt: now })
        .where(
          inArray(
            bookmarks.id,
            batch.map((row) => row.id),
          ),
        );
      await relinkTags(
        tx,
        batch.map((row) => ({
          id: row.id,
          tagIds: splitTagIds(row.deletedTagIds),
        })),
      );
    }

    return batch.map((row) => row.id);
  });

  await rebuildSearchIndexesFor(restored);
  return restored.length;
}

/** Permanently deletes one trashed bookmark. */
export async function purgeBookmark(id: string): Promise<void> {
  await db
    .delete(bookmarks)
    .where(and(eq(bookmarks.id, id), isNotNull(bookmarks.deletedAt)));
}

/** Permanently deletes a trashed category and whatever it took with it. */
export async function purgeCategory(id: string): Promise<void> {
  await db
    .delete(categories)
    .where(and(eq(categories.id, id), isNotNull(categories.deletedAt)));
}

/** Permanently deletes trashed rows older than the retention window. */
export async function purgeExpiredTrash(days: number): Promise<number> {
  // Zero means keep them until the admin purges by hand.
  if (days <= 0) return 0;
  const cutoff = new Date(Date.now() - days * MS_PER_DAY).toISOString();
  return purgeTrashBefore(cutoff);
}

/** Empties the recycle bin. */
export async function purgeAllTrash(): Promise<number> {
  return purgeTrashBefore(null);
}

async function purgeTrashBefore(cutoff: string | null): Promise<number> {
  return db.transaction(async (tx) => {
    const bookmarkRows = await tx
      .delete(bookmarks)
      .where(
        and(
          isNotNull(bookmarks.deletedAt),
          cutoff ? lt(bookmarks.deletedAt, cutoff) : undefined,
        ),
      )
      .returning({ id: bookmarks.id });
    // Cascades to the bookmarks of each removed category.
    const categoryRows = await tx
      .delete(categories)
      .where(
        and(
          isNotNull(categories.deletedAt),
          cutoff ? lt(categories.deletedAt, cutoff) : undefined,
        ),
      )
      .returning({ id: categories.id });
    return bookmarkRows.length + categoryRows.length;
  });
}
