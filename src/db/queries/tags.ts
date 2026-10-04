import 'server-only';

import { eq, inArray } from 'drizzle-orm';

import { newId, nowIso } from '@/lib/ids';
import { slugifyUnique } from '@/lib/utils';

import { db, safeQuery } from '../client';
import { bookmarksTags, tags, type Tag } from '../schema';
import { rebuildSearchIndexesFor } from './bookmarks';

export async function tagNameTaken(name: string): Promise<boolean> {
  return safeQuery(
    'tagNameTaken',
    async (database) => {
      const rows = await database
        .select({ id: tags.id })
        .from(tags)
        .where(eq(tags.name, name))
        .limit(1);
      return rows.length > 0;
    },
    false,
  );
}

export async function createTag(name: string): Promise<Tag> {
  const id = newId();
  const rows = await db
    .insert(tags)
    .values({
      id,
      name,
      // CJK names keep their characters; the id suffix avoids collisions.
      slug: slugifyUnique(name, id),
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
    .set({ name, slug: slugifyUnique(name, id) })
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
