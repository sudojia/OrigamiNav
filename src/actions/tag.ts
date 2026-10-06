'use server';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import {
  createTag,
  deleteTag,
  deleteTags,
  deleteUnusedTags,
  mergeTags,
  renameTag,
  searchTagOptions,
  tagNameTaken,
  type TagListRow,
} from '@/db/queries/tags';
import { revalidateSite } from '@/lib/revalidate';
import { TAG_BULK_LIMIT, TAG_QUERY_MAX } from '@/lib/tag-list';
import { LIMITS, tagNameSchema as buildTagNameSchema } from '@/lib/validation';

import type { ActionState } from './auth';

const tagNameSchema = buildTagNameSchema(`标签最多 ${LIMITS.tagName} 个字`);

export async function createTagAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const parsed = tagNameSchema.safeParse(formData.get('name'));
  if (!parsed.success) {
    return {
      ok: false,
      field: 'name',
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  try {
    if (await tagNameTaken(parsed.data)) {
      return { ok: false, field: 'name', message: '同名标签已存在' };
    }
    await createTag(parsed.data);
  } catch (error) {
    return { ok: false, message: `创建失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '标签已创建' };
}

export async function renameTagAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const id = formData.get('id');
  if (typeof id !== 'string' || !id) {
    return { ok: false, message: '缺少标签 ID' };
  }

  const parsed = tagNameSchema.safeParse(formData.get('name'));
  if (!parsed.success) {
    return {
      ok: false,
      field: 'name',
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  try {
    if (await tagNameTaken(parsed.data, id)) {
      return { ok: false, field: 'name', message: '已有同名标签，可改用「合并」' };
    }
    const updated = await renameTag(id, parsed.data);
    if (!updated) {
      return { ok: false, message: '标签不存在或已被删除' };
    }
  } catch (error) {
    return { ok: false, message: `重命名失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '标签已重命名' };
}

export async function deleteTagAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  try {
    await deleteTag(id);
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '标签已删除' };
}

export async function deleteTagsAction(ids: string[]): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const unique = [...new Set(ids.filter((id) => typeof id === 'string' && id))];
  if (!unique.length) return { ok: false, message: '请先选择要删除的标签' };
  if (unique.length > TAG_BULK_LIMIT) {
    return { ok: false, message: `一次最多删除 ${TAG_BULK_LIMIT} 个标签` };
  }

  let removed = 0;
  try {
    removed = await deleteTags(unique);
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: `已删除 ${removed} 个标签` };
}

/** Moves the source tags' bookmarks onto the target tag, then drops the sources. */
export async function mergeTagsAction(input: {
  targetId: string;
  sourceIds: string[];
}): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  const targetId = typeof input?.targetId === 'string' ? input.targetId : '';
  const sourceIds = Array.isArray(input?.sourceIds) ? input.sourceIds : [];
  const sources = [...new Set(sourceIds)].filter(
    (id) => typeof id === 'string' && id && id !== targetId,
  );

  if (!targetId) return { ok: false, message: '请选择要合并到的标签' };
  if (!sources.length) return { ok: false, message: '请先选择要合并的标签' };
  if (sources.length + 1 > TAG_BULK_LIMIT) {
    return { ok: false, message: `一次最多合并 ${TAG_BULK_LIMIT} 个标签` };
  }

  let result: { removed: number; moved: number };
  try {
    result = await mergeTags(targetId, sources);
  } catch (error) {
    return { ok: false, message: `合并失败：${errorMessage(error)}` };
  }

  if (result.removed === 0) {
    return { ok: false, message: '标签不存在或已被删除' };
  }

  revalidateSite();
  return {
    ok: true,
    message: `已合并 ${result.removed} 个标签，迁移 ${result.moved} 个书签关联`,
  };
}

/** Merge targets for the picker; empty when the caller is not signed in. */
export async function searchTagsAction(input: {
  query: string;
  excludeIds: string[];
}): Promise<TagListRow[]> {
  const denied = await guard();
  if (denied) return [];

  return searchTagOptions({
    query:
      typeof input?.query === 'string'
        ? input.query.trim().slice(0, TAG_QUERY_MAX)
        : '',
    excludeIds: Array.isArray(input?.excludeIds)
      ? input.excludeIds.filter((id) => typeof id === 'string').slice(0, TAG_BULK_LIMIT)
      : [],
    limit: 20,
  });
}

export async function deleteUnusedTagsAction(): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  let removed = 0;
  try {
    removed = await deleteUnusedTags();
  } catch (error) {
    return { ok: false, message: `清理失败：${errorMessage(error)}` };
  }

  revalidateSite();
  if (removed === 0) {
    return { ok: true, message: '没有未使用的标签' };
  }
  return { ok: true, message: `已清理 ${removed} 个未使用标签` };
}
