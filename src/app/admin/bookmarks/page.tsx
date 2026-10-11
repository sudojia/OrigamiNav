import { z } from 'zod';

import { BookmarkManager } from '@/components/admin/bookmark-manager';
import {
  getAdminBookmarkGroups,
  searchAdminBookmarks,
} from '@/db/queries/bookmarks';
import {
  listCategoriesWithCounts,
  listCategoryOptions,
} from '@/db/queries/categories';
import type { AdminBookmarkGroup } from '@/types/admin';
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

  const [groups, settings, categoryOptions] = await Promise.all([
    query ? null : getAdminBookmarkGroups(),
    getSiteSettings(),
    listCategoryOptions(),
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
    // Full rows only needed here: the groups carry the filter's icon/color.
    const categories = await listCategoriesWithCounts();
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
      categories={categoryOptions}
      query={query}
      truncated={truncated}
      aiEnabled={settings.aiEnabled}
    />
  );
}
