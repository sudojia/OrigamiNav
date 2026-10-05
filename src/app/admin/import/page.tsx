import { ImportManager } from '@/components/admin/import-manager';
import { listCategoriesWithCounts } from '@/db/queries/categories';
import { countContent } from '@/db/queries/transfer';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '导入 / 导出' };

export default async function AdminImportPage() {
  await requireAdminPage();
  const [categories, counts] = await Promise.all([
    listCategoriesWithCounts(),
    countContent(),
  ]);

  return (
    <ImportManager
      categories={categories.map((c) => ({ id: c.id, name: c.name }))}
      counts={counts}
    />
  );
}
