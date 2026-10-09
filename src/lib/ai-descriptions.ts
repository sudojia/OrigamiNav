import 'server-only';

import { z } from 'zod';

import type { AiConfig } from '@/db/queries/ai';
import {
  chatCompletion,
  COMPLETION_TOKEN_BUDGET,
  isTransientAiError,
  parseJsonObject,
} from '@/lib/ai';
import { getAiConcurrencyLimit, withAiQueue } from '@/lib/ai-queue';
import { LIMITS } from '@/lib/validation';

/**
 * AI-written category intros: one generic line about what the category holds,
 * derived from its own bookmarks so the wording matches the real contents.
 */

/** Titles fed to the model per category: specific enough, bounded for cost. */
export const CATEGORY_DESCRIPTION_SAMPLES = 40;

/**
 * The prompt asks for 20 Han characters, and the model stayed inside that in 13
 * of 14 sampled answers. A longer first answer is regenerated once; the retry is
 * then accepted slightly over, because the limit is a style rule and failing the
 * whole generation over two characters would be worse than keeping them.
 */
const DESCRIPTION_TARGET_HAN = 20;
const DESCRIPTION_RETRY_HAN = 28;

/**
 * The admin waits on this call, and a reasoning model can take over 20 seconds
 * to answer even a short prompt, so it gets more headroom than the default.
 */
const TIMEOUT_MS = 60_000;

const descriptionSchema = z.object({
  description: z.string().trim().min(1).max(LIMITS.categoryDescription),
});

const SYSTEM_PROMPT = [
  '你是中文导航站的编辑。根据分类名和该分类下已收录的站点清单，写一句分类页顶部的说明。',
  '要求：',
  '- 20 个汉字以内，越短越好，不加句号。',
  '- 写成一句完整的话，要有动词，不要写成名词堆砌的标签短语。',
  '- 只概括这个分类收录哪几类资源，不要出现具体站点名、产品名或品牌名，不要重复分类名里的词。',
  '- 不要「应有尽有」「一站式」「海量」这类营销词，不要写网址。',
  '- 只输出 JSON：{"description": "..."}，不要解释，不要代码块标记。',
].join('\n');

export type CategoryDescriptionInput = {
  id: string;
  name: string;
  titles: string[];
};

/**
 * Generates an intro for each category, bounded by the shared concurrency
 * queue. Per-category failures are logged and skipped, so one bad provider
 * response cannot drop the whole batch; the map holds only the successes.
 */
export async function generateCategoryDescriptions(
  config: AiConfig,
  categories: CategoryDescriptionInput[],
): Promise<Map<string, string>> {
  if (categories.length === 0) return new Map();

  const limit = await getAiConcurrencyLimit();
  const results = await Promise.all(
    categories.map(async (category) => {
      try {
        const description = await withAiQueue(
          () => requestWithRetry(config, category),
          limit,
        );
        return description ? ([category.id, description] as const) : null;
      } catch (error) {
        console.error(
          `[origaminav] ai category description failed for ${category.id}`,
          error,
        );
        return null;
      }
    }),
  );

  return new Map(results.filter((entry) => entry !== null));
}

const RETRY_DELAY_MS = 2_000;

/**
 * One model call, retried once when the first answer breaks the length rule or
 * the provider failed transiently. Mirrors the tagging path's retry-on-empty.
 */
async function requestWithRetry(
  config: AiConfig,
  category: CategoryDescriptionInput,
): Promise<string | null> {
  try {
    const text = await requestDescription(
      config,
      category,
      DESCRIPTION_TARGET_HAN,
    );
    if (text) return text;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return requestDescription(config, category, DESCRIPTION_RETRY_HAN);
  } catch (error) {
    if (!isTransientAiError(error)) throw error;
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return requestDescription(config, category, DESCRIPTION_RETRY_HAN);
  }
}

async function requestDescription(
  config: AiConfig,
  category: CategoryDescriptionInput,
  maxHan: number,
): Promise<string | null> {
  const raw = await chatCompletion(
    config,
    [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          `分类名：${category.name}`,
          category.titles.length
            ? `已收录站点：${category.titles.join('、')}`
            : '已收录站点：（无）',
        ].join('\n'),
      },
    ],
    { maxTokens: COMPLETION_TOKEN_BUDGET, timeoutMs: TIMEOUT_MS },
  );

  const parsed = descriptionSchema.safeParse(parseJsonObject(raw));
  if (!parsed.success) return null;

  const text = cleanDescription(parsed.data.description);
  if (!text || hanLength(text) > maxHan) return null;
  return text;
}

/** Counts Han characters; the length rule is stated in 汉字, not code units. */
function hanLength(text: string): number {
  return (text.match(/\p{Script=Han}/gu) ?? []).length;
}

/** Collapses whitespace, strips wrapping quotes and a trailing full stop. */
function cleanDescription(raw: string): string | null {
  const text = raw
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["'「『]+/, '')
    .replace(/["'」』]+$/, '')
    .replace(/[。.]+$/, '')
    .trim()
    .slice(0, LIMITS.categoryDescription);
  return text.length > 0 ? text : null;
}
