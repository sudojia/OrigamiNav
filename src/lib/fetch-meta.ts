import 'server-only';

import { fetchFollowing, type FetchFailure } from '@/lib/safe-fetch';
import { MAX_HTML_BYTES, parseHtmlMeta, readBodyCapped } from '@/lib/scrape';
import { isValidHttpUrl } from '@/lib/utils';

/** URL metadata scraping core; auth and rate limiting live in the actions layer. */

export type FetchMetaResult =
  | { ok: true; title: string; description: string; iconUrl: string | null }
  | { ok: false; message: string };

const TIMEOUT_MS = 8_000;

/** Scrapes title, description, and icon from one URL. */
export async function fetchUrlMeta(url: string): Promise<FetchMetaResult> {
  if (typeof url !== 'string' || !isValidHttpUrl(url.trim())) {
    return { ok: false, message: '请输入 http(s):// 开头的完整链接' };
  }

  const outcome = await fetchFollowing(
    url.trim(),
    {
      accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
      headers: { 'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6' },
      timeoutMs: TIMEOUT_MS,
    },
    async (response, finalUrl): Promise<FetchMetaResult> => {
      const html = await readBodyCapped(
        response.body,
        MAX_HTML_BYTES,
        response.headers.get('content-type'),
      );
      const meta = parseHtmlMeta(html, finalUrl);

      if (!meta.title && !meta.description) {
        return { ok: false, message: '页面里没有解析到标题或描述，请手动填写' };
      }
      return {
        ok: true,
        title: meta.title,
        description: meta.description,
        iconUrl: meta.iconUrl,
      };
    },
  );

  return outcome.ok ? outcome.value : { ok: false, message: manualHint(outcome) };
}

/** Two failures are worth retrying by hand rather than reporting verbatim. */
function manualHint(failure: FetchFailure): string {
  return failure.reason === 'too-many-redirects' || failure.reason === 'timeout'
    ? `${failure.message}，请手动填写`
    : failure.message;
}

/**
 * Fetches metadata for many URLs with bounded concurrency, preserving input
 * order; per-URL failures resolve to `{ ok: false }` results, never throw.
 */
export async function fetchUrlMetas(
  urls: string[],
  { concurrency = 5 }: { concurrency?: number } = {},
): Promise<FetchMetaResult[]> {
  const results: FetchMetaResult[] = new Array(urls.length);
  let next = 0;

  async function worker(): Promise<void> {
    for (;;) {
      const index = next;
      next += 1;
      if (index >= urls.length) return;
      results[index] = await fetchUrlMeta(urls[index]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, urls.length) }, () => worker()),
  );
  return results;
}
