import { z } from 'zod';

import { BookmarkManager } from '@/components/admin/bookmark-manager';
import {
  getAdminBookmarkGroups,
  searchAdminBookmarks,
  type AdminBookmarkGroup,
} from '@/db/queries/bookmarks';
import { listCategoriesWithCounts } from '@/db/queries/categories';
import { getSiteSettings } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '书签管理' };

/**
 * Rows a search may return. The filter itself runs in SQL; this only bounds a
 * broad query like "com" against a large collection.
 */
const SEARCH_LIMIT = 2000;

const searchParamsSchema = z.object({
  q: z.string().trim().max(200).default(''),
});

export default async function AdminBookmarksPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();

  const parsed = searchParamsSchema.safeParse(await searchParams);
  const query = parsed.success ? parsed.data.q : '';

  const [groups, settings, categories] = await Promise.all([
    query ? null : getAdminBookmarkGroups(),
    getSiteSettings(),
    listCategoriesWithCounts(),
  ]);

  // The search returns flat rows; group them under their category in display
  // order, dropping categories with no match.
  let visibleGroups: AdminBookmarkGroup[] = groups ?? [];
  let truncated = false;
  if (query) {
    const matched = await searchAdminBookmarks(query, SEARCH_LIMIT);
    truncated = matched.length >= SEARCH_LIMIT;
    const byCategory = new Map<string, typeof matched>();
    for (const bookmark of matched) {
      const list = byCategory.get(bookmark.categoryId);
      if (list) list.push(bookmark);
      else byCategory.set(bookmark.categoryId, [bookmark]);
    }
    visibleGroups = categories
      .filter((category) => byCategory.has(category.id))
      .map((category) => ({
        category,
        bookmarks: byCategory.get(category.id) ?? [],
      }));
  }

  return (
    <BookmarkManager
      groups={visibleGroups}
      categories={categories.map((category) => ({
        id: category.id,
        name: category.name,
      }))}
      query={query}
      truncated={truncated}
      aiEnabled={settings.aiEnabled}
    />
  );
}
