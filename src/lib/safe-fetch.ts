import 'server-only';

import { Agent, fetch as undiciFetch, type Response as UndiciResponse } from 'undici';

import { PROJECT_USER_AGENT } from '@/lib/project-links';
import { FetchBlockedError, pinnedLookup, resolveAndValidate } from '@/lib/scrape';

/**
 * SSRF-safe fetch shared by every server-side outbound request: the hostname is
 * resolved and validated before each hop, the connection is pinned to those
 * addresses (DNS rebinding), and redirects are followed manually so each one is
 * revalidated. The dispatcher is closed once `consume` returns, so the body
 * must be read inside the callback.
 */

const MAX_HOPS = 3;

/** Why a fetch failed; each caller owns its own user-facing copy. */
export type FetchFailureReason =
  | 'blocked'
  | 'too-many-redirects'
  | 'bad-redirect'
  | 'http-status'
  | 'timeout'
  | 'failed';

export type FetchFailure = {
  ok: false;
  reason: FetchFailureReason;
  message: string;
  status?: number;
};

export type FetchOutcome<T> = { ok: true; value: T } | FetchFailure;

export async function fetchFollowing<T>(
  url: string,
  options: {
    accept: string;
    timeoutMs: number;
    headers?: Record<string, string>;
    /** Defaults to the project token; some endpoints require the `compatible` form. */
    userAgent?: string;
  },
  consume: (response: UndiciResponse, finalUrl: URL) => Promise<T>,
): Promise<FetchOutcome<T>> {
  const pinned = new Map<string, Array<{ address: string; family: number }>>();
  const agent = new Agent({
    connect: { lookup: pinnedLookup(pinned) },
    connectTimeout: options.timeoutMs,
    headersTimeout: options.timeoutMs,
    bodyTimeout: options.timeoutMs,
  });

  try {
    let current = new URL(url);

    for (let hop = 0; hop <= MAX_HOPS; hop += 1) {
      // Re-validates every redirect hop.
      const addresses = await resolveAndValidate(current.hostname);
      pinned.set(current.hostname, addresses);

      const response = await undiciFetch(current, {
        dispatcher: agent,
        redirect: 'manual',
        signal: AbortSignal.timeout(options.timeoutMs),
        headers: {
          'user-agent': options.userAgent ?? PROJECT_USER_AGENT,
          accept: options.accept,
          ...options.headers,
        },
      });

      const location = response.headers.get('location');
      if (response.status >= 300 && response.status < 400 && location) {
        await response.body?.cancel();
        if (hop === MAX_HOPS) {
          return { ok: false, reason: 'too-many-redirects', message: '重定向次数过多' };
        }
        try {
          current = new URL(location, current);
        } catch {
          return { ok: false, reason: 'bad-redirect', message: '重定向地址无效' };
        }
        if (current.protocol !== 'http:' && current.protocol !== 'https:') {
          return {
            ok: false,
            reason: 'blocked',
            message: '重定向到了非 http(s) 地址，已拒绝',
          };
        }
        continue;
      }

      if (!response.ok) {
        await response.body?.cancel();
        return {
          ok: false,
          reason: 'http-status',
          status: response.status,
          message: `目标站点返回 HTTP ${response.status}`,
        };
      }

      return { ok: true, value: await consume(response, current) };
    }

    return { ok: false, reason: 'too-many-redirects', message: '重定向次数过多' };
  } catch (error) {
    if (error instanceof FetchBlockedError) {
      return { ok: false, reason: 'blocked', message: error.message };
    }
    const message = error instanceof Error ? error.message : String(error);
    if (/timeout|aborted|terminated/i.test(message)) {
      return {
        ok: false,
        reason: 'timeout',
        message: `抓取超时（${options.timeoutMs / 1000} 秒）`,
      };
    }
    return {
      ok: false,
      reason: 'failed',
      message: `抓取失败：${message.slice(0, 120)}`,
    };
  } finally {
    await agent.close().catch(() => {});
  }
}
