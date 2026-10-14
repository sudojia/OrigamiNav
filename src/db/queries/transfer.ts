import 'server-only';

import { asc, isNull, sql } from 'drizzle-orm';

import { newId, nowIso } from '@/lib/ids';
import { buildSearchIndex } from '@/lib/search-index';
import { slugifyUnique } from '@/lib/pinyin';

import { db, safeQuery } from '../client';
import { chunked } from '../chunk';
import { bookmarks, bookmarksTags, categories, tags } from '../schema';

/**
 * JSON backup of the catalogue: categories, bookmarks, tags and their links,
 * live rows only. Site settings, uploaded imagery, the recycle bin and admin
 * accounts are outside it, so a restore rebuilds content but not the site's
 * own configuration.
 */

 type ExportBookmark = {
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  sortOrder: number;
  hidden?: boolean;
  /** Carried so a migration keeps the click ranking. */
  clickCount?: number;
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
  hidden?: boolean;
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
        database
          .select({
            id: categories.id,
            name: categories.name,
            slug: categories.slug,
            description: categories.description,
            icon: categories.icon,
            color: categories.color,
            sortOrder: categories.sortOrder,
            hidden: categories.hidden,
          })
          .from(categories)
          .where(isNull(categories.deletedAt))
          .orderBy(asc(categories.sortOrder)),
        // Column-limited: search_index and deleted_tag_ids never reach a backup.
        database
          .select({
            id: bookmarks.id,
            categoryId: bookmarks.categoryId,
            title: bookmarks.title,
            url: bookmarks.url,
            description: bookmarks.description,
            iconUrl: bookmarks.iconUrl,
            sortOrder: bookmarks.sortOrder,
            hidden: bookmarks.hidden,
            clickCount: bookmarks.clickCount,
            createdAt: bookmarks.createdAt,
          })
          .from(bookmarks)
          .where(isNull(bookmarks.deletedAt))
          .orderBy(asc(bookmarks.sortOrder)),
        database.select().from(bookmarksTags),
        database.select({ id: tags.id, name: tags.name }).from(tags),
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
          hidden: row.hidden,
          clickCount: row.clickCount,
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
          hidden: row.hidden,
          bookmarks: bookmarksByCategory.get(row.id) ?? [],
        })),
      };
    },
    null,
  );
}

/**
 * Wipes all content and rebuilds it from a payload in one transaction. The
 * recycle bin is wiped too: its rows live in the same tables.
 */
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

    // ── Tags: resolve every name up front; names sharing a slug share a row. ──
    // All rows were just deleted, so the only slug conflicts are intra-payload.
    const tagNamesInPayload = new Set<string>();
    for (const category of payloadCategories) {
      for (const bookmark of category.bookmarks ?? []) {
        for (const tag of bookmark.tags ?? []) {
          const name = tag.trim();
          if (name) tagNamesInPayload.add(name);
        }
      }
    }
    const tagIdByName = new Map<string, string>();
    const tagIdBySlug = new Map<string, string>();
    const tagRows: Array<typeof tags.$inferInsert> = [];
    for (const name of tagNamesInPayload) {
      const id = newId();
      const slug = slugifyUnique(name, id);
      const existingId = tagIdBySlug.get(slug);
      if (existingId) {
        tagIdByName.set(name, existingId);
        continue;
      }
      tagIdBySlug.set(slug, id);
      tagIdByName.set(name, id);
      tagRows.push({ id, name, slug, createdAt: stamp });
    }

    // ── Categories: first category per slug wins; the rest attach to it. ─────
    const categoryIdBySlug = new Map<string, string>();
    const resolvedCategoryIds: string[] = [];
    const categoryRows: Array<typeof categories.$inferInsert> = [];
    for (const [index, category] of payloadCategories.entries()) {
      const categoryId = newId();
      const baseSlug = category.slug || slugifyUnique(category.name, categoryId);
      const winnerId = categoryIdBySlug.get(baseSlug);
      if (winnerId) {
        resolvedCategoryIds[index] = winnerId;
        continue;
      }
      categoryIdBySlug.set(baseSlug, categoryId);
      resolvedCategoryIds[index] = categoryId;
      categoryRows.push({
        id: categoryId,
        name: category.name,
        slug: baseSlug,
        description: category.description ?? '',
        icon: category.icon ?? null,
        color: category.color ?? null,
        sortOrder: category.sortOrder ?? index,
        hidden: category.hidden ?? false,
        createdAt: stamp,
        updatedAt: stamp,
      });
    }

    // ── Bookmarks and tag links, batched. ─────────────────────────────────────
    const bookmarkRows: Array<typeof bookmarks.$inferInsert> = [];
    const linkRows: Array<{ bookmarkId: string; tagId: string }> = [];
    let bookmarkCount = 0;
    for (const [index, category] of payloadCategories.entries()) {
      const categoryId = resolvedCategoryIds[index]!;
      for (const bookmark of category.bookmarks ?? []) {
        const bookmarkId = newId();
        const tagNames = [
          ...new Set((bookmark.tags ?? []).map((t) => t.trim()).filter(Boolean)),
        ];
        bookmarkRows.push({
          id: bookmarkId,
          categoryId,
          title: bookmark.title,
          url: bookmark.url,
          description: bookmark.description ?? '',
          iconUrl: bookmark.iconUrl ?? null,
          sortOrder: bookmark.sortOrder ?? bookmarkCount,
          hidden: bookmark.hidden ?? false,
          clickCount: bookmark.clickCount ?? 0,
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
          const tagId = tagIdByName.get(name);
          if (tagId) linkRows.push({ bookmarkId, tagId });
        }
      }
    }

    // Chunked multi-row inserts instead of one roundtrip per row.
    await chunked(tagRows, (chunk) => tx.insert(tags).values(chunk));
    await chunked(categoryRows, (chunk) =>
      tx.insert(categories).values(chunk),
    );
    await chunked(bookmarkRows, (chunk) =>
      tx.insert(bookmarks).values(chunk),
    );
    await chunked(linkRows, (chunk) =>
      tx.insert(bookmarksTags).values(chunk).onConflictDoNothing(),
    );

    return { categories: payloadCategories.length, bookmarks: bookmarkCount };
  });
}

/** Total live category and bookmark counts. */
export async function countContent(): Promise<{
  categories: number;
  bookmarks: number;
}> {
  return safeQuery(
    'countContent',
    async (database) => {
      const [c, b] = await Promise.all([
        database
          .select({ n: sql<number>`count(*)::int` })
          .from(categories)
          .where(isNull(categories.deletedAt)),
        database
          .select({ n: sql<number>`count(*)::int` })
          .from(bookmarks)
          .where(isNull(bookmarks.deletedAt)),
      ]);
      return { categories: c[0]?.n ?? 0, bookmarks: b[0]?.n ?? 0 };
    },
    { categories: 0, bookmarks: 0 },
  );
}
