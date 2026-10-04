'use server';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import { createTag, deleteTag, renameTag, tagNameTaken } from '@/db/queries/tags';
import { revalidateSite } from '@/lib/revalidate';
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
