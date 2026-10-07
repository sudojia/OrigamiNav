import 'server-only';

import { z } from 'zod';
import { after } from 'next/server';

import { getAiConfig, type AiConfig } from '@/db/queries/ai';
import { getSiteSettings } from '@/db/queries/settings';
import { getTagUsage } from '@/db/queries/nav';
import { attachTagsToBookmarks, attachTagsToBookmark, replaceBookmarkTags } from '@/db/queries/tags';
import {
  chatCompletion,
  isTransientAiError,
  parseJsonObject,
} from '@/lib/ai';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS } from '@/lib/validation';
import { clampAiConcurrency } from '@/types/nav';

/**
 * Background AI tagging. Failures are best-effort: a bookmark simply stays
 * untagged. All provider calls go through a small FIFO queue so bulk saves
 * (or the batch backfill) never hammer the provider past aiConcurrency.
 */

const tagsSchema = z.object({
  tags: z.array(z.string().trim().min(1).max(LIMITS.tagName)).max(40),
});

/** Most-used existing tags fed to the model. */
async function getTopTagNames(): Promise<string[]> {
  const usage = await getTagUsage();
  return usage
    .filter((tag) => tag.count > 0)
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 60)
    .map((tag) => tag.name);
}

/** One model call that returns tag names only. */
async function generateTagNames(
  config: AiConfig,
  page: { url: string; title?: string; description?: string },
  existingTags: string[],
): Promise<string[]> {
  const tagRange =
    config.tagMin === config.tagMax
      ? `${config.tagMin}`
      : `${config.tagMin}-${config.tagMax}`;

  const raw = await chatCompletion(
    config,
    [
      {
        role: 'system',
        content:
          '你是一个中文书签整理助手。根据给出的网页信息，输出一个 JSON 对象：{"tags": []}，' +
          `tags 为 ${tagRange} 个中文短标签，每个不超过 ${config.tagMaxLen} 字，风格与「已有标签」保持一致。` +
          '每个标签是数组的一个独立元素，元素内不要包含逗号；' +
          '优先复用「已有标签」中的词，避免同义重复。' +
          '只输出 JSON，不要任何解释或代码块标记。',
      },
      {
        role: 'user',
        content: [
          `链接：${page.url}`,
          page.title ? `网页标题：${page.title}` : '网页标题：（无）',
          page.description ? `网页描述：${page.description}` : '网页描述：（无）',
          existingTags.length
            ? `已有标签：${existingTags.join('、')}`
            : '已有标签：（无）',
        ].join('\n'),
      },
    ],
    { maxTokens: 300 },
  );

  const parsed = tagsSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) return [];

  return Array.from(
    new Set(
      parsed.data.tags
        // A model may pack several tags into one element; split them apart.
        .flatMap((tag) => tag.split(/[,，]/))
        .map((tag) => tag.trim())
        .filter(
          (tag) =>
            tag.length > 0 &&
            tag.length <= Math.min(LIMITS.tagName, config.tagMaxLen),
        ),
    ),
  ).slice(0, config.tagMax);
}

// ─── Concurrency queue ──────────────────────────────────────────────────────
//
// In-process FIFO semaphore; the limit is read once per tagging job, so a
// long batch keeps the value it started with.

let active = 0;
const waiters: Array<() => void> = [];

/** Concurrency limit for one tagging job; clamped to the configured bounds. */
async function getConcurrencyLimit(): Promise<number> {
  return clampAiConcurrency((await getSiteSettings()).aiConcurrency);
}

async function acquire(limit: number): Promise<void> {
  if (active < limit) {
    active += 1;
    return;
  }
  // The releasing task hands its slot straight over, so `active` stays put.
  await new Promise<void>((resolve) => waiters.push(resolve));
}

function release(): void {
  const next = waiters.shift();
  if (next) next();
  else active -= 1;
}

/** Runs one provider-bound task through the queue. */
async function withQueue<T>(task: () => Promise<T>, limit: number): Promise<T> {
  await acquire(limit);
  try {
    return await task();
  } finally {
    release();
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** One model call, retried once when the first answer carries no tags. */
async function generateNames(
  config: AiConfig,
  page: { url: string; title?: string; description?: string },
  existingTags: string[],
): Promise<string[]> {
  const names = await generateTagNames(config, page, existingTags);
  if (names.length > 0) return names;
  await sleep(1500);
  return generateTagNames(config, page, existingTags);
}

const TRANSIENT_RETRY_DELAY_MS = 2_000;

/**
 * Provider failures classified transient (429, 5xx, transport, timeout) get
 * one backoff retry, so raised concurrency sheds into delays instead of
 * dropped tags. The backoff runs while holding the queue slot, which also
 * throttles sibling tasks against the same provider.
 */
async function generateNamesWithRetry(
  config: AiConfig,
  page: { url: string; title?: string; description?: string },
  existingTags: string[],
): Promise<string[]> {
  try {
    return await generateNames(config, page, existingTags);
  } catch (error) {
    if (!isTransientAiError(error)) throw error;
    await sleep(TRANSIENT_RETRY_DELAY_MS);
    return generateNames(config, page, existingTags);
  }
}

/**
 * Generates and attaches tags for one bookmark through the concurrency
 * queue, retrying once on failure (provider rate limits, transient
 * errors). With `replace` the bookmark's current tags are swapped for the
 * generated ones; generation runs first, so a failure leaves them intact.
 * Returns true only when tags were attached.
 */
export async function generateTagsWithQueue(
  config: AiConfig,
  bookmarkId: string,
  page: { url: string; title?: string; description?: string },
  options: { topTags?: string[]; replace?: boolean } = {},
): Promise<boolean> {
  // Read outside the queue slot: the tag context and limit are database round
  // trips, not provider work, so they must not hold a concurrency slot.
  const [existingTags, limit] = await Promise.all([
    options.topTags ?? getTopTagNames(),
    getConcurrencyLimit(),
  ]);
  const names = await withQueue(
    () => generateNamesWithRetry(config, page, existingTags),
    limit,
  );
  if (names.length === 0) return false;

  if (options.replace) await replaceBookmarkTags(bookmarkId, names);
  else await attachTagsToBookmark(bookmarkId, names);
  return true;
}

/**
 * Tags many bookmarks in one pass: the existing-tag context is read once (so
 * the whole batch sees the same one), the provider calls share the concurrency
 * queue instead of running one after another, and the results are persisted in
 * a single batched write. Returns how many bookmarks were tagged.
 */
export async function generateTagsForBatch(
  config: AiConfig,
  targets: Array<{
    id: string;
    url: string;
    title?: string;
    description?: string;
  }>,
): Promise<number> {
  if (!targets.length) return 0;

  const [existingTags, limit] = await Promise.all([
    getTopTagNames(),
    getConcurrencyLimit(),
  ]);

  // Best-effort per target: one provider failure must not drop the rest.
  const generated = (
    await Promise.all(
      targets.map(async (target) => {
        try {
          return {
            bookmarkId: target.id,
            names: await withQueue(
              () => generateNamesWithRetry(config, target, existingTags),
              limit,
            ),
          };
        } catch (error) {
          console.error(
            `[origaminav] ai tagging failed for bookmark ${target.id}`,
            error,
          );
          return null;
        }
      }),
    )
  ).flatMap((entry) => (entry && entry.names.length > 0 ? [entry] : []));

  return attachTagsToBookmarks(generated);
}

/**
 * Schedules AI tag generation for a freshly saved bookmark. Call from a
 * Server Action or route handler while the request context is alive; the
 * work runs after the response has been delivered.
 */
export function queueAiTagGeneration(
  bookmarkId: string,
  page: { url: string; title?: string; description?: string },
): void {
  after(async () => {
    try {
      const config = await getAiConfig();
      if (!config) return;
      const ok = await generateTagsWithQueue(config, bookmarkId, page);
      if (ok) revalidateSite();
    } catch (error) {
      // Best-effort background job; failures leave the bookmark untagged.
      console.error(
        `[origaminav] background ai tagging failed for bookmark ${bookmarkId}`,
        error,
      );
    }
  });
}
