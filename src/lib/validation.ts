import { z } from 'zod';

import { SLUG_MAX_LENGTH } from '@/types/nav';
import { isValidHttpUrl } from '@/lib/utils';

/** Max pasted URLs per bulk-URL import; mirrored by the client preview.
 * Bigger migrations belong to the HTML import path (5000 cap). */
export const MAX_URL_LINES = 50;

/** Numeric limits for the Server Action schemas. */
export const LIMITS = {
  title: 100,
  description: 300,
  categoryDescription: 200,
  url: 2048,
  tagName: 30,
  tagsPerBookmark: 10,
  categoryName: 40,
  siteName: 60,
  tagline: 120,
  aiBaseUrl: 2048,
} as const;

/** Zod refine for an http(s) URL check; chain trim/min/max before it via `.pipe`. */
export function httpUrlSchema(message: string): z.ZodString {
  return z.string().refine(isValidHttpUrl, message);
}

/** Optional URL schema: empty or http(s). `label` prefixes both error messages. */
export function optionalHttpUrlSchema(max: number, label: string): z.ZodString {
  return z
    .string()
    .trim()
    .max(max, `${label}最长 ${max} 个字符`)
    .refine(
      (value) => value === '' || isValidHttpUrl(value),
      `${label}必须是 http(s):// 链接`,
    );
}

/** Trimmed tag name: required, bounded, and free of comma/、 separators. */
export function tagNameSchema(message: string): z.ZodString {
  return z
    .string()
    .trim()
    .min(1, '请输入标签名称')
    .max(LIMITS.tagName, message)
    .refine((value) => !/[,，、]/.test(value), '标签名称不能包含逗号');
}

/** Bookmark field schemas shared by the admin form action and the extension API. */
export const bookmarkFields = {
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
} as const;

/** Tag slug from a query string, naming the tag page a client refreshes from. */
export const tagSlugParamSchema = z.string().trim().max(SLUG_MAX_LENGTH);
