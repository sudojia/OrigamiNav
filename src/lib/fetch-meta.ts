import 'server-only';

import { Agent, fetch as undiciFetch } from 'undici';

import { PROJECT_USER_AGENT } from '@/lib/project-links';
import {
  FetchBlockedError,
  MAX_HTML_BYTES,
  parseHtmlMeta,
  pinnedLookup,
  readBodyCapped,
  resolveAndValidate,
} from '@/lib/scrape';
import { isValidHttpUrl } from '@/lib/utils';

/** URL metadata scraping core; auth and rate limiting live in the actions layer. */

export type FetchMetaResult =
  | { ok: true; title: string; description: string; iconUrl: string | null }
  | { ok: false; message: string };

const MAX_HOPS = 3;
const TIMEOUT_MS = 8_000;
const USER_AGENT = PROJECT_USER_AGENT;

/** Scrapes title, description, and icon from one URL. */
export async function fetchUrlMeta(url: string): Promise<FetchMetaResult> {
  if (typeof url !== 'string' || !isValidHttpUrl(url.trim())) {
    return { ok: false, message: '请输入 http(s):// 开头的完整链接' };
  }

  const pinned = new Map<string, Array<{ address: string; family: number }>>();
  const agent = new Agent({
    connect: { lookup: pinnedLookup(pinned) },
    connectTimeout: TIMEOUT_MS,
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  });

  try {
    let current = new URL(url.trim());

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      // Re-validates every redirect hop.
      const addresses = await resolveAndValidate(current.hostname);
      pinned.set(current.hostname, addresses);

      const response = await undiciFetch(current, {
        dispatcher: agent,
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT_MS),
        headers: {
          'user-agent': USER_AGENT,
          accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.5',
          'accept-language': 'zh-CN,zh;q=0.9,en;q=0.6',
        },
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        if (hop === MAX_HOPS) {
          return { ok: false, message: '重定向次数过多，请手动填写' };
        }
        try {
          current = new URL(location, current);
        } catch {
          return { ok: false, message: '重定向地址无效' };
        }
        if (current.protocol !== 'http:' && current.protocol !== 'https:') {
          return { ok: false, message: '重定向到了非 http(s) 地址，已拒绝' };
        }
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, message: `目标站点返回 HTTP ${response.status}` };
      }

      const html = await readBodyCapped(
        response.body,
        MAX_HTML_BYTES,
        response.headers.get('content-type'),
      );
      const meta = parseHtmlMeta(html, current);

      if (!meta.title && !meta.description) {
        return { ok: false, message: '页面里没有解析到标题或描述，请手动填写' };
      }
      return {
        ok: true,
        title: meta.title,
        description: meta.description,
        iconUrl: meta.iconUrl,
      };
    }

    return { ok: false, message: '重定向次数过多，请手动填写' };
  } catch (error) {
    if (error instanceof FetchBlockedError) {
      return { ok: false, message: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|aborted|terminated/i.test(message)) {
      return { ok: false, message: `抓取超时（${TIMEOUT_MS / 1000} 秒），请手动填写` };
    }
    return { ok: false, message: `抓取失败：${message.slice(0, 120)}` };
  } finally {
    await agent.close().catch(() => {});
  }
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
