import 'server-only';

import { isAiProtocol, type AiProtocol } from '@/types/nav';

/**
 * Minimal client for the OpenAI and Anthropic wire protocols. No private-IP
 * blocklist: requests go to an admin-configured address.
 */

export class AiError extends Error {
  constructor(
    message: string,
    /** HTTP status from the provider; 0 for transport/timeout/parse failures. */
    readonly status = 0,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

/** True for failures worth one retry: transport, timeout, 429 and provider 5xx. */
export function isTransientAiError(error: unknown): boolean {
  if (!(error instanceof AiError)) return false;
  return error.status === 0 || error.status === 429 || error.status >= 500;
}

const TIMEOUT_MS = 20_000;

/**
 * Completion budget for small structured outputs (connection test, tagging);
 * generous because reasoning models spend much of it thinking before the
 * answer, and max_tokens only caps usage, never inflates it.
 */
export const COMPLETION_TOKEN_BUDGET = 2000;

/** Anthropic API version header. */
const ANTHROPIC_VERSION = '2023-06-01';

/** AI provider config; protocol selects the wire format. */
export type AiProviderConfig = {
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
};

/** Strips trailing slashes from a base URL. */
export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

function endpoint(baseUrl: string, path: string): string {
  return `${normalizeBaseUrl(baseUrl)}${path}`;
}

/** Builds an Anthropic endpoint, stripping a trailing /v1 from the base URL. */
function anthropicEndpoint(baseUrl: string, path: string): string {
  const base = normalizeBaseUrl(baseUrl).replace(/\/v1$/, '');
  return `${base}${path}`;
}

function anthropicHeaders(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': ANTHROPIC_VERSION,
    'Content-Type': 'application/json',
  };
}

/** Maps an HTTP failure to an admin-facing message, including up to 200 chars of the body. */
async function describeFailure(
  response: Response,
  protocol: AiProtocol,
): Promise<string> {
  let detail = '';
  try {
    detail = (await response.text()).replace(/\s+/g, ' ').slice(0, 200);
  } catch {
    /* body already consumed or unreadable */
  }
  if (response.status === 401 || response.status === 403) {
    // Provider bodies often name the real cause (model entitlement, quota…).
    return `API Key 无效或没有权限${detail ? `：${detail}` : ''}`;
  }
  if (response.status === 404) {
    const hint =
      protocol === 'anthropic'
        ? 'Anthropic 协议的 Base URL 通常填到域名即可，例如 https://api.anthropic.com'
        : '请确认 baseUrl 是否需要以 /v1 结尾';
    return `接口地址不对（404）。${hint}${detail ? `：${detail}` : ''}`;
  }
  return `请求失败（${response.status}）${detail ? `：${detail}` : ''}`;
}

async function requestJson(
  url: string,
  init: RequestInit,
  protocol: AiProtocol = 'openai',
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: 'no-store',
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new AiError(`无法连接：${reason}`);
  }
  if (!response.ok) {
    throw new AiError(await describeFailure(response, protocol), response.status);
  }
  try {
    return await response.json();
  } catch {
    throw new AiError('返回内容不是合法 JSON');
  }
}

/** Lists provider model ids, de-duplicated and sorted. Parses `{ data: [{ id }] }`. */
export async function listModels(config: {
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
}): Promise<string[]> {
  const payload =
    config.protocol === 'anthropic'
      ? await requestJson(
          anthropicEndpoint(config.baseUrl, '/v1/models'),
          { headers: anthropicHeaders(config.apiKey) },
          'anthropic',
        )
      : await requestJson(endpoint(config.baseUrl, '/models'), {
          headers: { Authorization: `Bearer ${config.apiKey}` },
        });

  const data = (payload as { data?: unknown })?.data;
  if (!Array.isArray(data)) {
    throw new AiError(
      config.protocol === 'anthropic'
        ? '模型列表格式不符合 Anthropic 协议'
        : '模型列表格式不符合 OpenAI 协议',
    );
  }
  const ids = data
    .map((entry) =>
      typeof entry === 'object' && entry !== null
        ? (entry as { id?: unknown }).id
        : undefined,
    )
    .filter((id): id is string => typeof id === 'string' && id.length > 0);

  return Array.from(new Set(ids)).sort((a, b) => a.localeCompare(b));
}

export type ChatMessage = { role: 'system' | 'user'; content: string };

/** Runs one chat completion and returns assistant text. Dispatches on the configured protocol. */
export async function chatCompletion(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: { maxTokens?: number } = {},
): Promise<string> {
  return config.protocol === 'anthropic'
    ? anthropicCompletion(config, messages, options)
    : openAiCompletion(config, messages, options);
}

/**
 * POST {base}/chat/completions (OpenAI dialect). On 400: retries without
 * `response_format`, or renames max_tokens when the model demands the newer
 * `max_completion_tokens`.
 */
async function openAiCompletion(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: { maxTokens?: number },
): Promise<string> {
  const url = endpoint(config.baseUrl, '/chat/completions');

  const send = (body: Record<string, unknown>) =>
    requestJson(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

  const body = {
    model: config.model,
    messages,
    temperature: 0.2,
    // Some gateways default to very long outputs when unset.
    ...(options.maxTokens ? { max_tokens: options.maxTokens } : {}),
  };

  let payload: unknown;
  try {
    payload = await send({ ...body, response_format: { type: 'json_object' } });
  } catch (error) {
    if (!(error instanceof AiError) || error.status !== 400) throw error;
    // OpenAI reasoning models reject max_tokens; retry with the newer name.
    if (/max_completion_tokens/i.test(error.message)) {
      const renamed = {
        model: config.model,
        messages,
        temperature: 0.2,
        ...(options.maxTokens
          ? { max_completion_tokens: options.maxTokens }
          : {}),
      };
      try {
        payload = await send({
          ...renamed,
          response_format: { type: 'json_object' },
        });
      } catch (retryError) {
        if (!(retryError instanceof AiError) || retryError.status !== 400) {
          throw retryError;
        }
        payload = await send(renamed);
      }
    } else {
      payload = await send(body);
    }
  }

  const choice = (
    payload as {
      choices?: Array<{
        finish_reason?: unknown;
        message?: { content?: unknown };
      }>;
    }
  )?.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new AiError(describeEmptyContent(choice?.finish_reason));
  }
  return content;
}

/** Explains an empty completion; reasoning models can spend the whole budget thinking. */
function describeEmptyContent(finishReason: unknown): string {
  if (finishReason === 'length') {
    return '模型没有返回内容：输出在正式回答前就被截断（finish_reason=length），' +
      '常见于推理模型把输出上限耗在思考阶段，可换非推理模型或调大输出上限';
  }
  return '模型没有返回内容';
}

/**
 * POST {base}/v1/messages (Anthropic dialect). System messages go in a
 * top-level `system` field; the reply is a list of content blocks.
 */
async function anthropicCompletion(
  config: AiProviderConfig,
  messages: ChatMessage[],
  options: { maxTokens?: number },
): Promise<string> {
  const system = messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n\n');
  const rest = messages
    .filter((message) => message.role !== 'system')
    .map(({ role, content }) => ({ role, content }));

  const payload = await requestJson(
    anthropicEndpoint(config.baseUrl, '/v1/messages'),
    {
      method: 'POST',
      headers: anthropicHeaders(config.apiKey),
      body: JSON.stringify({
        model: config.model,
        max_tokens: options.maxTokens ?? 1024,
        temperature: 0.2,
        ...(system ? { system } : {}),
        messages: rest,
      }),
    },
    'anthropic',
  );

  const blocks = (
    payload as { content?: Array<{ type?: unknown; text?: unknown }> }
  )?.content;
  const text = Array.isArray(blocks)
    ? blocks
        .filter(
          (block) =>
            typeof block === 'object' &&
            block !== null &&
            block.type === 'text' &&
            typeof block.text === 'string',
        )
        .map((block) => block.text)
        .join('')
    : '';
  if (!text.trim()) {
    throw new AiError('模型没有返回内容');
  }
  return text;
}

/** Extracts the outermost JSON object from a model reply, stripping code fences. */
export function parseJsonObject(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?/i, '').replace(/```\s*$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) {
    throw new AiError('模型返回的内容不是 JSON');
  }
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    throw new AiError('模型返回的 JSON 无法解析');
  }
}

/** Narrows an untrusted value to `AiProtocol`, defaulting to 'openai'. */
export function toAiProtocol(value: unknown): AiProtocol {
  return isAiProtocol(value) ? value : 'openai';
}
