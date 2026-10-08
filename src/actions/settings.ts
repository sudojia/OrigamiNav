'use server';

import { randomBytes } from 'node:crypto';

import { z } from 'zod';

import { guardAction } from '@/lib/action-guard';
import { errorMessage } from '@/db/client';
import { invalidateExtTokenCache } from '@/lib/ext-api';
import {
  clampCardColumns,
  deleteSecret,
  deleteSettings,
  SECRET_KEYS,
  SETTING_KEYS,
  setSecret,
  setSettings,
} from '@/db/queries/settings';
import { revalidateSite } from '@/lib/revalidate';
import { normalizeSiteUrl, normalizeVerificationCode } from '@/lib/seo';
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
  VERIFICATION_TARGETS,
  verificationKey,
  type VerificationId,
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
const BAIDU_TOKEN_MAX = 64;
const ANALYTICS_ID_MAX = 64;
const VERIFICATION_CODE_MAX = 200;
/** Generous cap for a pasted `<meta …>` tag; the code itself is shorter. */
const VERIFICATION_PASTE_MAX = 400;

/**
 * Search-engine codes are opaque tokens. A whole `<meta …>` tag pasted from the
 * console is unwrapped to its `content` value; anything else is a mis-paste.
 */
const verificationCodeSchema = z
  .string()
  .trim()
  .max(VERIFICATION_PASTE_MAX, `验证码最长 ${VERIFICATION_PASTE_MAX} 个字符`)
  .transform(normalizeVerificationCode)
  .pipe(
    z
      .string()
      .max(VERIFICATION_CODE_MAX, `验证码最长 ${VERIFICATION_CODE_MAX} 个字符`)
      .regex(
        /^[A-Za-z0-9_.:+/=-]*$/,
        '没能识别出验证码，请粘贴 content 的值或整段 meta 标签',
      ),
  );

/** Analytics IDs end up inside an inline snippet, so the charset stays tight. */
const analyticsIdSchema = z
  .string()
  .trim()
  .max(ANALYTICS_ID_MAX, `统计 ID 最长 ${ANALYTICS_ID_MAX} 个字符`)
  .regex(/^[A-Za-z0-9_-]*$/, '统计 ID 只能包含字母、数字、下划线和短横线');

/** One code field per engine, keyed by the shared verification registry. */
const verificationShape = Object.fromEntries(
  VERIFICATION_TARGETS.map((target) => [target.id, verificationCodeSchema]),
) as Record<VerificationId, typeof verificationCodeSchema>;

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
    siteUrl: optionalHttpUrlSchema(LIMITS.url, '站点地址'),
    seoIndexing: z.enum(['0', '1']),
    analyticsGaId: analyticsIdSchema,
    analyticsBaiduId: analyticsIdSchema,
    analyticsUmamiUrl: optionalHttpUrlSchema(LIMITS.url, '统计脚本地址'),
    analyticsUmamiId: analyticsIdSchema,
    baiduPushToken: z
      .string()
      .trim()
      .max(BAIDU_TOKEN_MAX, `推送 token 最长 ${BAIDU_TOKEN_MAX} 个字符`)
      .regex(/^[A-Za-z0-9]*$/, '推送 token 只能包含字母和数字'),
    // One code per engine, driven by the shared verification registry.
    ...verificationShape,
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
    siteUrl: formData.get('siteUrl') ?? '',
    seoIndexing: formData.get('seoIndexing') ?? '1',
    analyticsGaId: formData.get('analyticsGaId') ?? '',
    analyticsBaiduId: formData.get('analyticsBaiduId') ?? '',
    analyticsUmamiUrl: formData.get('analyticsUmamiUrl') ?? '',
    analyticsUmamiId: formData.get('analyticsUmamiId') ?? '',
    baiduPushToken: formData.get('baiduPushToken') ?? '',
    ...Object.fromEntries(
      VERIFICATION_TARGETS.map((target) => [
        target.id,
        formData.get(verificationKey(target.id)) ?? '',
      ]),
    ),
  });
  if (!parsed.success) {
    return {
      ok: false,
      field: parsed.error.issues[0]?.path[0]?.toString(),
      message: parsed.error.issues[0]?.message ?? '输入有误',
    };
  }

  try {
    const entries: Record<string, string> = {
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
      [SETTING_KEYS.seoIndexing]: parsed.data.seoIndexing,
      [SETTING_KEYS.analyticsGaId]: parsed.data.analyticsGaId,
      [SETTING_KEYS.analyticsBaiduId]: parsed.data.analyticsBaiduId,
      [SETTING_KEYS.analyticsUmamiId]: parsed.data.analyticsUmamiId,
    };

    // Optional keys: written when set, removed when cleared. One upsert plus
    // one delete statement cover all of them.
    const optional: Array<[string, string]> = [
      [SETTING_KEYS.logoUrl, parsed.data.logoUrl],
      [SETTING_KEYS.faviconUrl, parsed.data.faviconUrl],
      [SETTING_KEYS.iconCustomTemplate, parsed.data.iconCustomTemplate],
      [SETTING_KEYS.siteUrl, normalizeSiteUrl(parsed.data.siteUrl) ?? ''],
      [
        SETTING_KEYS.analyticsUmamiUrl,
        normalizeSiteUrl(parsed.data.analyticsUmamiUrl) ?? '',
      ],
      ...VERIFICATION_TARGETS.map(
        (target): [string, string] => [
          verificationKey(target.id),
          parsed.data[target.id],
        ],
      ),
    ];
    const cleared: string[] = [];
    for (const [key, value] of optional) {
      if (value === '') cleared.push(key);
      else entries[key] = value;
    }

    await setSettings(entries);
    await deleteSettings(cleared);
    // Writes the API key only when a new one was typed.
    if (parsed.data.aiApiKey !== '') {
      await setSecret(SECRET_KEYS.aiApiKey, parsed.data.aiApiKey);
    }
    if (parsed.data.baiduPushToken !== '') {
      await setSecret(SECRET_KEYS.baiduPushToken, parsed.data.baiduPushToken);
    }
  } catch (error) {
    return { ok: false, message: `保存失败：${errorMessage(error)}` };
  }

  revalidateSite();
  return { ok: true, message: '设置已保存' };
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
