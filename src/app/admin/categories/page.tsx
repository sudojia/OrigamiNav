import { CategoryManager } from '@/components/admin/category-manager';
import { listCategoriesWithCounts } from '@/db/queries/categories';
import { getSiteSettings } from '@/db/queries/settings';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '分类管理' };

export default async function AdminCategoriesPage() {
  await requireAdminPage();
  const [categories, settings] = await Promise.all([
    listCategoriesWithCounts(),
    getSiteSettings(),
  ]);
  return (
    <CategoryManager
      categories={categories}
      deleteMode={settings.categoryDeleteMode}
      aiEnabled={settings.aiEnabled}
    />
  );
}
