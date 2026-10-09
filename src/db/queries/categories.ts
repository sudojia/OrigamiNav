import 'server-only';

import { and, asc, eq, inArray, isNull, ne, sql } from 'drizzle-orm';
import { cache } from 'react';

import { newId, newRow, nowIso } from '@/lib/ids';
import { slugifyUnique } from '@/lib/pinyin';

import { db, safeQuery } from '../client';
import { bookmarks, bookmarksTags, categories, type Category } from '../schema';
import { stashTagIdsSql } from './bookmarks';

export type CategoryWithCount = Category & { bookmarkCount: number };

/** Live categories in display order with their live bookmark counts. */
export async function listCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  return safeQuery(
    'listCategoriesWithCounts',
    async (database) => {
      const [categoryRows, countRows] = await Promise.all([
        database
          .select()
          .from(categories)
          .where(isNull(categories.deletedAt))
          .orderBy(asc(categories.sortOrder), asc(categories.createdAt)),
        database
          .select({
            categoryId: bookmarks.categoryId,
            n: sql<number>`count(*)::int`,
          })
          .from(bookmarks)
          .where(isNull(bookmarks.deletedAt))
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

/** Id and name of every live category, in display order. */
export async function listCategoryOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  return safeQuery(
    'listCategoryOptions',
    (database) =>
      database
        .select({ id: categories.id, name: categories.name })
        .from(categories)
        .where(isNull(categories.deletedAt))
        .orderBy(asc(categories.sortOrder), asc(categories.id)),
    [],
  );
}

/** A category plus how many of its bookmarks are visible to the public. */
export type CategoryWithPublicCount = Category & { visibleBookmarks: number };

export type CategoryDescriptionTarget = {
  id: string;
  name: string;
  description: string;
  /** Sampled bookmark titles, in display order; the AI's raw material. */
  titles: string[];
};

/**
 * Live categories with at most `titlesPerCategory` bookmark titles each. One
 * window-function pass, so the sample stays cheap however large the catalogue
 * grows; a category with no bookmarks comes back with an empty list.
 */
export async function listCategoryDescriptionTargets(
  titlesPerCategory: number,
): Promise<CategoryDescriptionTarget[]> {
  return safeQuery(
    'listCategoryDescriptionTargets',
    async (database) => {
      const result = await database.execute(sql`
        SELECT c.id, c.name, c.description, ranked.title
        FROM ${categories} c
        LEFT JOIN (
          SELECT category_id, title
          FROM (
            SELECT category_id, title,
                   row_number() OVER (
                     PARTITION BY category_id ORDER BY sort_order, id
                   ) AS rn
            FROM ${bookmarks}
            WHERE deleted_at IS NULL
          ) numbered
          WHERE rn <= ${titlesPerCategory}
        ) ranked ON ranked.category_id = c.id
        WHERE c.deleted_at IS NULL
        ORDER BY c.sort_order, c.id
      `);

      const grouped = new Map<string, CategoryDescriptionTarget>();
      for (const row of result.rows as Array<{
        id: string;
        name: string;
        description: string;
        title: string | null;
      }>) {
        const entry = grouped.get(row.id) ?? {
          id: row.id,
          name: row.name,
          description: row.description,
          titles: [],
        };
        if (row.title) entry.titles.push(row.title);
        grouped.set(row.id, entry);
      }
      return [...grouped.values()];
    },
    [],
  );
}

/**
 * Finds a category by its URL slug; memoized per request so a category page and
 * its metadata share one query.
 */
export const getCategoryBySlug = cache(
  async function getCategoryBySlug(
    slug: string,
  ): Promise<CategoryWithPublicCount | null> {
    return safeQuery(
      'getCategoryBySlug',
      async (database) => {
        const rows = await database
          .select({
            category: categories,
            // A left join keeps a category with no bookmarks in the result.
            visibleBookmarks:
              sql<number>`count(*) filter (where ${bookmarks.hidden} = false)::int`,
          })
          .from(categories)
          .leftJoin(
            bookmarks,
            and(
              eq(bookmarks.categoryId, categories.id),
              isNull(bookmarks.deletedAt),
            ),
          )
          .where(and(eq(categories.slug, slug), isNull(categories.deletedAt)))
          .groupBy(categories.id)
          .limit(1);
        const row = rows[0];
        return row ? { ...row.category, visibleBookmarks: row.visibleBookmarks } : null;
      },
      null,
    );
  },
);

/**
 * Slugs of categories that actually have public content, for the sitemap, the
 * prerender list and search-engine pushes; a category whose bookmarks are all
 * hidden has nothing to index.
 */
export async function listVisibleCategorySlugs(): Promise<
  Array<{ slug: string; updatedAt: string }>
> {
  return safeQuery(
    'listVisibleCategorySlugs',
    (database) =>
      database
        .select({ slug: categories.slug, updatedAt: categories.updatedAt })
        .from(categories)
        .innerJoin(bookmarks, eq(bookmarks.categoryId, categories.id))
        .where(
          and(
            eq(categories.hidden, false),
            eq(bookmarks.hidden, false),
            isNull(categories.deletedAt),
            isNull(bookmarks.deletedAt),
          ),
        )
        .groupBy(categories.id, categories.slug, categories.updatedAt, categories.sortOrder)
        .orderBy(asc(categories.sortOrder)),
    [],
  );
}

/** A live category by id; null when it is missing or in the recycle bin. */
export async function getCategoryById(id: string): Promise<Category | null> {
  return safeQuery(
    'getCategoryById',
    async (database) => {
      const rows = await database
        .select()
        .from(categories)
        .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Finds a live category by exact name; null when it does not exist yet. */
export async function getCategoryByName(
  name: string,
): Promise<Category | null> {
  return safeQuery(
    'getCategoryByName',
    async (database) => {
      const rows = await database
        .select()
        .from(categories)
        .where(and(eq(categories.name, name), isNull(categories.deletedAt)))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

/** Live categories for the given ids; missing ids are simply absent. */
export async function getCategoriesByIds(ids: string[]): Promise<Category[]> {
  if (!ids.length) return [];
  return db
    .select()
    .from(categories)
    .where(and(inArray(categories.id, ids), isNull(categories.deletedAt)));
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
    .where(and(inArray(categories.name, names), isNull(categories.deletedAt)));
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
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .for('update')
      .limit(1);
    const counted = await tx
      .select({ n: sql<number>`count(*)::int` })
      .from(bookmarks)
      .where(and(eq(bookmarks.categoryId, id), isNull(bookmarks.deletedAt)));
    const bookmarkCount = counted[0]?.n ?? 0;
    if (!locked[0]) return { deleted: true, bookmarkCount };
    if (bookmarkCount > 0) return { deleted: false, bookmarkCount };
    const stamp = nowIso();
    await tx
      .update(categories)
      .set({ deletedAt: stamp, updatedAt: stamp })
      .where(eq(categories.id, id));
    return { deleted: true, bookmarkCount: 0 };
  });
}

/** Finds a live category by exact name or creates it. */
export async function getOrCreateCategoryByName(
  name: string,
  extra?: { description?: string; icon?: string | null; color?: string | null },
): Promise<Category> {
  const existing = await db
    .select()
    .from(categories)
    .where(and(eq(categories.name, name), isNull(categories.deletedAt)))
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

/**
 * True when a category slug is already taken. Trashed categories still hold
 * their slug, so they count here: handing it to a new category would collide
 * with the one waiting in the recycle bin.
 */
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
    // New categories append to the end of the current order. Trashed rows are
    // counted too, so a restored category never lands on a taken position.
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

/**
 * Sets only the description, in one statement for the whole batch; the AI fill
 * must not touch any other field. Returns how many rows changed.
 */
export async function updateCategoryDescriptions(
  entries: Array<{ id: string; description: string }>,
): Promise<number> {
  if (entries.length === 0) return 0;

  const stamp = nowIso();
  const pairs = entries.map(
    (entry) => sql`(${entry.id}::text, ${entry.description}::text)`,
  );
  const result = await db.execute(sql`
    UPDATE ${categories} AS c
    SET description = v.description,
        updated_at = ${stamp}
    FROM (VALUES ${sql.join(pairs, sql`, `)}) AS v(id, description)
    WHERE c.id = v.id AND c.deleted_at IS NULL
  `);
  return result.rowCount ?? 0;
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

/**
 * Moves a category to the recycle bin. Its live bookmarks are stamped with the
 * same instant so restoring the category brings that batch back, and their tag
 * links are detached and stashed on each row.
 */
export async function deleteCategory(id: string): Promise<void> {
  await db.transaction(async (tx) => {
    const stamp = nowIso();
    const stamped = await tx
      .update(categories)
      .set({ deletedAt: stamp, updatedAt: stamp })
      .where(and(eq(categories.id, id), isNull(categories.deletedAt)))
      .returning({ id: categories.id });
    if (!stamped.length) return;

    await tx.execute(sql`
      UPDATE ${bookmarks} AS b
      SET deleted_at = ${stamp},
          updated_at = ${stamp},
          deleted_tag_ids = ${stashTagIdsSql(sql`b.id`)}
      WHERE b.category_id = ${id} AND b.deleted_at IS NULL
    `);

    // Links only exist for live rows, so this clears exactly the batch above.
    await tx.delete(bookmarksTags).where(
      inArray(
        bookmarksTags.bookmarkId,
        tx
          .select({ id: bookmarks.id })
          .from(bookmarks)
          .where(eq(bookmarks.categoryId, id)),
      ),
    );
  });
}

/** Persists a category drag order. */
export async function renumberCategories(orderedIds: string[]): Promise<void> {
  if (!orderedIds.length) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ id: categories.id })
      .from(categories)
      .where(isNull(categories.deletedAt));
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
