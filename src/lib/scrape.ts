import 'server-only';

import type { LookupFunction } from 'node:net';
import { lookup as dnsLookupPromises } from 'node:dns/promises';
import type { Response as UndiciResponse } from 'undici';

import { decodeEntities, sanitizeScrapedText } from '@/lib/utils';
import { LIMITS } from '@/lib/validation';

/** Server-side URL metadata scraping helpers. */

export const MAX_HTML_BYTES = 1_048_576; // 1MB; metadata appears early in <head>

export class FetchBlockedError extends Error {}

// ── IP blocklist ─────────────────────────────────────────────────────────────

/** True for private, loopback, link-local, CGNAT, multicast and reserved space. */
export function isBlockedIp(ip: string): boolean {
  const value = ip.trim().toLowerCase();

  // IPv4-mapped IPv6 (::ffff:10.0.0.1); check the embedded v4.
  const mapped = value.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (mapped?.[1]) return isBlockedIp(mapped[1]);

  const v4 = value.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const a = Number(v4[1]);
    const b = Number(v4[2]);
    if (a === 0) return true; // 0.0.0.0/8 "this network"
    if (a === 10) return true; // private
    if (a === 127) return true; // loopback
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a === 192 && b === 0) return true; // IETF reserved
    if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
    if (a >= 224) return true; // multicast + reserved
    return false;
  }

  if (value === '::' || value === '::1') return true; // unspecified / loopback
  const firstGroup = value.split(':')[0] ?? '';
  const head = Number.parseInt(firstGroup || '0', 16);
  if (Number.isFinite(head)) {
    if ((head & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
    if ((head & 0xffc0) === 0xfe80) return true; // fe80::/10 link-local
  }
  if (value.startsWith('64:ff9b')) return true; // NAT64 well-known prefix
  return false;
}

/** Resolves a hostname and rejects the request if ANY address is internal. */
export async function resolveAndValidate(hostname: string): Promise<
  Array<{ address: string; family: number }>
> {
  // An IP literal passes through dns.lookup unchanged and still gets checked.
  const addresses = await dnsLookupPromises(hostname, { all: true, verbatim: true });
  if (addresses.length === 0) {
    throw new FetchBlockedError(`无法解析主机 ${hostname}`);
  }
  for (const entry of addresses) {
    if (isBlockedIp(entry.address)) {
      throw new FetchBlockedError('目标地址指向内网或保留网段，已拒绝');
    }
  }
  return addresses.map((entry) => ({
    address: entry.address,
    family: entry.family,
  }));
}

/** Returns a DNS lookup pinned to pre-validated addresses (DNS rebinding defense). */
export function pinnedLookup(
  pinned: Map<string, Array<{ address: string; family: number }>>,
): LookupFunction {
  const fn = (hostname: string, options: unknown, callback?: unknown): void => {
    const cb = (
      typeof options === 'function' ? options : callback
    ) as (...args: unknown[]) => void;
    const opts = (
      typeof options === 'object' && options !== null ? options : {}
    ) as { all?: boolean };

    const entries = pinned.get(hostname);
    if (!entries || entries.length === 0) {
      const error = Object.assign(
        new Error(`DNS resolution blocked for ${hostname}`),
        { code: 'ENOTFOUND' },
      );
      cb(error);
      return;
    }
    if (opts.all) {
      cb(null, entries);
      return;
    }
    const first = entries[0]!;
    cb(null, first.address, first.family);
  };
  return fn as unknown as LookupFunction;
}

// ── HTML parsing ────────────────────────────────────────────────────────────

function attr(tag: string, name: string): string | null {
  const match = tag.match(
    new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'),
  );
  if (!match) return null;
  return decodeEntities(match[2] ?? match[3] ?? match[4] ?? '').trim();
}

/** Strips " - 副标题" style suffixes; page titles lead with the main name. */
function mainTitle(raw: string): string {
  const first = raw.split(/\s+[-–—|｜·]\s+/)[0] ?? '';
  return first.trim() || raw.trim();
}

export function parseHtmlMeta(
  html: string,
  baseUrl: URL,
): { title: string; description: string; iconUrl: string | null } {
  let title = '';
  const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch?.[1]) {
    title = mainTitle(sanitizeScrapedText(decodeEntities(titleMatch[1]), LIMITS.title));
  }

  let description = '';
  let ogDescription = '';
  for (const tag of html.matchAll(/<meta[^>]+>/gi)) {
    const name = (
      attr(tag[0], 'name') ??
      attr(tag[0], 'property') ??
      ''
    ).toLowerCase();
    const content = attr(tag[0], 'content');
    if (!content) continue;
    if (name === 'description' && !description) {
      description = sanitizeScrapedText(decodeEntities(content), LIMITS.description);
    } else if (
      (name === 'og:description' || name === 'twitter:description') &&
      !ogDescription
    ) {
      ogDescription = sanitizeScrapedText(decodeEntities(content), LIMITS.description);
    }
  }

  let iconUrl: string | null = null;
  for (const tag of html.matchAll(/<link[^>]+>/gi)) {
    const rel = (attr(tag[0], 'rel') ?? '').toLowerCase();
    const relTokens = rel.split(/\s+/);
    if (!relTokens.includes('icon') && !relTokens.includes('apple-touch-icon')) {
      continue;
    }
    const href = attr(tag[0], 'href');
    if (!href) continue;
    try {
      const resolved = new URL(href, baseUrl);
      if (resolved.protocol === 'http:' || resolved.protocol === 'https:') {
        iconUrl = resolved.toString().slice(0, 2048);
        // Stop at the first exact rel="icon".
        if (relTokens.includes('icon')) break;
      }
    } catch {
      // Skips hrefs that do not resolve.
    }
  }

  return { title, description: description || ogDescription, iconUrl };
}

/** Reads at most `limit` bytes from a response body. */
export async function readBytesCapped(
  body: UndiciResponse['body'],
  limit: number,
): Promise<Uint8Array> {
  const reader = body?.getReader();
  if (!reader) return new Uint8Array(0);

  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      const bytes = value as Uint8Array;
      chunks.push(bytes);
      total += bytes.byteLength;
      if (total >= limit) break;
    }
  } finally {
    await reader.cancel().catch(() => {});
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/** Reads at most `limit` bytes from a response body and decodes them. */
export async function readBodyCapped(
  body: UndiciResponse['body'],
  limit: number,
  contentType?: string | null,
): Promise<string> {
  return decodeWithCharset(await readBytesCapped(body, limit), contentType);
}

/**
 * Decodes response bytes honoring the declared charset (Content-Type header
 * or a <meta charset> tag), then falls back to GBK when the bytes are not
 * valid UTF-8 — legacy Chinese sites (Discuz forums) often serve GBK while
 * declaring UTF-8. GBK decoding also covers gb2312/gb18030.
 */
function decodeWithCharset(
  bytes: Uint8Array,
  contentType?: string | null,
): string {
  const declared =
    /charset=["']?([\w-]+)/i.exec(contentType ?? '')?.[1]?.toLowerCase() ??
    /charset\s*=\s*["']?([\w-]+)/i.exec(
      new TextDecoder('latin1').decode(bytes.subarray(0, 2048)),
    )?.[1]?.toLowerCase();

  if (declared && declared !== 'utf-8' && declared !== 'utf8') {
    try {
      return new TextDecoder(declared).decode(bytes);
    } catch {
      // Unsupported label; fall through to UTF-8 validation.
    }
  }

  try {
    // Strict decode proves the payload really is UTF-8. The tail is dropped
    // in case the read stopped mid-character at the size cap.
    return new TextDecoder('utf-8', { fatal: true }).decode(
      bytes.subarray(0, Math.max(0, bytes.length - 4)),
    );
  } catch {
    try {
      return new TextDecoder('gbk').decode(bytes);
    } catch {
      return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    }
  }
}
