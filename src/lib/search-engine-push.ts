import 'server-only';

import { PROJECT_USER_AGENT } from '@/lib/project-links';

/** Search-engine URL submission: IndexNow plus Baidu's push API. */

export type PushEngine = 'indexnow' | 'baidu';

export type PushOutcome = {
  engine: PushEngine;
  ok: boolean;
  message: string;
};

const TIMEOUT_MS = 10_000;
const MAX_BODY_CHARS = 4_096;

const INDEXNOW_ENDPOINT = 'https://api.indexnow.org/indexnow';
/** Baidu's documented endpoint; only public URLs and the site token are sent. */
const BAIDU_ENDPOINT = 'http://data.zz.baidu.com/urls';

const INDEXNOW_ERRORS: Record<number, string> = {
  400: '请求格式不正确',
  403: '密钥文件不可访问或内容不匹配，请确认站点地址可从公网访问',
  422: 'URL 不属于该域名，或密钥不匹配',
  429: '提交过于频繁，请稍后再试',
};

const BAIDU_ERRORS: Record<number, string> = {
  400: '站点参数错误或今日配额已用完',
  401: '推送 token 无效',
  403: '该 token 没有此站点的推送权限',
  429: '今日推送配额已用完',
};

/** Reads a response body with a cap, so a hostile body cannot exhaust memory. */
async function readCapped(response: Response): Promise<string> {
  const text = await response.text().catch(() => '');
  return text.slice(0, MAX_BODY_CHARS);
}

function networkMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted|terminated/i.test(message)) {
    return `请求超时（${TIMEOUT_MS / 1000} 秒）`;
  }
  return message.slice(0, 120);
}

function skip(engine: PushEngine, message: string): PushOutcome {
  return { engine, ok: false, message: `${message}，已跳过` };
}

/** Submits the URL list to IndexNow; the key file must resolve at the site root. */
async function pushIndexNow(input: {
  siteUrl: string;
  key: string;
  urls: string[];
}): Promise<PushOutcome> {
  try {
    const response = await fetch(INDEXNOW_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json; charset=utf-8',
        'user-agent': PROJECT_USER_AGENT,
      },
      body: JSON.stringify({
        host: new URL(input.siteUrl).host,
        key: input.key,
        keyLocation: `${input.siteUrl}/${input.key}.txt`,
        urlList: input.urls,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await readCapped(response);
    if (response.status === 200 || response.status === 202) {
      return {
        engine: 'indexnow',
        ok: true,
        message: `已提交 ${input.urls.length} 个 URL（HTTP ${response.status}）`,
      };
    }
    const reason = INDEXNOW_ERRORS[response.status] ?? `HTTP ${response.status}`;
    return {
      engine: 'indexnow',
      ok: false,
      message: `${reason}${body ? `：${body.slice(0, 120)}` : ''}`,
    };
  } catch (error) {
    return {
      engine: 'indexnow',
      ok: false,
      message: `请求失败：${networkMessage(error)}`,
    };
  }
}

/** Submits the URL list through Baidu's 普通/快速收录 API. */
async function pushBaidu(input: {
  siteUrl: string;
  token: string;
  urls: string[];
}): Promise<PushOutcome> {
  const endpoint = `${BAIDU_ENDPOINT}?site=${encodeURIComponent(input.siteUrl)}&token=${encodeURIComponent(input.token)}`;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'user-agent': PROJECT_USER_AGENT,
      },
      // Baidu takes one URL per line.
      body: input.urls.join('\n'),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    const body = await readCapped(response);
    let parsed: {
      success?: number;
      remain?: number;
      error?: number;
      message?: string;
    } = {};
    try {
      parsed = JSON.parse(body) as typeof parsed;
    } catch {
      // A non-JSON body falls through to the HTTP status below.
    }

    if (response.ok && typeof parsed.success === 'number') {
      return {
        engine: 'baidu',
        ok: true,
        message: `成功推送 ${parsed.success} 条，今日剩余配额 ${parsed.remain ?? '未知'}`,
      };
    }
    const reason =
      BAIDU_ERRORS[parsed.error ?? response.status] ?? `HTTP ${response.status}`;
    return {
      engine: 'baidu',
      ok: false,
      message: `${reason}${parsed.message ? `：${parsed.message}` : ''}`,
    };
  } catch (error) {
    return {
      engine: 'baidu',
      ok: false,
      message: `请求失败：${networkMessage(error)}`,
    };
  }
}

/** Submits URLs to every configured engine; unconfigured engines are skipped. */
export async function pushUrlsToSearchEngines(input: {
  siteUrl: string;
  urls: string[];
  indexNowKey: string;
  baiduToken: string | null;
}): Promise<PushOutcome[]> {
  return Promise.all([
    input.indexNowKey
      ? pushIndexNow({
          siteUrl: input.siteUrl,
          key: input.indexNowKey,
          urls: input.urls,
        })
      : skip('indexnow', '未配置 IndexNow 密钥'),
    input.baiduToken
      ? pushBaidu({
          siteUrl: input.siteUrl,
          token: input.baiduToken,
          urls: input.urls,
        })
      : skip('baidu', '未配置百度推送 token'),
  ]);
}
