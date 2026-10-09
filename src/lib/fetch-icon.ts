import 'server-only';

import { ICON_FETCH_USER_AGENT } from '@/lib/project-links';
import { fetchFollowing } from '@/lib/safe-fetch';
import { readBytesLimited } from '@/lib/scrape';

/** Fetches one bookmark icon; null when the response is not a usable image. */

/** Cap on a single icon; favicons are small, and the cache stores them base64. */
const MAX_ICON_BYTES = 262_144; // 256KB

export type FetchedIcon = { mimeType: string; bytes: Uint8Array };

/** `timeoutMs` is the caller's per-source slice of its own chain budget. */
export async function fetchIconBytes(
  url: string,
  timeoutMs: number,
): Promise<FetchedIcon | null> {
  const outcome = await fetchFollowing(
    url,
    {
      accept: 'image/*,*/*;q=0.5',
      timeoutMs,
      userAgent: ICON_FETCH_USER_AGENT,
    },
    async (response): Promise<FetchedIcon | null> => {
      const { bytes, truncated } = await readBytesLimited(
        response.body,
        MAX_ICON_BYTES,
      );
      // A cut-off image keeps its magic bytes, so it would be typed as valid and
      // cached for a week while the browser fails to render it.
      if (truncated) return null;

      const mimeType = detectImageMime(bytes);
      return mimeType ? { mimeType, bytes } : null;
    },
  );

  return outcome.ok ? outcome.value : null;
}

/**
 * Types the payload from its own bytes. Provider content types are unreliable
 * (icons often arrive as application/octet-stream) and a wrong one would be
 * served straight back to the browser.
 */
function detectImageMime(bytes: Uint8Array): string | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47])) return 'image/png';
  if (startsWith(bytes, [0x47, 0x49, 0x46, 0x38])) return 'image/gif';
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x42, 0x4d])) return 'image/bmp';
  if (startsWith(bytes, [0x00, 0x00, 0x01, 0x00])) return 'image/x-icon';
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && asciiAt(bytes, 8, 'WEBP')) {
    return 'image/webp';
  }
  return isSvg(bytes) ? 'image/svg+xml' : null;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  return prefix.every((byte, index) => bytes[index] === byte);
}

function asciiAt(bytes: Uint8Array, offset: number, text: string): boolean {
  if (bytes.length < offset + text.length) return false;
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
}

/** SVG is text, so it is recognized from its markup rather than a signature. */
function isSvg(bytes: Uint8Array): boolean {
  const head = new TextDecoder('utf-8', { fatal: false })
    .decode(bytes.subarray(0, 512))
    .trimStart()
    .toLowerCase();
  return head.startsWith('<svg') || (head.startsWith('<?xml') && head.includes('<svg'));
}
