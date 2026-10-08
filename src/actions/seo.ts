'use server';

import { randomBytes } from 'node:crypto';

import { errorMessage } from '@/db/client';
import { listVisibleCategorySlugs } from '@/db/queries/categories';
import {
  deleteSecret,
  getSecretValue,
  getSiteSettings,
  SECRET_KEYS,
  SETTING_KEYS,
  setSettings,
} from '@/db/queries/settings';
import { guardAction } from '@/lib/action-guard';
import { createFixedWindowLimiter } from '@/lib/rate-limit';
import {
  pushUrlsToSearchEngines,
  type PushOutcome,
} from '@/lib/search-engine-push';

import type { ActionState } from './auth';

/** SEO actions: key management plus search-engine URL submission. */

// ── Rate limit: 3 submissions/minute ────────────────────────────────────────
const rateLimiter = createFixedWindowLimiter({ windowMs: 60_000, max: 3 });

export type PushState = ActionState & { outcomes?: PushOutcome[] };

/** Submits the nav page and every visible category page to the configured engines. */
export async function pushToSearchEnginesAction(): Promise<PushState> {
  const denied = await guardAction();
  if (denied) return denied;

  if (!rateLimiter.consume('push')) {
    return { ok: false, message: '推送过于频繁，请稍后再试（每分钟 3 次）' };
  }

  const settings = await getSiteSettings();
  const siteUrl = settings.siteUrl;
  if (!siteUrl) {
    return { ok: false, message: '请先填写站点地址，再提交 URL' };
  }
  if (!settings.seoIndexing) {
    return { ok: false, message: '已关闭搜索引擎收录，请先打开收录开关' };
  }

  const categories = await listVisibleCategorySlugs();
  const urls = [
    `${siteUrl}/`,
    ...categories.map(
      (category) => `${siteUrl}/c/${encodeURIComponent(category.slug)}`,
    ),
  ];

  const outcomes = await pushUrlsToSearchEngines({
    siteUrl,
    urls,
    indexNowKey: settings.indexNowKey,
    baiduToken: await getSecretValue(SECRET_KEYS.baiduPushToken),
  });

  const succeeded = outcomes.filter((outcome) => outcome.ok).length;
  return {
    ok: succeeded > 0,
    message:
      succeeded > 0
        ? `已提交 ${urls.length} 个 URL，${succeeded} 个引擎接收成功`
        : `提交失败：${outcomes.map((outcome) => outcome.message).join('；')}`,
    outcomes,
  };
}

/** Mints a fresh IndexNow key; the previous key file stops resolving. */
export async function generateIndexNowKeyAction(): Promise<
  ActionState & { key?: string }
> {
  const denied = await guardAction();
  if (denied) return denied;

  // 16 random bytes → 32 hex chars, inside IndexNow's 8-128 key charset.
  const key = randomBytes(16).toString('hex');
  try {
    await setSettings({ [SETTING_KEYS.indexNowKey]: key });
  } catch (error) {
    return { ok: false, message: `生成失败：${errorMessage(error)}` };
  }
  return { ok: true, message: 'IndexNow 密钥已生成', key };
}

/** Deletes the Baidu push token; submission to Baidu stops working. */
export async function clearBaiduPushTokenAction(): Promise<ActionState> {
  const denied = await guardAction();
  if (denied) return denied;

  try {
    await deleteSecret(SECRET_KEYS.baiduPushToken);
  } catch (error) {
    return { ok: false, message: `清除失败：${errorMessage(error)}` };
  }
  return { ok: true, message: '百度推送 token 已清除' };
}
