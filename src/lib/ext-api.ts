import 'server-only';

import { timingSafeEqual } from 'node:crypto';

import { getSecretValue, SECRET_KEYS } from '@/db/queries/settings';

/**
 * Bearer-token auth + open CORS for /api/ext/*. The SameSite=Lax session
 * cookie can't reach cross-origin extension fetches, so the token is the
 * only credential.
 */

export const EXT_CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
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

/** Validates `Authorization: Bearer`; false when no token is configured. */
export async function verifyExtToken(request: Request): Promise<boolean> {
  const header = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(\S+)$/i.exec(header)?.[1];
  if (!token) return false;

  const stored = await getSecretValue(SECRET_KEYS.extToken);
  if (!stored) return false;
  return secretsMatch(token, stored);
}
