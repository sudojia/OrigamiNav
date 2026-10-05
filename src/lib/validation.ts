import { z } from 'zod';

import { isValidHttpUrl } from '@/lib/utils';

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
