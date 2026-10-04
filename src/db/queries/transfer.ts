import 'server-only';

import { asc, eq, sql } from 'drizzle-orm';

import { newId, nowIso } from '@/lib/ids';
import { buildSearchIndex } from '@/lib/search-index';
import { slugifyUnique } from '@/lib/utils';

import { db, safeQuery } from '../client';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/** Full JSON backup of categories, bookmarks, tags and links. */

export type ExportBookmark = {
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  sortOrder: number;
  createdAt: string;
  tags: string[];
};

export type ExportCategory = {
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  color: string | null;
  sortOrder: number;
  bookmarks: ExportBookmark[];
};

export type ExportPayload = {
  app: 'origaminav';
  version: 1;
  exportedAt: string;
  categories: ExportCategory[];
};

export async function exportAllData(): Promise<ExportPayload | null> {
  return safeQuery<ExportPayload | null>(
    'exportAllData',
    async (database) => {
      const [categoryRows, bookmarkRows, linkRows, tagRows] = await Promise.all([
        database.select().from(categories).orderBy(asc(categories.sortOrder)),
        database.select().from(bookmarks).orderBy(asc(bookmarks.sortOrder)),
        database.select().from(bookmarksTags),
        database.select().from(tags),
      ]);

      const tagNameById = new Map(tagRows.map((t) => [t.id, t.name]));
      const tagNamesByBookmark = new Map<string, string[]>();
      for (const link of linkRows) {
        const name = tagNameById.get(link.tagId);
        if (!name) continue;
        const list = tagNamesByBookmark.get(link.bookmarkId);
        if (list) list.push(name);
        else tagNamesByBookmark.set(link.bookmarkId, [name]);
      }

      const bookmarksByCategory = new Map<string, ExportBookmark[]>();
      for (const row of bookmarkRows) {
        const bookmark: ExportBookmark = {
          title: row.title,
          url: row.url,
          description: row.description,
          iconUrl: row.iconUrl,
          sortOrder: row.sortOrder,
          createdAt: row.createdAt,
          tags: tagNamesByBookmark.get(row.id) ?? [],
        };
        const list = bookmarksByCategory.get(row.categoryId);
        if (list) list.push(bookmark);
        else bookmarksByCategory.set(row.categoryId, [bookmark]);
      }

      return {
        app: 'origaminav',
        version: 1,
        exportedAt: nowIso(),
        categories: categoryRows.map((row) => ({
          name: row.name,
          slug: row.slug,
          description: row.description,
          icon: row.icon,
          color: row.color,
          sortOrder: row.sortOrder,
          bookmarks: bookmarksByCategory.get(row.id) ?? [],
        })),
      };
    },
    null,
  );
}

/** Wipes all content and rebuilds it from a payload in one transaction. */
export async function replaceAllData(
  payloadCategories: ExportCategory[],
): Promise<{ categories: number; bookmarks: number }> {
  return db.transaction(async (tx) => {
    // Delete order; FK cascades handle bookmarks and links.
    await tx.delete(bookmarksTags);
    await tx.delete(bookmarks);
    await tx.delete(categories);
    await tx.delete(tags);

    const stamp = nowIso();
    const tagIdByName = new Map<string, string>();

    // Slug-collision tolerant: colliding source rows do not abort the restore.
    async function tagId(name: string): Promise<string> {
      const existing = tagIdByName.get(name);
      if (existing) return existing;
      const id = newId();
      const inserted = await tx
        .insert(tags)
        .values({ id, name, slug: slugifyUnique(name, id), createdAt: stamp })
        .onConflictDoNothing({ target: tags.slug })
        .returning({ id: tags.id });
      if (inserted[0]) {
        tagIdByName.set(name, inserted[0].id);
        return inserted[0].id;
      }
      // Reuse the row that owns the slug.
      const winner = await tx
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.slug, slugifyUnique(name, id)))
        .limit(1);
      const winnerId = winner[0]?.id ?? id;
      tagIdByName.set(name, winnerId);
      return winnerId;
    }

    let bookmarkCount = 0;

    for (const [index, category] of payloadCategories.entries()) {
      const categoryId = newId();
      const baseSlug = category.slug || slugifyUnique(category.name, categoryId);
      const inserted = await tx
        .insert(categories)
        .values({
          id: categoryId,
          name: category.name,
          slug: baseSlug,
          description: category.description ?? '',
          icon: category.icon ?? null,
          color: category.color ?? null,
          sortOrder: category.sortOrder ?? index,
          createdAt: stamp,
          updatedAt: stamp,
        })
        .onConflictDoNothing({ target: categories.slug })
        .returning({ id: categories.id });
      let targetCategoryId = categoryId;
      if (!inserted[0]) {
        const winner = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(eq(categories.slug, baseSlug))
          .limit(1);
        targetCategoryId = winner[0]?.id ?? categoryId;
      }

      for (const bookmark of category.bookmarks ?? []) {
        const bookmarkId = newId();
        const tagNames = [...new Set((bookmark.tags ?? []).map((t) => t.trim()).filter(Boolean))];
        await tx.insert(bookmarks).values({
          id: bookmarkId,
          categoryId: targetCategoryId,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description ?? '',
          iconUrl: bookmark.iconUrl ?? null,
          sortOrder: bookmark.sortOrder ?? bookmarkCount,
          searchIndex: buildSearchIndex({
            title: bookmark.title,
            url: bookmark.url,
            description: bookmark.description,
            tagNames,
          }),
          createdAt: bookmark.createdAt || stamp,
          updatedAt: stamp,
        });
        bookmarkCount += 1;

        for (const name of tagNames) {
          await tx.insert(bookmarksTags).values({
            bookmarkId,
            tagId: await tagId(name),
          });
        }
      }
    }

    return { categories: payloadCategories.length, bookmarks: bookmarkCount };
  });
}

/** Total category and bookmark counts. */
export async function countContent(): Promise<{
  categories: number;
  bookmarks: number;
}> {
  return safeQuery(
    'countContent',
    async (database) => {
      const [c, b] = await Promise.all([
        database.select({ n: sql<number>`count(*)::int` }).from(categories),
        database.select({ n: sql<number>`count(*)::int` }).from(bookmarks),
      ]);
      return { categories: c[0]?.n ?? 0, bookmarks: b[0]?.n ?? 0 };
    },
    { categories: 0, bookmarks: 0 },
  );
}
