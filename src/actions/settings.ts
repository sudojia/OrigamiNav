'use server';

import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { guardAction } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import { invalidateExtTokenCache } from '@/lib/ext-api';
import {
  clampCardColumns,
  deleteSecret,
  deleteSetting,
  SECRET_KEYS,
  SETTING_KEYS,
  setSecret,
  setSettings,
} from '@/db/queries/settings';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS, optionalHttpUrlSchema } from '@/lib/validation';
import { isValidHttpUrl } from '@/lib/utils';
import {
  AI_CONCURRENCY_BOUNDS,
  AI_PROTOCOLS,
  AI_TAG_COUNT_BOUNDS,
  AI_TAG_LEN_BOUNDS,
  CATEGORY_DELETE_MODES,
  DEFAULT_AI_CONCURRENCY,
  DEFAULT_AI_TAG_MAX_LEN,
  DEFAULT_AI_TAG_RANGE,
  DEFAULT_LOGIN_RATE_LIMIT,
  DEFAULT_SESSION_MAX_DAYS,
  FAVICON_MODES,
  ICON_SERVICES,
  ICON_TEMPLATE_PLACEHOLDER,
  LOGIN_RATE_LIMIT_BOUNDS,
  SESSION_MAX_DAYS_BOUNDS,
  SKIN_IDS,
  clampAiConcurrency,
  clampAiTagCount,
  clampAiTagMaxLen,
  clampLoginRateLimit,
  clampSessionMaxDays,
  isCategoryPreviewCount,
} from '@/types/nav';

import type { ActionState } from './auth';

const AI_MODEL_MAX = 200;
const AI_KEY_MAX = 512;

const settingsSchema = z
  .object({
    siteName: z
      .string()
      .trim()
      .min(1, '站点名称不能为空')
      .max(LIMITS.siteName, `站点名称最多 ${LIMITS.siteName} 个字`),
    tagline: z
      .string()
      .trim()
      .max(LIMITS.tagline, `副标题最多 ${LIMITS.tagline} 个字`),
    description: z
      .string()
      .trim()
      .max(LIMITS.description, `描述最多 ${LIMITS.description} 个字`),
    logoUrl: optionalHttpUrlSchema(LIMITS.url, 'Logo 地址'),
    faviconMode: z.enum(FAVICON_MODES),
    faviconUrl: optionalHttpUrlSchema(LIMITS.url, '图标地址'),
    iconService: z.enum(ICON_SERVICES),
    iconCustomTemplate: z
      .string()
      .trim()
      .max(LIMITS.url, `模板最长 ${LIMITS.url} 个字符`)
      .optional()
      .default(''),
    defaultTheme: z.enum(SKIN_IDS),
    cardColumns: z.coerce.number().int().min(1).max(8),
    categoryPreviewCount: z.coerce
      .number()
      .int()
      .refine(isCategoryPreviewCount, '请选择有效的展示数量'),
    categoryDeleteMode: z.enum(CATEGORY_DELETE_MODES),
    sessionMaxDays: z.coerce
      .number()
      .int()
      .min(SESSION_MAX_DAYS_BOUNDS.min)
      .max(SESSION_MAX_DAYS_BOUNDS.max),
    loginRateLimit: z.coerce
      .number()
      .int()
      .min(LOGIN_RATE_LIMIT_BOUNDS.min)
      .max(LOGIN_RATE_LIMIT_BOUNDS.max),
    aiBaseUrl: optionalHttpUrlSchema(LIMITS.aiBaseUrl, 'AI Base URL'),
    aiProtocol: z.enum(AI_PROTOCOLS),
    aiModel: z.string().trim().max(AI_MODEL_MAX, `模型名最长 ${AI_MODEL_MAX} 个字符`),
    // Empty leaves the stored key unchanged.
    aiApiKey: z.string().trim().max(AI_KEY_MAX, `API Key 最长 ${AI_KEY_MAX} 个字符`),
    aiTagMin: z.coerce
      .number()
      .int()
      .min(AI_TAG_COUNT_BOUNDS.min)
      .max(AI_TAG_COUNT_BOUNDS.max),
    aiTagMax: z.coerce
      .number()
      .int()
      .min(AI_TAG_COUNT_BOUNDS.min)
      .max(AI_TAG_COUNT_BOUNDS.max),
    aiConcurrency: z.coerce
      .number()
      .int()
      .min(AI_CONCURRENCY_BOUNDS.min)
      .max(AI_CONCURRENCY_BOUNDS.max),
    aiTagMaxLen: z.coerce
      .number()
      .int()
      .min(AI_TAG_LEN_BOUNDS.min)
      .max(AI_TAG_LEN_BOUNDS.max),
  })
  .refine(
    (value) => value.faviconMode !== 'url' || value.faviconUrl !== '',
    { path: ['faviconUrl'], message: '选择「图片链接」时需要填写图标地址' },
  )
  .refine(
    (value) =>
      value.iconService !== 'custom' ||
      (value.iconCustomTemplate !== '' &&
        isValidHttpUrl(value.iconCustomTemplate) &&
        value.iconCustomTemplate.includes(ICON_TEMPLATE_PLACEHOLDER)),
    {
      path: ['iconCustomTemplate'],
      message: `选择「自定义源」时需要填写含 ${ICON_TEMPLATE_PLACEHOLDER} 占位符的 http(s) 模板`,
    },
  )
  .refine((value) => value.aiTagMin <= value.aiTagMax, {
    path: ['aiTagMin'],
    message: '标签数量下限不能大于上限',
  });

export async function updateSettingsAction(
  _prev: ActionState | null,
  formData: FormData,
): Promise<ActionState> {
  const denied = await guardAction();
  if (denied) return denied;

  const parsed = settingsSchema.safeParse({
    siteName: formData.get('siteName'),
    tagline: formData.get('tagline') ?? '',
    description: formData.get('description') ?? '',
    logoUrl: formData.get('logoUrl') ?? '',
    faviconMode: formData.get('faviconMode') ?? 'none',
    faviconUrl: formData.get('faviconUrl') ?? '',
    iconService: formData.get('iconService') ?? 'auto',
    iconCustomTemplate: formData.get('iconCustomTemplate') ?? '',
    defaultTheme: formData.get('defaultTheme'),
    cardColumns: formData.get('cardColumns'),
    categoryPreviewCount: formData.get('categoryPreviewCount'),
    categoryDeleteMode: formData.get('categoryDeleteMode') ?? 'protected',
    sessionMaxDays:
      formData.get('sessionMaxDays') ?? String(DEFAULT_SESSION_MAX_DAYS),
    loginRateLimit:
      formData.get('loginRateLimit') ?? String(DEFAULT_LOGIN_RATE_LIMIT),
    aiBaseUrl: formData.get('aiBaseUrl') ?? '',
    aiProtocol: formData.get('aiProtocol') ?? 'openai',
    aiModel: formData.get('aiModel') ?? '',
    aiApiKey: formData.get('aiApiKey') ?? '',
    // Falls back to defaults when the fields are absent.
    aiTagMin: formData.get('aiTagMin') ?? String(DEFAULT_AI_TAG_RANGE.min),
    aiTagMax: formData.get('aiTagMax') ?? String(DEFAULT_AI_TAG_RANGE.max),
    aiConcurrency:
      formData.get('aiConcurrency') ?? String(DEFAULT_AI_CONCURRENCY),
    aiTagMaxLen:
      formData.get('aiTagMaxLen') ?? String(DEFAULT_AI_TAG_MAX_LEN),
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  try {
    await setSettings({
      [SETTING_KEYS.siteName]: parsed.data.siteName,
      [SETTING_KEYS.tagline]: parsed.data.tagline,
      [SETTING_KEYS.description]: parsed.data.description,
      [SETTING_KEYS.defaultTheme]: parsed.data.defaultTheme,
      [SETTING_KEYS.cardColumns]: String(
        clampCardColumns(parsed.data.cardColumns),
      ),
      [SETTING_KEYS.categoryPreviewCount]: String(
        parsed.data.categoryPreviewCount,
      ),
      [SETTING_KEYS.categoryDeleteMode]: parsed.data.categoryDeleteMode,
      [SETTING_KEYS.sessionMaxDays]: String(
        clampSessionMaxDays(parsed.data.sessionMaxDays),
      ),
      [SETTING_KEYS.loginRateLimit]: String(
        clampLoginRateLimit(parsed.data.loginRateLimit),
      ),
      [SETTING_KEYS.faviconMode]: parsed.data.faviconMode,
      [SETTING_KEYS.iconService]: parsed.data.iconService,
      [SETTING_KEYS.aiBaseUrl]: parsed.data.aiBaseUrl,
      [SETTING_KEYS.aiProtocol]: parsed.data.aiProtocol,
      [SETTING_KEYS.aiModel]: parsed.data.aiModel,
      [SETTING_KEYS.aiTagMin]: String(
        clampAiTagCount(parsed.data.aiTagMin, DEFAULT_AI_TAG_RANGE.min),
      ),
      [SETTING_KEYS.aiTagMax]: String(
        clampAiTagCount(parsed.data.aiTagMax, DEFAULT_AI_TAG_RANGE.max),
      ),
      [SETTING_KEYS.aiConcurrency]: String(
        clampAiConcurrency(parsed.data.aiConcurrency),
      ),
      [SETTING_KEYS.aiTagMaxLen]: String(
        clampAiTagMaxLen(parsed.data.aiTagMaxLen),
      ),
    });
    // Removes the setting when the value is empty.
    await setOrDelete(SETTING_KEYS.logoUrl, parsed.data.logoUrl);
    await setOrDelete(SETTING_KEYS.faviconUrl, parsed.data.faviconUrl);
    await setOrDelete(
      SETTING_KEYS.iconCustomTemplate,
      parsed.data.iconCustomTemplate,
    );
    // Writes the API key only when a new one was typed.
    if (parsed.data.aiApiKey !== '') {
      await setSecret(SECRET_KEYS.aiApiKey, parsed.data.aiApiKey);
    }
  } catch (error) {
    return { ok: false, message: `保存失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '设置已保存' };
}

async function setOrDelete(key: string, value: string): Promise<void> {
  if (value === '') {
    await deleteSetting(key);
  } else {
    await setSettings({ [key]: value });
  }
}

// ─── Browser-extension token ────────────────────────────────────────────────
//
// Bearer token for /api/ext/*; stored verbatim so the admin can view and
// rotate it.

const EXT_TOKEN_PREFIX = 'origaminav_';
// 64 CSPRNG bytes → 512 bits of entropy, 86 base64url chars.
const EXT_TOKEN_BYTES = 64;

export type ExtTokenState = ActionState & { token?: string | null };

/** Mints a fresh extension token, replacing any previous one. */
export async function generateExtTokenAction(): Promise<ExtTokenState> {
  const denied = await guardAction();
  if (denied) return denied;

  const token = `${EXT_TOKEN_PREFIX}${randomBytes(EXT_TOKEN_BYTES).toString('base64url')}`;
  try {
    await setSecret(SECRET_KEYS.extToken, token);
    invalidateExtTokenCache();
  } catch (error) {
    return { ok: false, message: `生成失败：${errorMessage(error)}` };
  }
  return { ok: true, message: '扩展令牌已生成，旧令牌已失效', token };
}

/** Deletes the extension token; every configured extension stops working. */
export async function revokeExtTokenAction(): Promise<ExtTokenState> {
  const denied = await guardAction();
  if (denied) return denied;

  try {
    await deleteSecret(SECRET_KEYS.extToken);
    invalidateExtTokenCache();
  } catch (error) {
    return { ok: false, message: `吊销失败：${errorMessage(error)}` };
  }
  return { ok: true, message: '扩展令牌已吊销', token: null };
}
