/** Shapes shared by the server queries, the /api/nav payload and the UI. */

import { clampInt } from '@/lib/utils';

export type NavTag = {
  id: string;
  name: string;
  slug: string;
};

/** Nav tag carrying its bookmark count, for the filter bar. */
export type NavTagCount = NavTag & { count: number };

export type NavBookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hostname: string;
  /** True only in the admin payload; hidden rows are absent from public data. */
  hidden: boolean;
  tags: NavTag[];
};

export type NavCategory = {
  id: string;
  name: string;
  slug: string;
  description: string;
  /** Lucide icon name; kept for admin-side editing. */
  icon: string | null;
  /** Pre-rendered icon markup, so the public page needs no icon registry. */
  iconSvg: string | null;
  color: string | null;
  /** True only in the admin payload; hidden rows are absent from public data. */
  hidden: boolean;
  bookmarks: NavBookmark[];
};

export type NavData = {
  categories: NavCategory[];
  tags: NavTagCount[];
  /** False when the database was unreachable. */
  available: boolean;
  generatedAt: string;
};

export const EMPTY_NAV: NavData = {
  categories: [],
  tags: [],
  available: false,
  generatedAt: new Date(0).toISOString(),
};

/** One page of filtered results for the search box and command palette. */
export type NavSearchResult = {
  /** Matched categories, each holding only this page's matched bookmarks. */
  categories: NavCategory[];
  /** True when this page was full, so a next page may exist. */
  truncated: boolean;
  /** Opaque cursor for the next page; null on the last page. */
  cursor: string | null;
};

/** Search engines whose ownership token renders as a `<meta name>` tag. */
export const VERIFICATION_TARGETS = [
  {
    id: 'google',
    label: 'Google Search Console',
    metaName: 'google-site-verification',
    // Name of the meta-tag verification method in each console.
    method: 'HTML 标记',
    consoleUrl: 'https://search.google.com/search-console',
  },
  {
    id: 'bing',
    label: 'Bing Webmaster',
    metaName: 'msvalidate.01',
    method: 'Meta 标记',
    consoleUrl: 'https://www.bing.com/webmasters',
  },
  {
    id: 'baidu',
    label: '百度搜索资源平台',
    metaName: 'baidu-site-verification',
    method: 'HTML 标签验证',
    consoleUrl: 'https://ziyuan.baidu.com/site/index',
  },
  {
    id: 'sogou',
    label: '搜狗站长平台',
    metaName: 'sogou_site_verification',
    method: 'HTML 标签验证',
    consoleUrl: 'https://zhanzhang.sogou.com/',
  },
  {
    id: 'so360',
    label: '360 站长平台',
    metaName: '360-site-verification',
    method: 'HTML 标签验证',
    consoleUrl: 'https://zhanzhang.so.com/',
  },
  {
    id: 'yandex',
    label: 'Yandex Webmaster',
    metaName: 'yandex-verification',
    method: 'Meta tag',
    consoleUrl: 'https://webmaster.yandex.com/',
  },
] as const;

export type VerificationId = (typeof VERIFICATION_TARGETS)[number]['id'];

/** Storage key of one search-engine verification code. */
export function verificationKey(id: VerificationId): string {
  return `verify_${id}`;
}

/** All-empty verification codes; empty string means "not configured". */
export function emptyVerifications(): Record<VerificationId, string> {
  return Object.fromEntries(
    VERIFICATION_TARGETS.map((target) => [target.id, '']),
  ) as Record<VerificationId, string>;
}

/** Site-wide settings, with the defaults the setup wizard writes. */
export type SiteSettings = {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
  /** Public site base URL without a trailing slash; falls back to NEXT_PUBLIC_SITE_URL. */
  siteUrl: string | null;
  /** Allows search engines to index the public pages. */
  seoIndexing: boolean;
  /** Per-search-engine ownership tokens; empty string means unset. */
  verifications: Record<VerificationId, string>;
  /** Google Analytics 4 measurement ID; empty disables the loader. */
  analyticsGaId: string;
  /** Baidu Tongji site ID; empty disables the loader. */
  analyticsBaiduId: string;
  /** Self-hosted analytics script base URL (Umami, Plausible); empty disables it. */
  analyticsUmamiUrl: string;
  /** Website ID for the self-hosted analytics script. */
  analyticsUmamiId: string;
  /** IndexNow key served as /<key>.txt; empty disables submission. */
  indexNowKey: string;
  /** Where the browser-tab icon comes from. */
  faviconMode: FaviconMode;
  /** External icon URL; only used when faviconMode is 'url'. */
  faviconUrl: string | null;
  /** Timestamp of the uploaded icon, used to cache-bust /api/site-icon. */
  faviconVersion: string | null;
  /** Bookmark icon source for the public nav; 'auto' tries services in order. */
  iconService: IconService;
  /** URL template with a {domain} placeholder; only used when iconService is 'custom'. */
  iconCustomTemplate: string | null;
  defaultTheme: SkinId;
  cardColumns: number;
  /** Bookmarks shown per category on the public nav before "view all"; 0 = all. */
  categoryPreviewCount: number;
  /** Behaviour when deleting a category that still holds bookmarks. */
  categoryDeleteMode: CategoryDeleteMode;
  /** Days a trashed category or bookmark is kept before the next purge; 0 = keep. */
  trashRetentionDays: number;
  /** Session cookie lifetime in days, admin-configurable. */
  sessionMaxDays: number;
  /** Login attempts per minute before throttling, admin-configurable. */
  loginRateLimit: number;
  /** True when base URL, key and model are all set. */
  aiEnabled: boolean;
  /** Max characters per AI-generated tag, admin-configurable. */
  aiTagMaxLen: number;
  /** Max concurrent AI tag-generation requests, admin-configurable. */
  aiConcurrency: number;
  /**
   * False when the settings could not be read at all (no database configured,
   * or the query failed). Every other field is then a default, so `installed`
   * must not be read as "not installed" — it means "unknown".
   */
  available: boolean;
  installed: boolean;
};

export const SKIN_IDS = ['blue', 'geek', 'paper'] as const;
export type SkinId = (typeof SKIN_IDS)[number];

export function isSkinId(value: unknown): value is SkinId {
  return typeof value === 'string' && (SKIN_IDS as readonly string[]).includes(value);
}

export const FAVICON_MODES = ['none', 'url', 'upload'] as const;
export type FaviconMode = (typeof FAVICON_MODES)[number];

export function isFaviconMode(value: unknown): value is FaviconMode {
  return (
    typeof value === 'string' && (FAVICON_MODES as readonly string[]).includes(value)
  );
}

/**
 * Bookmark icon sources; 'auto' falls through services, 'custom' uses a
 * caller-supplied URL template, 'off' shows letter tiles.
 */
export const ICON_SERVICES = [
  'auto',
  'cccyun',
  'xinac',
  'faviconim',
  'duckduckgo',
  'google',
  'custom',
  'off',
] as const;
export type IconService = (typeof ICON_SERVICES)[number];

export function isIconService(value: unknown): value is IconService {
  return (
    typeof value === 'string' && (ICON_SERVICES as readonly string[]).includes(value)
  );
}

/** Placeholder inside the custom icon URL template that receives the hostname. */
export const ICON_TEMPLATE_PLACEHOLDER = '{domain}';

/** AI wire protocols: 'openai' chat/completions, 'anthropic' messages. */
export const AI_PROTOCOLS = ['openai', 'anthropic'] as const;
export type AiProtocol = (typeof AI_PROTOCOLS)[number];

export function isAiProtocol(value: unknown): value is AiProtocol {
  return (
    typeof value === 'string' && (AI_PROTOCOLS as readonly string[]).includes(value)
  );
}

/** Delete behaviour for a non-empty category: 'protected' or 'cascade'. */
export const CATEGORY_DELETE_MODES = ['protected', 'cascade'] as const;
export type CategoryDeleteMode = (typeof CATEGORY_DELETE_MODES)[number];

export function isCategoryDeleteMode(value: unknown): value is CategoryDeleteMode {
  return (
    typeof value === 'string' &&
    (CATEGORY_DELETE_MODES as readonly string[]).includes(value)
  );
}

/** Bounds for the AI tag-count range. */
export const AI_TAG_COUNT_BOUNDS = { min: 1, max: 10 } as const;

/** Default AI tag-count range. */
export const DEFAULT_AI_TAG_RANGE = { min: 2, max: 3 } as const;

export function clampAiTagCount(value: unknown, fallback: number): number {
  return clampInt(value, AI_TAG_COUNT_BOUNDS, fallback);
}

/** Bounds and default for the per-tag character limit. */
export const AI_TAG_LEN_BOUNDS = { min: 2, max: 12 } as const;
export const DEFAULT_AI_TAG_MAX_LEN = 4;

export function clampAiTagMaxLen(value: unknown): number {
  return clampInt(value, AI_TAG_LEN_BOUNDS, DEFAULT_AI_TAG_MAX_LEN);
}

/** Bounds and default for concurrent AI tag-generation requests. */
export const AI_CONCURRENCY_BOUNDS = { min: 1, max: 16 } as const;
export const DEFAULT_AI_CONCURRENCY = 8;

export function clampAiConcurrency(value: unknown): number {
  return clampInt(value, AI_CONCURRENCY_BOUNDS, DEFAULT_AI_CONCURRENCY);
}

/** Bounds and default for the session lifetime in days. */
export const SESSION_MAX_DAYS_BOUNDS = { min: 1, max: 30 } as const;
export const DEFAULT_SESSION_MAX_DAYS = 7;

export function clampSessionMaxDays(value: unknown): number {
  return clampInt(value, SESSION_MAX_DAYS_BOUNDS, DEFAULT_SESSION_MAX_DAYS);
}

/** Bounds and default for the admin-configured login rate limit, per minute. */
export const LOGIN_RATE_LIMIT_BOUNDS = { min: 1, max: 100 } as const;
export const DEFAULT_LOGIN_RATE_LIMIT = 10;

export function clampLoginRateLimit(value: unknown): number {
  return clampInt(value, LOGIN_RATE_LIMIT_BOUNDS, DEFAULT_LOGIN_RATE_LIMIT);
}

/** Preset per-category preview caps for the public nav; 0 shows everything. */
export const CATEGORY_PREVIEW_COUNTS = [12, 24, 30, 48, 60, 0] as const;

export function isCategoryPreviewCount(value: unknown): boolean {
  if (typeof value === 'string' && value.trim() === '') return false;
  return (CATEGORY_PREVIEW_COUNTS as readonly number[]).includes(
    Number(value),
  );
}

/** Preset recycle-bin lifetimes in days; 0 keeps trashed rows until purged. */
export const TRASH_RETENTION_DAYS = [7, 30, 90, 0] as const;
export const DEFAULT_TRASH_RETENTION_DAYS = 30;

export function isTrashRetentionDays(value: unknown): boolean {
  if (typeof value === 'string' && value.trim() === '') return false;
  return (TRASH_RETENTION_DAYS as readonly number[]).includes(Number(value));
}

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'OrigamiNav',
  tagline: '把散落的书签折进一张纸',
  description: '',
  logoUrl: null,
  siteUrl: null,
  seoIndexing: true,
  verifications: emptyVerifications(),
  analyticsGaId: '',
  analyticsBaiduId: '',
  analyticsUmamiUrl: '',
  analyticsUmamiId: '',
  indexNowKey: '',
  faviconMode: 'none',
  faviconUrl: null,
  faviconVersion: null,
  iconService: 'auto',
  iconCustomTemplate: null,
  defaultTheme: 'blue',
  cardColumns: 5,
  categoryPreviewCount: 30,
  categoryDeleteMode: 'protected',
  trashRetentionDays: DEFAULT_TRASH_RETENTION_DAYS,
  sessionMaxDays: DEFAULT_SESSION_MAX_DAYS,
  loginRateLimit: DEFAULT_LOGIN_RATE_LIMIT,
  aiEnabled: false,
  aiTagMaxLen: DEFAULT_AI_TAG_MAX_LEN,
  aiConcurrency: DEFAULT_AI_CONCURRENCY,
  // The defaults are what a caller sees when the read failed, so they must
  // announce that they are not real data.
  available: false,
  installed: false,
};
