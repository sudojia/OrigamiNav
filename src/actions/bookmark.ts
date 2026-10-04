'use server';

import { z } from 'zod';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import {
  createBookmark,
  deleteBookmark,
  renumberBookmarksInCategory,
  updateBookmark,
} from '@/db/queries/bookmarks';
import { getCategoryById } from '@/db/queries/categories';
import { resolveTagIds } from '@/db/queries/tags';
import { revalidateSite } from '@/lib/revalidate';
import { httpUrlSchema, LIMITS, optionalHttpUrlSchema } from '@/lib/validation';

import type { ActionState } from './auth';

/** Splits tag input on commas (`,` `，` `、`). */
function parseTagNames(raw: string): string[] {
  return [
    ...new Set(
      raw
        .split(/[,，、]/)
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ].slice(0, LIMITS.tagsPerBookmark);
}

const bookmarkSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, '请输入标题')
    .max(LIMITS.title, `标题最多 ${LIMITS.title} 个字`),
  url: z
    .string()
    .trim()
    .min(1, '请输入 URL')
    .max(LIMITS.url, `URL 最长 ${LIMITS.url} 个字符`)
    .pipe(httpUrlSchema('请输入 http(s):// 开头的完整链接')),
  categoryId: z.string().min(1, '请选择分类'),
  description: z
    .string()
    .trim()
    .max(LIMITS.description, `描述最多 ${LIMITS.description} 个字`),
  iconUrl: optionalHttpUrlSchema(LIMITS.url, '图标地址'),
  tagsInput: z.string().max(500, '标签过多'),
});

async function resolveTags(raw: string): Promise<
  { ok: true; ids: string[]; names: string[] } | { ok: false; message: string }
> {
  const names = parseTagNames(raw);
  if (names.some((name) => name.length > LIMITS.tagName)) {
    return { ok: false, message: `单个标签最多 ${LIMITS.tagName} 个字` };
  }
  try {
    const ids = await resolveTagIds(names);
    return { ok: true, ids, names };
  } catch (error) {
    return { ok: false, message: `标签处理失败：${errorMessage(error)}` };
  }
}

export async function createBookmarkAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = bookmarkSchema.safeParse({
    title: formData.get('title'),
    url: formData.get('url'),
    categoryId: formData.get('categoryId'),
    description: formData.get('description') ?? '',
    iconUrl: formData.get('iconUrl') ?? '',
    tagsInput: formData.get('tagsInput') ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  const category = await getCategoryById(parsed.data.categoryId);
  if (!category) {
    return { ok: false, field: 'categoryId', message: '分类不存在，请重新选择' };
  }

  const tags = await resolveTags(parsed.data.tagsInput);
  if (!tags.ok) return { ok: false, field: 'tagsInput', message: tags.message };

  try {
    await createBookmark({
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      url: parsed.data.url,
      description: parsed.data.description,
      iconUrl: parsed.data.iconUrl === '' ? null : parsed.data.iconUrl,
      tagIds: tags.ids,
      tagNames: tags.names,
    });
  } catch (error) {
    return { ok: false, message: `创建失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '书签已创建' };
}

export async function updateBookmarkAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) {
    return { ok: false, message: '缺少书签 ID' };
  }

  const parsed = bookmarkSchema.safeParse({
    title: formData.get('title'),
    url: formData.get('url'),
    categoryId: formData.get('categoryId'),
    description: formData.get('description') ?? '',
    iconUrl: formData.get('iconUrl') ?? '',
    tagsInput: formData.get('tagsInput') ?? '',
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  const category = await getCategoryById(parsed.data.categoryId);
  if (!category) {
    return { ok: false, field: 'categoryId', message: '分类不存在，请重新选择' };
  }

  const tags = await resolveTags(parsed.data.tagsInput);
  if (!tags.ok) return { ok: false, field: 'tagsInput', message: tags.message };

  try {
    await updateBookmark(id, {
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      url: parsed.data.url,
      description: parsed.data.description,
      iconUrl: parsed.data.iconUrl === '' ? null : parsed.data.iconUrl,
      tagIds: tags.ids,
      tagNames: tags.names,
    });
  } catch (error) {
    return { ok: false, message: `保存失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '书签已保存' };
}

export async function deleteBookmarkAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  try {
    await deleteBookmark(id);
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '书签已删除' };
}

export async function reorderBookmarksAction(
  categoryId: string,
  orderedIds: string[],
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  if (
    typeof categoryId !== 'string' ||
    !categoryId ||
    !Array.isArray(orderedIds) ||
    orderedIds.some((id) => typeof id !== 'string')
  ) {
    return { ok: false, message: '排序数据无效' };
  }

  try {
    await renumberBookmarksInCategory(categoryId, orderedIds);
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  revalidateSite();
  return { ok: true, message: '排序已保存' };
}
