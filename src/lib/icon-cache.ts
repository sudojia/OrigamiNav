import 'server-only';

import {
  getCachedIcon,
  putCachedIcon,
  ICON_MISS_TTL_MS,
  ICON_TTL_MS,
  type CachedIcon,
} from '@/db/queries/icons';
import { getSiteSettings } from '@/db/queries/settings';
import { fetchIconBytes } from '@/lib/fetch-icon';
import { iconSourceTemplates } from '@/lib/icon-providers';
import { ICON_TEMPLATE_PLACEHOLDER } from '@/types/nav';

/** Bookmark icon resolution against the database cache. */

export type ResolvedIcon = { mimeType: string; bytes: Uint8Array };

/** A bare hostname: no scheme, port, path, credentials or IP literal. */
const HOST_PATTERN =
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/;
const MAX_HOST_LENGTH = 253;

/**
 * Keeps the route from being asked to fetch for malformed or oversized hosts.
 * A letter is required so IPv4 literals, which are valid DNS shapes, are
 * rejected here rather than at the connection.
 */
function isCacheableHost(host: string): boolean {
  return (
    host.length <= MAX_HOST_LENGTH && /[a-z]/.test(host) && HOST_PATTERN.test(host)
  );
}

/**
 * Resolves a bookmark icon against the database cache: a fresh row is served as
 * is, a miss or an expired row is refetched from the bookmark's own icon URL
 * and then the configured source chain. `manualUrl` comes from the database,
 * never from the request, so the route cannot be used to fetch an arbitrary URL.
 */
export async function resolveIcon(
  host: string,
  manualUrl: string | null,
): Promise<ResolvedIcon | null> {
  if (!isCacheableHost(host)) return null;

  const cached = await getCachedIcon(host);
  if (cached && !isExpired(cached)) {
    return cached.data
      ? { mimeType: cached.mimeType, bytes: Buffer.from(cached.data, 'base64') }
      : null;
  }

  const settings = await getSiteSettings();
  const urls = iconSourceTemplates(
    settings.iconService,
    settings.iconCustomTemplate,
  ).map((template) => template.replaceAll(ICON_TEMPLATE_PLACEHOLDER, host));
  const fetched = await firstIcon(manualUrl ? [manualUrl, ...urls] : urls);

  await putCachedIcon({
    host,
    mimeType: fetched?.mimeType ?? '',
    data: fetched ? Buffer.from(fetched.bytes).toString('base64') : '',
  });

  return fetched;
}

/** Tries each source in order; the first usable image wins. */
async function firstIcon(urls: string[]): Promise<ResolvedIcon | null> {
  for (const url of urls) {
    const icon = await fetchIconBytes(url);
    if (icon) return icon;
  }
  return null;
}

/** Resolved icons outlive misses: a site may publish a favicon at any time. */
function isExpired(icon: CachedIcon): boolean {
  const age = Date.now() - Date.parse(icon.fetchedAt);
  if (!Number.isFinite(age)) return true;
  return age > (icon.data ? ICON_TTL_MS : ICON_MISS_TTL_MS);
}
