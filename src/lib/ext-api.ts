import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { getSecretValue, SECRET_KEYS } from '@/db/queries/settings';
import { createFixedWindowLimiter, trustedClientKey } from '@/lib/rate-limit';

/**
 * Bearer-token auth + open CORS for /api/ext/*. The SameSite=Lax session
 * cookie can't reach cross-origin extension fetches, so the token is the
 * only credential.
 */

 const EXT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  'Access-Control-Max-Age': '86400',
};

/** CORS preflight (204). */
export function extPreflight(): Response {
  return new Response(null, { status: 204, headers: EXT_CORS_HEADERS });
}

/** JSON response with the extension CORS headers. */
export function extJson(data: unknown, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  for (const [key, value] of Object.entries(EXT_CORS_HEADERS)) {
    headers.set(key, value);
  }
  return Response.json(data, { ...init, headers });
}

/** Constant-time compare (length-checked). */
function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Short-lived cache of the stored ext token; saves a DB round trip per
 * /api/ext/* request. Settings actions clear it on rotation. */
let cachedExtToken: { value: string | null; expiresAt: number } | null = null;
const EXT_TOKEN_CACHE_TTL_MS = 30_000;

/** Drops the cached token; next verify re-reads the secrets table. */
export function invalidateExtTokenCache(): void {
  cachedExtToken = null;
}

/** Lockout after repeated failed token attempts; window slides per key.
 * Without TRUSTED_PROXY all clients share one key, so a lockout there is
 * the accepted tradeoff for bounding the guess space. */
const EXT_TOKEN_FAIL_WINDOW_MS = 5 * 60_000;
const EXT_TOKEN_FAIL_MAX = 20;
const extTokenFailLimiter = createFixedWindowLimiter({
  windowMs: EXT_TOKEN_FAIL_WINDOW_MS,
  max: EXT_TOKEN_FAIL_MAX,
  maxKeys: 1_000,
});

/** Validates `Authorization: Bearer`; false when no token is configured. */
export async function verifyExtToken(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return false;

  const failKey = trustedClientKey(request.headers) ?? 'ip:unknown';
  if (!extTokenFailLimiter.hasCapacity(failKey)) return false;

  const now = Date.now();
  if (!cachedExtToken || cachedExtToken.expiresAt < now) {
    cachedExtToken = {
      value: await getSecretValue(SECRET_KEYS.extToken),
      expiresAt: now + EXT_TOKEN_CACHE_TTL_MS,
    };
  }
  const stored = cachedExtToken.value;
  if (!stored) return false;

  if (!secretsMatch(token, stored)) {
    extTokenFailLimiter.consume(failKey);
    return false;
  }
  extTokenFailLimiter.reset(failKey);
  return true;
}
