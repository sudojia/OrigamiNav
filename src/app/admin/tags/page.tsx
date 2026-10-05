import { TagManager } from '@/components/admin/tag-manager';
import { getTagUsage } from '@/db/queries/nav';
import { requireAdminPage } from '@/lib/session';

export const metadata = { title: '标签管理' };

export default async function AdminTagsPage() {
  await requireAdminPage();
  const tags = await getTagUsage();
  return <TagManager tags={tags} />;
}
