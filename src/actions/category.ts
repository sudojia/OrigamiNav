'use server';

import { z } from 'zod';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import {
  createCategory,
  deleteCategory,
  deleteCategoryIfEmpty,
  ensureUniqueCategorySlug,
  renumberCategories,
  updateCategory,
} from '@/db/queries/categories';
import { CATEGORY_COLOR_OPTIONS } from '@/lib/category-color';
import { CATEGORY_ICON_OPTIONS } from '@/lib/category-meta';
import { newId } from '@/lib/ids';
import { getSiteSettings } from '@/db/queries/settings';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS } from '@/lib/validation';
import { slugifyUnique } from '@/lib/pinyin';

import type { ActionState } from './auth';

const ICON_NAMES = CATEGORY_ICON_OPTIONS.map((option) => option.name);

const iconSchema = z
  .string()
  .trim()
  .max(40)
  .refine((value) => value === '' || ICON_NAMES.includes(value), '未知的图标名称')
  .transform((value) => (value === '' ? null : value));

const colorSchema = z
  .string()
  .trim()
  .max(20)
  .refine(
    (value) => value === '' || (CATEGORY_COLOR_OPTIONS as readonly string[]).includes(value),
    '未知的颜色',
  )
  .transform((value) => (value === '' ? null : value));

const categorySchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, '请输入分类名称')
    .max(LIMITS.categoryName, `名称最多 ${LIMITS.categoryName} 个字`),
  description: z
    .string()
    .trim()
    .max(
      LIMITS.categoryDescription,
      `描述最多 ${LIMITS.categoryDescription} 个字`,
    ),
  icon: iconSchema,
  color: colorSchema,
  // The form submits an explicit '0'/'1' hidden input.
  hidden: z.string().default('0').transform((value) => value === '1'),
});

function parseCategory(formData: FormData): ActionState | { data: z.output<typeof categorySchema> } {
  const parsed = categorySchema.safeParse({
    name: formData.get('name'),
    description: formData.get('description') ?? '',
    icon: formData.get('icon') ?? '',
    color: formData.get('color') ?? '',
    hidden: formData.get('hidden') ?? '0',
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }
  return { data: parsed.data };
}

export async function createCategoryAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = parseCategory(formData);
  if ('ok' in parsed) return parsed;

  try {
    // Generates a unique slug from the name.
    const base = slugifyUnique(parsed.data.name, newId());
    const slug = await ensureUniqueCategorySlug(base);
    await createCategory({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      icon: parsed.data.icon,
      color: parsed.data.color,
      hidden: parsed.data.hidden,
    });
  } catch (error) {
    return { ok: false, message: `创建失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '分类已创建' };
}

export async function updateCategoryAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) {
    return { ok: false, message: '缺少分类 ID' };
  }

  const parsed = parseCategory(formData);
  if ('ok' in parsed) return parsed;

  try {
    await updateCategory(id, {
      name: parsed.data.name,
      description: parsed.data.description,
      icon: parsed.data.icon,
      color: parsed.data.color,
      hidden: parsed.data.hidden,
    });
  } catch (error) {
    return { ok: false, message: `保存失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '分类已保存' };
}

export async function deleteCategoryAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  if (typeof id !== 'string' || !id) {
    return { ok: false, message: '缺少分类 ID' };
  }

  try {
    // 'protected' deletes only an empty category; 'cascade' deletes with its
    // bookmarks.
    const settings = await getSiteSettings();
    if (settings.categoryDeleteMode === 'protected') {
      const outcome = await deleteCategoryIfEmpty(id);
      if (!outcome.deleted) {
        return {
          ok: false,
          message: `该分类下还有 ${outcome.bookmarkCount} 个书签，已开启「存在书签不可删除」，请先移出或删除这些书签`,
        };
      }
    } else {
      await deleteCategory(id);
    }
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '分类已移入回收站' };
}

export async function reorderCategoriesAction(
  orderedIds: string[],
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  if (!Array.isArray(orderedIds) || orderedIds.some((id) => typeof id !== 'string')) {
    return { ok: false, message: '排序数据无效' };
  }

  try {
    await renumberCategories(orderedIds);
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  revalidateSite();
  return { ok: true, message: '排序已保存' };
}
