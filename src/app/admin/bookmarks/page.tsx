import { BookmarkManager } from '@/components/admin/bookmark-manager';
import { getAdminBookmarkGroups } from '@/db/queries/bookmarks';
import { getSiteSettings } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '书签管理' };

export default async function AdminBookmarksPage() {
  await requireAdminPage();
  const [groups, settings] = await Promise.all([
    getAdminBookmarkGroups(),
    getSiteSettings(),
  ]);
  return <BookmarkManager groups={groups} aiEnabled={settings.aiEnabled} />;
}
