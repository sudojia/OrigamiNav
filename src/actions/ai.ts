'use server';

import {
  countUntaggedBookmarks,
  getAiConfig,
  getAiConfigStatus,
  listUntaggedBookmarks,
} from '@/db/queries/ai';
import { getBookmarkById } from '@/db/queries/bookmarks';
import {
  listCategoryDescriptionTargets,
  updateCategoryDescriptions,
} from '@/db/queries/categories';
import { deleteSecret, getSecretValue, SECRET_KEYS } from '@/db/queries/settings';
import { guardActionWithAdmin as guard } from '@/lib/action-guard';
import {
  AiError,
  chatCompletion,
  COMPLETION_TOKEN_BUDGET,
  listModels,
  normalizeBaseUrl,
  toAiProtocol,
} from '@/lib/ai';
import {
  CATEGORY_DESCRIPTION_SAMPLES,
  generateCategoryDescriptions,
} from '@/lib/ai-descriptions';
import { generateTagsForBatch, generateTagsWithQueue } from '@/lib/ai-tags';
import { revalidateSite } from '@/lib/revalidate';
import { createFixedWindowLimiter } from '@/lib/rate-limit';
import { isValidHttpUrl } from '@/lib/utils';
import type { AiProtocol } from '@/types/nav';

/** AI-backed helpers with a per-admin rate limit. */

const rateLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 12 });

// ─── Model discovery ────────────────────────────────────────────────────────

export type FetchModelsResult =
  | { ok: true; models: string[] }
  | { ok: false, message: string };

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

// ─── Batch tag backfill ─────────────────────────────────────────────────────

export type BatchRetagResult = {
  ok: boolean;
  message: string;
  remaining: number;
};

/** AI-tags one batch of untagged bookmarks through the concurrency queue. */
export async function aiTagUntaggedBatchAction(): Promise<BatchRetagResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message, remaining: -1 };

  const config = await getAiConfig();
  if (!config) {
    return { ok: false, message: '请先配置 AI 服务', remaining: -1 };
  }

  const batch = await listUntaggedBookmarks(20);
  if (batch.length === 0) {
    return { ok: true, message: '没有需要补打标签的书签', remaining: 0 };
  }

  // One shared tag context and concurrent provider calls, bounded by the
  // admin's aiConcurrency inside the queue.
  let tagged: number;
  try {
    tagged = await generateTagsForBatch(config, batch);
  } catch (error) {
    console.error(`[origaminav] ai batch tagging failed`, error);
    return { ok: false, message: aiMessage(error), remaining: -1 };
  }
  if (tagged > 0) revalidateSite();

  const remaining = await countUntaggedBookmarks();
  return {
    ok: true,
    message: `已为 ${tagged} 个书签补打标签`,
    remaining,
  };
}

// ─── Category descriptions ──────────────────────────────────────────────────

/** Categories described per invocation; the admin clicks again for the rest. */
const DESCRIPTIONS_PER_RUN = 12;

export type CategoryDescriptionResult = { ok: boolean; message: string };

/**
 * Generates one category's intro and stores it, replacing whatever text is
 * there now. Unlike the batch fill, this is an explicit per-row action, so
 * overwriting is what the admin asked for.
 */
export async function aiCategoryDescriptionAction(
  categoryId: string,
): Promise<CategoryDescriptionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!rateLimiter.consume(`describe:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }

  const config = await getAiConfig();
  if (!config) return { ok: false, message: '请先在后台配置 AI 服务' };

  const targets = await listCategoryDescriptionTargets(
    CATEGORY_DESCRIPTION_SAMPLES,
  );
  const target = targets.find((entry) => entry.id === categoryId);
  if (!target) return { ok: false, message: '分类不存在或已被删除' };
  if (target.titles.length === 0) {
    return { ok: false, message: '该分类下还没有书签，先收录几个再生成描述' };
  }

  const generated = await generateCategoryDescriptions(config, [target]);
  const description = generated.get(target.id);
  if (!description) {
    return { ok: false, message: 'AI 没有返回可用的描述，请重试' };
  }

  const written = await updateCategoryDescriptions([
    { id: target.id, description },
  ]);
  if (written > 0) revalidateSite();
  return { ok: true, message: `已生成「${target.name}」的描述` };
}

export type FillCategoryDescriptionsResult = {
  ok: boolean;
  message: string;
  remaining: number;
};

/**
 * Fills the categories that have no description yet. Written text is never
 * overwritten, so this is safe to run again after adding categories.
 */
export async function aiFillCategoryDescriptionsAction(): Promise<FillCategoryDescriptionsResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message, remaining: -1 };
  if (!rateLimiter.consume(`describe-all:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试', remaining: -1 };
  }

  const config = await getAiConfig();
  if (!config) {
    return { ok: false, message: '请先在后台配置 AI 服务', remaining: -1 };
  }

  const targets = (
    await listCategoryDescriptionTargets(CATEGORY_DESCRIPTION_SAMPLES)
  ).filter((entry) => entry.description.trim() === '' && entry.titles.length > 0);
  if (targets.length === 0) {
    return { ok: true, message: '所有分类都已有描述', remaining: 0 };
  }

  const batch = targets.slice(0, DESCRIPTIONS_PER_RUN);
  let generated: Map<string, string>;
  try {
    generated = await generateCategoryDescriptions(config, batch);
  } catch (error) {
    console.error(`[origaminav] ai category descriptions failed`, error);
    return { ok: false, message: aiMessage(error), remaining: -1 };
  }

  const written = await updateCategoryDescriptions(
    [...generated].map(([id, description]) => ({ id, description })),
  );
  if (written > 0) revalidateSite();

  return {
    ok: true,
    message: `已为 ${written} 个分类生成描述`,
    remaining: Math.max(0, targets.length - written),
  };
}

// ─── Connection test ────────────────────────────────────────────────────────

export type TestAiConnectionResult = { ok: boolean; message: string };

/**
 * Runs one tiny completion to prove the address, key and model work
 * together; a blank key falls back to the stored one.
 */
export async function testAiConnectionAction(input: {
  protocol: AiProtocol | string;
  baseUrl: string;
  apiKey: string;
  model: string;
}): Promise<TestAiConnectionResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };
  if (!rateLimiter.consume(`test:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }

  const protocol = toAiProtocol(input.protocol);
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '');
  if (!isValidHttpUrl(baseUrl)) {
    return { ok: false, message: '请先填写合法的 Base URL（http/https）' };
  }

  const model = (input.model ?? '').trim();
  if (!model) return { ok: false, message: '请先选择或输入模型名' };

  let apiKey = (input.apiKey ?? '').trim();
  if (!apiKey) {
    const stored = await getSecretValue(SECRET_KEYS.aiApiKey);
    if (!stored) return { ok: false, message: '请先填写 API Key' };
    apiKey = stored;
  }

  const startedAt = Date.now();
  try {
    const reply = await chatCompletion(
      { protocol, baseUrl, apiKey, model },
      [{ role: 'user', content: '这是一次连接测试，请只回复：OK' }],
      { maxTokens: COMPLETION_TOKEN_BUDGET },
    );
    const elapsed = Date.now() - startedAt;
    const echo = reply.replace(/\s+/g, ' ').trim().slice(0, 40);
    return {
      ok: true,
      message: `连接成功 · ${elapsed} ms${echo ? ` · 模型回复「${echo}」` : ''}`,
    };
  } catch (error) {
    if (error instanceof AiError && error.message.startsWith('模型没有返回内容')) {
      return { ok: false, message: `接口已连通，${error.message}` };
    }
    return { ok: false, message: aiMessage(error) };
  }
}

// ─── Single-bookmark retag ──────────────────────────────────────────────────

export type RetagBookmarkResult = { ok: boolean; message: string };

/**
 * Regenerates one bookmark's tags from its current title, URL and
 * description, replacing the tags it has now.
 */
export async function aiTagBookmarkAction(
  bookmarkId: string,
): Promise<RetagBookmarkResult> {
  const auth = await guard();
  if (!auth.ok) return { ok: false, message: auth.message };

  const id = typeof bookmarkId === 'string' ? bookmarkId.trim() : '';
  if (!id) return { ok: false, message: '书签不存在或已被删除' };
  if (!rateLimiter.consume(`retag:${auth.adminId}`)) {
    return { ok: false, message: '操作太频繁，请稍后再试' };
  }

  const config = await getAiConfig();
  if (!config) return { ok: false, message: '请先在后台配置 AI 服务' };

  const bookmark = await getBookmarkById(id);
  if (!bookmark) return { ok: false, message: '书签不存在或已被删除' };

  try {
    const ok = await generateTagsWithQueue(
      config,
      bookmark.id,
      {
        url: bookmark.url,
        title: bookmark.title,
        description: bookmark.description,
      },
      { replace: true },
    );
    if (!ok) {
      // Model replied but produced no usable tags after the retry.
      console.warn(`[origaminav] ai retag: no usable tags for bookmark ${bookmark.id}`);
      return { ok: false, message: 'AI 没有返回标签，请检查模型与提示词后重试' };
    }
  } catch (error) {
    console.error(`[origaminav] ai retag failed for bookmark ${bookmark.id}`, error);
    return { ok: false, message: aiMessage(error) };
  }

  revalidateSite();
  return { ok: true, message: '已重打标签' };
}

function aiMessage(error: unknown): string {
  if (error instanceof AiError) return error.message;
  const reason = error instanceof Error ? error.message : String(error);
  return reason.slice(0, 200);
}
