/** Shapes shared by the server queries, the /api/nav payload and the UI. */

import { clampInt } from '@/lib/utils';

export type NavTag = {
  id: string;
  name: string;
  slug: string;
};

export type NavBookmark = {
  id: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  hostname: string;
  /** Precomputed search text: title, description, pinyin, domain, tag names. */
  searchIndex: string;
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
  tags: NavTag[];
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

/** Site-wide settings, with the defaults the setup wizard writes. */
export type SiteSettings = {
  siteName: string;
  tagline: string;
  description: string;
  logoUrl: string | null;
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
  /** Behaviour when deleting a category that still holds bookmarks. */
  categoryDeleteMode: CategoryDeleteMode;
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

export const DEFAULT_SETTINGS: SiteSettings = {
  siteName: 'OrigamiNav',
  tagline: '把散落的书签折进一张纸',
  description: '',
  logoUrl: null,
  faviconMode: 'none',
  faviconUrl: null,
  faviconVersion: null,
  iconService: 'auto',
  iconCustomTemplate: null,
  defaultTheme: 'blue',
  cardColumns: 5,
  categoryDeleteMode: 'protected',
  sessionMaxDays: DEFAULT_SESSION_MAX_DAYS,
  loginRateLimit: DEFAULT_LOGIN_RATE_LIMIT,
  aiEnabled: false,
  aiTagMaxLen: DEFAULT_AI_TAG_MAX_LEN,
  aiConcurrency: DEFAULT_AI_CONCURRENCY,
  installed: false,
};
