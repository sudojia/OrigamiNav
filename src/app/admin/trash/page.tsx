import { TrashManager } from '@/components/admin/trash-manager';
import { getSiteSettings } from '@/db/queries/settings';
import { getTrashContents, purgeExpiredTrash } from '@/db/queries/trash';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '回收站' };

export default async function AdminTrashPage() {
  await requireAdminPage();
  const settings = await getSiteSettings();

  // There is no scheduler to run against, so the retention window is applied
  // whenever the bin is opened. A failed purge must not take the page down.
  await purgeExpiredTrash(settings.trashRetentionDays).catch(() => undefined);

  const contents = await getTrashContents();

  return (
    <TrashManager
      categories={contents.categories}
      bookmarks={contents.bookmarks}
      retentionDays={settings.trashRetentionDays}
    />
  );
}
