import 'server-only';

import { z } from 'zod';

import { after } from 'next/server';

import { getAiConfig, type AiConfig } from '@/db/queries/ai';
import { getTagUsage } from '@/db/queries/nav';
import { attachTagsToBookmark } from '@/db/queries/tags';
import { chatCompletion, parseJsonObject } from '@/lib/ai';
import { revalidateSite } from '@/lib/revalidate';
import { LIMITS } from '@/lib/validation';

/**
 * Background AI tagging: runs after the save response has been sent, so the
 * admin never waits on the model. Best-effort by design — any failure simply
 * leaves the bookmark without AI tags.
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
          `tags 为 ${tagRange} 个中文短标签，每个不超过 12 字。` +
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
        .filter((tag) => tag.length > 0 && tag.length <= LIMITS.tagName),
    ),
  ).slice(0, config.tagMax);
}

/**
 * Schedules AI tag generation for a freshly saved bookmark. Call from a
 * Server Action while the request context is alive; the work runs after the
 * response has been delivered. Requires an AI config; silently does nothing
 * otherwise.
 */
export function queueAiTagGeneration(
  bookmarkId: string,
  page: { url: string; title?: string; description?: string },
): void {
  after(async () => {
    try {
      const [config, existingTags] = await Promise.all([
        getAiConfig(),
        getTopTagNames(),
      ]);
      if (!config) return;

      const names = await generateTagNames(config, page, existingTags);
      if (names.length === 0) return;

      await attachTagsToBookmark(bookmarkId, names);
      revalidateSite();
    } catch {
      // Best-effort background job; failures leave the bookmark untagged.
    }
  });
}
