'use server';

import { z } from 'zod';

import { getAiConfig, getAiConfigStatus } from '@/db/queries/ai';
import { getTagUsage } from '@/db/queries/nav';
import { deleteSecret, SECRET_KEYS } from '@/db/queries/settings';
import { guardActionWithAdmin as guard } from '@/lib/action-guard';
import {
  AiError,
  chatCompletion,
  listModels,
  normalizeBaseUrl,
  parseJsonObject,
  toAiProtocol,
} from '@/lib/ai';
import { createFixedWindowLimiter } from '@/lib/rate-limit';
import { LIMITS } from '@/lib/validation';
import { isValidHttpUrl } from '@/lib/utils';
import type { AiProtocol } from '@/types/nav';

import { fetchUrlMetaAction } from './fetch-meta';

/** AI-backed helpers with a per-admin rate limit. */

const rateLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 12 });

// ─── Model discovery ────────────────────────────────────────────────────────

export type FetchModelsResult =
  | { ok: true; models: string[] }
  | { ok: false; message: string };

/** Lists the provider's models; a blank key falls back to the stored one. */
export async function fetchAiModelsAction(input: {
  protocol: AiProtocol | string;
  baseUrl: string;
  apiKey: string;
}): Promise<FetchModelsResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!rateLimiter.consume(`models:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }

  const protocol = toAiProtocol(input.protocol);

  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '');
  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, message: '请先填写合法的 Base URL（http/https）' };
  }

  let apiKey = (input.apiKey ?? '').trim();
  if (!apiKey) {
    const stored = await getAiConfigStatus();
    if (!stored.hasApiKey) {
      return { ok: false, message: '请先填写 API Key' };
    }
    // Re-reads the stored key server-side.
    const config = await getAiConfig();
    if (!config) return { ok: false, message: '请先填写 API Key' };
    apiKey = config.apiKey;
  }

  try {
    const models = await listModels({ protocol, baseUrl, apiKey });
    if (models.length === 0) {
      return { ok: false, message: '接口没有返回任何模型' };
    }
    return { ok: true, models };
  } catch (error) {
    return { ok: false, message: aiMessage(error) };
  }
}

// ─── Bookmark suggestions ───────────────────────────────────────────────────

export type SuggestResult =
  | {
      ok: true;
      title: string;
      description: string;
      tags: string[];
      /** Icon URL from the page scrape. */
      iconUrl: string | null;
    }
  | { ok: false; message: string };

const suggestionSchema = z.object({
  title: z.string().trim().max(LIMITS.title).optional(),
  description: z.string().trim().max(LIMITS.description).optional(),
  tags: z
    .array(z.string().trim().min(1).max(LIMITS.tagName))
    .max(40)
    .optional(),
});

/** Fills title, description, and tags for a URL; a failed scrape falls back to the URL alone. */
export async function suggestBookmarkAction(url: string): Promise<SuggestResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!rateLimiter.consume(`suggest:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }

  const target = (url ?? '').trim();
  if (!isValidHttpUrl(target)) {
    return { ok: false, message: '请先填写合法的 URL' };
  }

  const config = await getAiConfig();
  if (!config) {
    return { ok: false, message: '还没有配置 AI，请到「站点设置 → AI」填写并选择模型' };
  }

  const scraped = await fetchUrlMetaAction(target).catch(() => null);
  const page =
    scraped && scraped.ok
      ? {
          title: scraped.title,
          description: scraped.description,
          iconUrl: scraped.iconUrl,
        }
      : null;

  // Feeds the most-used existing tags to the model.
  const existingTags = (await getTagUsage())
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, 60)
    .map((tag) => tag.name);

  // Formats the tag count range as "N" or "N-M".
  const tagRange =
    config.tagMin === config.tagMax
      ? `${config.tagMin}`
      : `${config.tagMin}-${config.tagMax}`;

  try {
    const raw = await chatCompletion(config, [
      {
        role: 'system',
        content:
          '你是一个中文书签整理助手。根据给出的网页信息，输出一个 JSON 对象，字段：' +
          'title（简洁中文标题，不超过 40 字）、' +
          'description（一句话中文简介，不超过 80 字）、' +
          'tags（' + tagRange + ' 个中文短标签，每个不超过 12 字）。' +
          '优先复用「已有标签」中的词，避免同义重复。' +
          '只输出 JSON，不要任何解释或代码块标记。',
      },
      {
        role: 'user',
        content: [
          `链接：${target}`,
          page?.title ? `网页标题：${page.title}` : '网页标题：（抓取失败）',
          page?.description
            ? `网页描述：${page.description}`
            : '网页描述：（抓取失败）',
          existingTags.length ? `已有标签：${existingTags.join('、')}` : '已有标签：（无）',
        ].join('\n'),
      },
    ]);

    const parsed = suggestionSchema.safeParse(parseJsonObject(raw));
    if (!parsed.success) {
      return { ok: false, message: '模型返回的内容不符合预期，请重试' };
    }

    // Dedupes, trims, and caps the returned tags.
    const tags = Array.from(
      new Set(
        (parsed.data.tags ?? [])
          .map((tag) => tag.trim())
          .filter((tag) => tag.length > 0 && tag.length <= LIMITS.tagName),
      ),
    ).slice(0, config.tagMax);

    return {
      ok: true,
      title: (parsed.data.title ?? '').slice(0, LIMITS.title),
      description: (parsed.data.description ?? '').slice(0, LIMITS.description),
      tags,
      iconUrl: page?.iconUrl ?? null,
    };
  } catch (error) {
    return { ok: false, message: aiMessage(error) };
  }
}

// ─── Key management ─────────────────────────────────────────────────────────

/** Clears the stored API key. */
export async function clearAiKeyAction(): Promise<
  { ok: true; message: string } | { ok: false; message: string }
> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };
  try {
    await deleteSecret(SECRET_KEYS.aiApiKey);
  } catch (error) {
    return { ok: false, message: aiMessage(error) };
  }
  return { ok: true, message: '已清除 API Key' };
}

function aiMessage(error: unknown): string {
  if (error instanceof AiError) return error.message;
  const reason = error instanceof Error ? error.message : String(error);
  return reason.slice(0, 200);
}
