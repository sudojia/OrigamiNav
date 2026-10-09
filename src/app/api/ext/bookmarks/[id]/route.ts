import { z } from 'zod';

import { errorMessage } from '@/db/client';
import {
  deleteBookmark,
  getBookmarkById,
  updateBookmark,
} from '@/db/queries/bookmarks';
import { getCategoryById } from '@/db/queries/categories';
import { resolveTagIds } from '@/db/queries/tags';
import { extJson, extPreflight, verifyExtToken } from '@/lib/ext-api';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS, tagNameSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

/** Edits and deletes one bookmark from the browser extension. */

const bodySchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '请输入标题')
    .max(LIMITS.title, `标题最多 ${LIMITS.title} 个字`),
  categoryId: z.string().min(1, '请选择分类'),
  tags: z
    .array(tagNameSchema(`单个标签最多 ${LIMITS.tagName} 个字`))
    .max(LIMITS.tagsPerBookmark, `最多 ${LIMITS.tagsPerBookmark} 个标签`),
});

export async function OPTIONS() {
  return extPreflight();
}

/**
 * Replaces the editable fields — title, category and tags — of one bookmark.
 * The URL, description, icon and visibility stay as they are.
 */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyExtToken(request))) {
    return extJson({ ok: false, message: '扩展令牌无效或未配置' }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return extJson(
      { ok: false, message: parsed.error.issues[0]?.message ?? '输入有误' },
      { status: 400 },
    );
  }

  // Trashed rows must stay link-free, so they are not editable here.
  const existing = await getBookmarkById(id);
  if (!existing) {
    return extJson(
      { ok: false, message: '书签不存在或已在回收站中' },
      { status: 404 },
    );
  }
  // Moving into a trashed category would leave a live bookmark out of sight.
  const category = await getCategoryById(parsed.data.categoryId);
  if (!category) {
    return extJson(
      { ok: false, message: '分类不存在或已在回收站中，请重新选择' },
      { status: 400 },
    );
  }

  const tagNames = [...new Set(parsed.data.tags)];
  try {
    const tagIds = await resolveTagIds(tagNames);
    await updateBookmark(id, {
      categoryId: category.id,
      title: parsed.data.title,
      url: existing.url,
      description: existing.description,
      iconUrl: existing.iconUrl,
      hidden: existing.hidden,
      tagIds,
      tagNames,
    });
  } catch (error) {
    return extJson(
      { ok: false, message: `保存失败：${errorMessage(error)}` },
      { status: 500 },
    );
  }

  revalidateSite();
  return extJson({ ok: true, message: '书签已更新' });
}

/** Moves the bookmark to the recycle bin; the admin can restore it. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  if (!(await verifyExtToken(request))) {
    return extJson({ ok: false, message: '扩展令牌无效或未配置' }, { status: 401 });
  }

  const { id } = await params;
  const existing = await getBookmarkById(id);
  if (!existing) {
    return extJson(
      { ok: false, message: '书签不存在或已在回收站中' },
      { status: 404 },
    );
  }

  try {
    await deleteBookmark(id);
  } catch (error) {
    return extJson(
      { ok: false, message: `删除失败：${errorMessage(error)}` },
      { status: 500 },
    );
  }

  revalidateSite();
  return extJson({ ok: true, message: '书签已移入回收站' });
}
