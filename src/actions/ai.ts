'use server';

import { getAiConfig, getAiConfigStatus } from '@/db/queries/ai';
import { deleteSecret, SECRET_KEYS } from '@/db/queries/settings';
import { guardActionWithAdmin as guard } from '@/lib/action-guard';
import {
  AiError,
  listModels,
  normalizeBaseUrl,
  toAiProtocol,
} from '@/lib/ai';
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

function aiMessage(error: unknown): string {
  if (error instanceof AiError) return error.message;
  const reason = error instanceof Error ? error.message : String(error);
  return reason.slice(0, 200);
}
