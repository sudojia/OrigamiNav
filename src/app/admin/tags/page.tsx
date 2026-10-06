import { TagManager } from '@/components/admin/tag-manager';
import { getTagStats, listTagPage } from '@/db/queries/tags';
import { requireAdminPage } from '@/lib/session';
import { parseTagListQuery } from '@/lib/tag-list';

export const metadata = { title: '标签管理' };

export default async function AdminTagsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdminPage();

  const query = parseTagListQuery(await searchParams);
  const [firstPage, stats] = await Promise.all([
    listTagPage(query),
    getTagStats(),
  ]);

  // Removing rows can leave the URL on a page that no longer exists.
  const pageCount = Math.max(1, Math.ceil(firstPage.total / query.limit));
  const clamped = Math.min(query.page, pageCount);
  const page =
    clamped === query.page ? firstPage : await listTagPage({ ...query, page: clamped });

  return (
    <TagManager
      items={page.items}
      total={page.total}
      stats={stats}
      query={{ ...query, page: clamped }}
    />
  );
}
