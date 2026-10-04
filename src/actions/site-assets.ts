'use server';

import { guardAction } from '@/lib/action-guard';
import {
  deleteSiteAsset,
  putSiteAsset,
  SITE_ASSET_KEYS,
} from '@/db/queries/assets';
import { errorMessage } from '@/db/client';
import {
  deleteSetting,
  getSiteSettings,
  SETTING_KEYS,
  setSettings,
} from '@/db/queries/settings';
import { revalidateSite } from '@/lib/revalidate';

import type { ActionState } from './auth';

/** Favicon upload and removal actions. */

/** Max icon upload size (1MB). */
const MAX_ICON_BYTES = 1024 * 1024;

/** Allowed icon MIME types. */
const ALLOWED_ICON_TYPES = new Set([
  'image/png',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/svg+xml',
]);

export async function uploadFaviconAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guardAction();
  if (denied) return denied;

  const file = formData.get('favicon');
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, field: 'favicon', message: '请选择要上传的图标文件' };
  }
  if (file.size > MAX_ICON_BYTES) {
    return { ok: false, field: 'favicon', message: '图标不能超过 1MB' };
  }
  // Falls back to the file extension when the type is empty.
  const declaredType = file.type || typeFromName(file.name);
  if (!ALLOWED_ICON_TYPES.has(declaredType)) {
    return {
      ok: false,
      field: 'favicon',
      message: '只支持 PNG / ICO / JPEG / WebP / GIF / SVG 格式',
    };
  }

  try {
    const bytes = Buffer.from(await file.arrayBuffer());
    const updatedAt = new Date().toISOString();
    await putSiteAsset(
      SITE_ASSET_KEYS.favicon,
      declaredType,
      bytes.toString('base64'),
      updatedAt,
    );
    // Stores the upload time as the favicon version.
    await setSettings({
      [SETTING_KEYS.faviconMode]: 'upload',
      [SETTING_KEYS.faviconVersion]: updatedAt,
    });
  } catch (error) {
    return { ok: false, message: `上传失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '图标已更新' };
}

export async function removeFaviconAction(): Promise<ActionState> {
  const denied = await guardAction();
  if (denied) return denied;

  try {
    await deleteSiteAsset(SITE_ASSET_KEYS.favicon);
    await deleteSetting(SETTING_KEYS.faviconVersion);
    // Falls back to URL mode when a favicon URL is configured, else none.
    const settings = await getSiteSettings();
    await setSettings({
      [SETTING_KEYS.faviconMode]: settings.faviconUrl ? 'url' : 'none',
    });
  } catch (error) {
    return { ok: false, message: `移除失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '已移除上传的图标' };
}

function typeFromName(name: string): string {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'ico':
      return 'image/x-icon';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    default:
      return '';
  }
}
