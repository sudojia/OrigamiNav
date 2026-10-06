import 'server-only';

import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';

import { newId, newRow, nowIso } from '@/lib/ids';
import { slugifyUnique } from '@/lib/pinyin';

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

/** Finds a category by exact name; null when it does not exist yet. */
export async function getCategoryByName(
  name: string,
): Promise<Category | null> {
  return safeQuery(
    'getCategoryByName',
    async (database) => {
      const rows = await database
        .select()
        .from(categories)
        .where(eq(categories.name, name))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Categories for the given ids; missing ids are simply absent. */
export async function getCategoriesByIds(ids: string[]): Promise<Category[]> {
  if (!ids.length) return [];
  return db.select().from(categories).where(inArray(categories.id, ids));
}

/** Multi-row insert chunk size; keeps statements under pg's parameter cap. */
const INSERT_CHUNK = 500;

/**
 * Resolves many category names in one batched pass: a single SELECT for the
 * names that already exist, then one multi-row INSERT for the missing ones.
 * Names that lose a slug collision (in-batch or against an existing row)
 * fall back to the per-name unique-slug path. Returns a row for every
 * requested name; the first request's extras win on duplicate names.
 */
export async function resolveOrCreateCategories(
  requests: Array<{
    name: string;
    description?: string;
    icon?: string | null;
    color?: string | null;
  }>,
): Promise<Map<string, Category>> {
  const byName = new Map<string, (typeof requests)[number]>();
  for (const request of requests) {
    if (request.name && !byName.has(request.name)) {
      byName.set(request.name, request);
    }
  }
  const names = [...byName.keys()];
  const result = new Map<string, Category>();
  if (!names.length) return result;

  const existing = await db
    .select()
    .from(categories)
    .where(inArray(categories.name, names));
  for (const row of existing) result.set(row.name, row);

  const missing = names.filter((name) => !result.has(name));
  if (!missing.length) return result;

  const maxRows = await db
    .select({
      max: sql<number>`coalesce(max(${categories.sortOrder}), -1)::int`,
    })
    .from(categories);
  let order = (maxRows[0]?.max ?? -1) + 1;

  // In-memory slug dedupe: the first name per slug claims it.
  const nameBySlug = new Map<string, string>();
  const rows: Array<typeof categories.$inferInsert> = [];
  for (const name of missing) {
    const slug = slugifyUnique(name, newId());
    if (nameBySlug.has(slug)) continue;
    nameBySlug.set(slug, name);
    const request = byName.get(name)!;
    rows.push({
      ...newRow(),
      name,
      slug,
      description: request.description ?? '',
      icon: request.icon ?? null,
      color: request.color ?? null,
      hidden: false,
      sortOrder: order,
    });
    order += 1;
  }

  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    await db
      .insert(categories)
      .values(rows.slice(start, start + INSERT_CHUNK))
      .onConflictDoNothing({ target: categories.slug });
  }
  // Reads back the inserted rows; a slug that lost to an existing category
  // with a different name stays unresolved and falls through to the per-name
  // unique-slug path.
  for (let start = 0; start < rows.length; start += INSERT_CHUNK) {
    const slugs = rows
      .slice(start, start + INSERT_CHUNK)
      .map((row) => row.slug);
    const inserted = await db
      .select()
      .from(categories)
      .where(inArray(categories.slug, slugs));
    for (const row of inserted) {
      const name = nameBySlug.get(row.slug);
      if (name && row.name === name && !result.has(name)) {
        result.set(name, row);
      }
    }
  }

  // Rare fallback: slug collisions resolve through the per-name path.
  for (const name of missing) {
    if (result.has(name)) continue;
    const request = byName.get(name)!;
    result.set(
      name,
      await getOrCreateCategoryByName(name, {
        description: request.description,
        icon: request.icon ?? null,
        color: request.color ?? null,
      }),
    );
  }

  return result;
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
    hidden: false,
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
  hidden: boolean;
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
    hidden: boolean;
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
