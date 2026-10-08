import { ImportManager } from '@/components/admin/import-manager';
import { listCategoriesWithCounts } from '@/db/queries/categories';
import { getLastBackupAt } from '@/db/queries/settings';
import { countContent } from '@/db/queries/transfer';
import { backupStatus } from '@/lib/backup-status';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '导入 / 导出' };

export default async function AdminImportPage() {
  await requireAdminPage();
  const [categories, counts, lastBackupAt] = await Promise.all([
    listCategoriesWithCounts(),
    countContent(),
    getLastBackupAt(),
  ]);

  return (
    <ImportManager
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      counts={counts}
      backupStatus={backupStatus(lastBackupAt)}
    />
  );
}
