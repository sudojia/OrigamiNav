import { z } from 'zod';

import { getBookmarkByUrl } from '@/db/queries/bookmarks';
import { listCategoryOptions } from '@/db/queries/categories';
import { getSiteSettings } from '@/db/queries/settings';
import { extJson, extPreflight, verifyExtToken } from '@/lib/ext-api';

export const dynamic = 'force-dynamic';

/** Bootstraps the popup: site name, categories, duplicate check. */

const querySchema = z.object({ url: z.string().min(1).max(2048) });

export async function OPTIONS() {
  return extPreflight();
}

export async function GET(request: Request) {
  if (!(await verifyExtToken(request))) {
    return extJson({ ok: false, message: '扩展令牌无效或未配置' }, { status: 401 });
  }

  const url = new URL(request.url).searchParams.get('url') ?? '';
  const parsed = querySchema.safeParse({ url });
  if (!parsed.success) {
    return extJson({ ok: false, message: '缺少有效的 url 参数' }, { status: 400 });
  }

  const [settings, categories, existing] = await Promise.all([
    getSiteSettings(),
    listCategoryOptions(),
    getBookmarkByUrl(parsed.data.url),
  ]);

  return extJson({
    ok: true,
    siteName: settings.siteName,
    categories,
    existing: existing
      ? {
          id: existing.id,
          title: existing.title,
          categoryId: existing.categoryId,
          categoryName: existing.categoryName,
        }
      : null,
  });
}
