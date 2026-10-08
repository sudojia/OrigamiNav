import 'server-only';

import type { Metadata } from 'next';

import { VERIFICATION_TARGETS, type SiteSettings } from '@/types/nav';
import { truncate } from '@/lib/utils';

/** Site-level SEO metadata shared by the layout, the home page and category pages. */

const FALLBACK_DESCRIPTION =
  '一个自托管的开源书签导航站，只依赖一个标准 Postgres 连接串。';

/**
 * Normalizes an operator-supplied site URL: http(s) only, no trailing slash and
 * no query/hash; a deployment sub-path is kept.
 */
export function normalizeSiteUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;

  return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
}

/** Absolute URL for one path on this site; null when no base URL is configured. */
export function absoluteSiteUrl(
  settings: SiteSettings,
  path: string,
): string | null {
  return settings.siteUrl ? `${settings.siteUrl}${path}` : null;
}

/**
 * Verification code from whatever the admin pasted: the bare token, or a whole
 * `<meta … content="…">` tag copied from the search engine console.
 */
export function normalizeVerificationCode(value: string): string {
  const trimmed = value.trim();
  const content = trimmed.match(/content\s*=\s*["']([^"']*)["']/i);
  return content?.[1] !== undefined ? content[1].trim() : trimmed;
}

/** Site name used in titles and structured data. */
export function siteTitle(settings: SiteSettings): string {
  return settings.siteName || 'OrigamiNav';
}

/** Meta description fallback chain shared by every public page. */
export function siteDescription(settings: SiteSettings): string {
  return settings.description || settings.tagline || FALLBACK_DESCRIPTION;
}

/** Description of one category page: the admin's own text, else a template. */
export function categoryDescription(
  settings: SiteSettings,
  category: { name: string; description: string },
): string {
  if (category.description) return category.description;
  const fallback = `${siteTitle(settings)} 的「${category.name}」分类书签导航`;
  return settings.description
    ? `${fallback}。${truncate(settings.description, 100)}`
    : fallback;
}

/**
 * Canonical, OpenGraph and Twitter block for one page. A nested segment's
 * `openGraph` replaces its parent's outright, so every page that declares one
 * re-declares all of it through this helper. `path` is omitted by the root
 * layout, which has no single canonical URL.
 */
export function pageSocialMetadata(
  settings: SiteSettings,
  page: { title: string; description: string; path?: string },
): Pick<Metadata, 'alternates' | 'openGraph' | 'twitter'> {
  const url = page.path ? absoluteSiteUrl(settings, page.path) : null;
  const images = settings.logoUrl ? [settings.logoUrl] : undefined;

  return {
    // Omitted without a base URL: a relative canonical would resolve to the request host.
    ...(url && page.path ? { alternates: { canonical: page.path } } : {}),
    openGraph: {
      title: page.title,
      description: page.description,
      type: 'website',
      siteName: siteTitle(settings),
      locale: 'zh_CN',
      ...(url ? { url } : {}),
      ...(images ? { images } : {}),
    },
    twitter: {
      card: images ? 'summary_large_image' : 'summary',
      title: page.title,
      description: page.description,
      ...(images ? { images } : {}),
    },
  };
}

/** Ownership `<meta>` tags for every configured search engine. */
export function verificationMetadata(
  settings: SiteSettings,
): Metadata['verification'] | undefined {
  const entries = VERIFICATION_TARGETS.filter(
    (target) => settings.verifications[target.id] !== '',
  ).map(
    (target) => [target.metaName, settings.verifications[target.id]] as const,
  );
  if (entries.length === 0) return undefined;
  return { other: Object.fromEntries(entries) };
}
