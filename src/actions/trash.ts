'use server';

import { guardAction as guard } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import { getSiteSettings } from '@/db/queries/settings';
import {
  purgeAllTrash,
  purgeBookmark,
  purgeCategory,
  purgeExpiredTrash,
  restoreBookmark,
  restoreCategory,
} from '@/db/queries/trash';
import { revalidateSite } from '@/lib/revalidate';

import type { ActionState } from './auth';

/** Recycle-bin actions: restores revalidate the public site, purges do not. */

function isMissing(id: unknown): boolean {
  return typeof id !== 'string' || !id;
}

export async function restoreBookmarkAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (isMissing(id)) return { ok: false, message: '缺少书签 ID' };

  try {
    await restoreBookmark(id);
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }

  revalidateSite();
  return { ok: true, message: '书签已恢复' };
}

export async function restoreCategoryAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (isMissing(id)) return { ok: false, message: '缺少分类 ID' };

  try {
    const restored = await restoreCategory(id);
    revalidateSite();
    return {
      ok: true,
      message: restored
        ? `分类已恢复，同时恢复 ${restored} 个书签`
        : '分类已恢复',
    };
  } catch (error) {
    return { ok: false, message: errorMessage(error) };
  }
}

export async function purgeBookmarkAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (isMissing(id)) return { ok: false, message: '缺少书签 ID' };

  try {
    await purgeBookmark(id);
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  return { ok: true, message: '书签已彻底删除' };
}

export async function purgeCategoryAction(id: string): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;
  if (isMissing(id)) return { ok: false, message: '缺少分类 ID' };

  try {
    await purgeCategory(id);
  } catch (error) {
    return { ok: false, message: `删除失败：${errorMessage(error)}` };
  }

  return { ok: true, message: '分类已彻底删除' };
}

export async function purgeExpiredTrashAction(): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  try {
    const settings = await getSiteSettings();
    if (settings.trashRetentionDays <= 0) {
      return { ok: false, message: '当前保留策略为「永久」，不会自动清理' };
    }
    const removed = await purgeExpiredTrash(settings.trashRetentionDays);
    return {
      ok: true,
      message: removed ? `已清理 ${removed} 项过期内容` : '没有需要清理的内容',
    };
  } catch (error) {
    return { ok: false, message: `清理失败：${errorMessage(error)}` };
  }
}

export async function emptyTrashAction(): Promise<ActionState> {
  const denied = await guard();
  if (denied) return denied;

  try {
    const removed = await purgeAllTrash();
    return {
      ok: true,
      message: removed ? `已清空回收站，彻底删除 ${removed} 项` : '回收站已经是空的',
    };
  } catch (error) {
    return { ok: false, message: `清空失败：${errorMessage(error)}` };
  }
}
