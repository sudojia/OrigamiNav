'use server';

import { z } from 'zod';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import {
  createBookmark,
  deleteBookmark,
  deleteBookmarks,
  renumberBookmarksInCategory,
  setBookmarksCategory,
  setBookmarksHidden,
  updateBookmark,
} from '@/db/queries/bookmarks';
import { getCategoryById } from '@/db/queries/categories';
import {
  attachTagsToBookmarks,
  resolveTagIds,
} from '@/db/queries/tags';
import { revalidateSite } from '@/lib/revalidate';
import { queueAiTagGeneration } from '@/lib/ai-tags';
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
  // Set by the form when the URL was auto-scraped and AI tagging is enabled.
  aiTags: z.string().default('0').transform((value) => value === '1'),
  // The form submits an explicit '0'/'1' hidden input.
  hidden: z.string().default('0').transform((value) => value === '1'),
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
    aiTags: formData.get('aiTags') ?? '0',
    hidden: formData.get('hidden') ?? '0',
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
    const created = await createBookmark({
      categoryId: parsed.data.categoryId,
      title: parsed.data.title,
      url: parsed.data.url,
      description: parsed.data.description,
      iconUrl: parsed.data.iconUrl === '' ? null : parsed.data.iconUrl,
      hidden: parsed.data.hidden,
      tagIds: tags.ids,
      tagNames: tags.names,
    });
    // AI tags are generated after the response, only when the admin left tags empty.
    if (parsed.data.aiTags && tags.ids.length === 0) {
      queueAiTagGeneration(created.id, {
        url: parsed.data.url,
        title: parsed.data.title,
        description: parsed.data.description,
      });
    }
  } catch (error) {
    return { ok: false, message: `创建失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return {
    ok: true,
    message:
      parsed.data.aiTags && tags.ids.length === 0
        ? '书签已创建，AI 标签生成中'
        : '书签已创建',
  };
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
    aiTags: formData.get('aiTags') ?? '0',
    hidden: formData.get('hidden') ?? '0',
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
      hidden: parsed.data.hidden,
      tagIds: tags.ids,
      tagNames: tags.names,
    });
    if (parsed.data.aiTags && tags.ids.length === 0) {
      queueAiTagGeneration(id, {
        url: parsed.data.url,
        title: parsed.data.title,
        description: parsed.data.description,
      });
    }
  } catch (error) {
    return { ok: false, message: `保存失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return {
    ok: true,
    message:
      parsed.data.aiTags && tags.ids.length === 0
        ? '书签已保存，AI 标签生成中'
        : '书签已保存',
  };
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
  return { ok: true, message: '书签已移入回收站' };
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

// ── Batch operations ─────────────────────────────────────────────────────────

/** Upper bound on one batch; keeps the statements under pg's parameter cap. */
const BULK_LIMIT = 1000;

const bulkIds = z
  .array(z.string().min(1).max(64))
  .min(1, '请先选择书签')
  .max(BULK_LIMIT, `一次最多操作 ${BULK_LIMIT} 条书签`);

/**
 * One entry point for the manager's batch operations. A discriminated payload
 * keeps the guard, validation and revalidation in one place, and each operation
 * carries only what it needs.
 */
const bulkSchema = z.discriminatedUnion('op', [
  z.object({
    op: z.literal('category'),
    ids: bulkIds,
    categoryId: z.string().min(1),
  }),
  z.object({
    op: z.literal('tags'),
    ids: bulkIds,
    tagsInput: z.string().max(500, '标签过多'),
  }),
  z.object({
    op: z.literal('hidden'),
    ids: bulkIds,
    hidden: z.boolean(),
  }),
  z.object({
    op: z.literal('delete'),
    ids: bulkIds,
  }),
]);

export type BulkBookmarkInput = z.input<typeof bulkSchema>;

export async function bulkUpdateBookmarksAction(
  input: BulkBookmarkInput,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = bulkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? '输入有误' };
  }
  const data = parsed.data;

  try {
    if (data.op === 'category') {
      const category = await getCategoryById(data.categoryId);
      if (!category) {
        return { ok: false, message: '目标分类不存在，请刷新后重试' };
      }
      const moved = await setBookmarksCategory(data.ids, data.categoryId);
      revalidateSite();
      return { ok: true, message: `已把 ${moved} 条书签移到「${category.name}」` };
    }

    if (data.op === 'tags') {
      const names = parseTagNames(data.tagsInput);
      if (names.length === 0) {
        return { ok: false, message: '请输入至少一个标签' };
      }
      if (names.some((name) => name.length > LIMITS.tagName)) {
        return { ok: false, message: `单个标签最多 ${LIMITS.tagName} 个字` };
      }
      // One resolution, one link insert, one search-index rebuild for the batch.
      const tagged = await attachTagsToBookmarks(
        data.ids.map((id) => ({ bookmarkId: id, names })),
      );
      revalidateSite();
      return {
        ok: true,
        message: `已为 ${tagged} 条书签添加标签：${names.join('、')}`,
      };
    }

    if (data.op === 'hidden') {
      const changed = await setBookmarksHidden(data.ids, data.hidden);
      revalidateSite();
      return {
        ok: true,
        message: data.hidden
          ? `已把 ${changed} 条书签设为私有`
          : `已把 ${changed} 条书签设为公开`,
      };
    }

    const moved = await deleteBookmarks(data.ids);
    revalidateSite();
    return { ok: true, message: `已把 ${moved} 条书签移入回收站` };
  } catch (error) {
    return { ok: false, message: `批量操作失败：${errorMessage(error)}` };
  }
}
