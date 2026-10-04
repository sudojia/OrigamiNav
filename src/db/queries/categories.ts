import 'server-only';

import { and, asc, eq, ne, sql } from 'drizzle-orm';

import { newId, newRow, nowIso } from '@/lib/ids';
import { slugifyUnique } from '@/lib/utils';

import { db, safeQuery } from '../client';
import { bookmarks, categories, type Category } from '../schema';

export type CategoryWithCount = Category & { bookmarkCount: number };

/** Categories in display order with their bookmark counts. */
export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  return safeQuery(
    'listCategoriesWithCounts',
    async (database) => {
      const [categoryRows, countRows] = await Promise.all([
        database
          .select()
          .from(categories)
          .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
        database
          .select({
            categoryId: bookmarks.categoryId,
            n: sql<number>`count(*)::int`,
          })
          .from(bookmarks)
          .groupBy(bookmarks.categoryId),
      ]);

      const counts = new Map(countRows.map((r) => [r.categoryId, r.n]));
      return categoryRows.map((row) => ({
        ...row,
        bookmarkCount: counts.get(row.id) ?? 0,
      }));
    },
    [],
  );
}

export async function getCategoryById(id: string): Promise<Category | null> {
  return safeQuery(
    'getCategoryById',
    async (database) => {
      const rows = await database
        .select()
        .from(categories)
        .where(eq(categories.id, id))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Deletes a category only if it holds no bookmarks (「存在书签不可删除」). */
export async function deleteCategoryIfEmpty(id: string): Promise<{
  deleted: boolean;
  bookmarkCount: number;
}> {
  return db.transaction(async (tx) => {
    const locked = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.id, id))
      .for('update')
      .limit(1);
    const counted = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(eq(bookmarks.categoryId, id));
    const bookmarkCount = counted[0]?.n ?? 0;
    if (!locked[0]) return { deleted: true, bookmarkCount };
    if (bookmarkCount > 0) return { deleted: false, bookmarkCount };
    await tx.delete(categories).where(eq(categories.id, id));
    return { deleted: true, bookmarkCount: 0 };
  });
}

/** Finds a category by exact name or creates it. */
export async function getOrCreateCategoryByName(
  name: string,
  extra?: { description?: string; icon?: string | null; color?: string | null },
): Promise<Category> {
  const existing = await db
    .select()
    .from(categories)
    .where(eq(categories.name, name))
    .limit(1);
  if (existing[0]) return existing[0];

  const base = slugifyUnique(name, newId());
  const slug = await ensureUniqueCategorySlug(base);
  return createCategory({
    name,
    slug,
    description: extra?.description ?? '',
    icon: extra?.icon ?? null,
    color: extra?.color ?? null,
  });
}

/** True when a category slug is already taken. */
export async function categorySlugTaken(
  slug: string,
  excludeId?: string,
): Promise<boolean> {
  return safeQuery(
    'categorySlugTaken',
    async (database) => {
      const condition = excludeId
        ? and(eq(categories.slug, slug), ne(categories.id, excludeId))
        : eq(categories.slug, slug);
      const rows = await database
        .select({ id: categories.id })
        .from(categories)
        .where(condition)
        .limit(1);
      return rows.length > 0;
    },
    false,
  );
}

/** Finds the first free `base`, `base-2`, `base-3`, … slug. */
export async function ensureUniqueCategorySlug(
  base: string,
  excludeId?: string,
): Promise<string> {
  if (!(await categorySlugTaken(base, excludeId))) return base;
  for (let n = 2; n < 100; n += 1) {
    const candidate = `${base}-${n}`;
    if (!(await categorySlugTaken(candidate, excludeId))) return candidate;
  }
  // Fall back to an id-suffixed slug.
  return `${base}-${newId().slice(-6)}`;
}

export async function createCategory(input: {
  name: string;
  slug: string;
  description: string;
  icon: string | null;
  color: string | null;
}): Promise<Category> {
  return db.transaction(async (tx) => {
    // New categories append to the end of the current order.
    const maxRows = await tx
      .select({ max: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int` })
      .from(categories);
    const rows = await tx
      .insert(categories)
      .values({
        ...newRow(),
        ...input,
        sortOrder: (maxRows[0]?.max ?? -1) + 1,
      })
      .returning();
    const created = rows[0];
    if (!created) throw new Error('Failed to create category');
    return created;
  });
}

export async function updateCategory(
  id: string,
  patch: {
    name: string;
    description: string;
    icon: string | null;
    color: string | null;
  },
): Promise<void> {
  // Slug is left unchanged on rename.
  await db
    .update(categories)
    .set({ ...patch, updatedAt: nowIso() })
    .where(eq(categories.id, id));
}

/** Cascades to bookmarks and, through them, to their tag links. */
export async function deleteCategory(id: string): Promise<void> {
  await db.delete(categories).where(eq(categories.id, id));
}

/** Persists a category drag order. */
export async function renumberCategories(orderedIds: string[]): Promise<void> {
  if (!orderedIds.length) return;
  await db.transaction(async (tx) => {
    const rows = await tx.select({ id: categories.id }).from(categories);
    const existing = new Set(rows.map((r) => r.id));
    if (
      existing.size !== orderedIds.length ||
      !orderedIds.every((id) => existing.has(id))
    ) {
      throw new Error('分类列表已变化，请刷新后重试');
    }
    for (const [index, id] of orderedIds.entries()) {
      await tx
        .update(categories)
        .set({ sortOrder: index, updatedAt: nowIso() })
        .where(eq(categories.id, id));
    }
  });
}
