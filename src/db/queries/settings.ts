import 'server-only';

import { and, eq, inArray, sql } from 'drizzle-orm';
import { cache } from 'react';

import {
  clampAiConcurrency,
  clampAiTagMaxLen,
  clampLoginRateLimit,
  clampSessionMaxDays,
  DEFAULT_SETTINGS,
  emptyVerifications,
  isCategoryDeleteMode,
  isCategoryPreviewCount,
  isFaviconMode,
  isIconService,
  isSkinId,
  isTrashRetentionDays,
  VERIFICATION_TARGETS,
  verificationKey,
  type SiteSettings,
  type VerificationId,
} from '@/types/nav';
import { nowIso } from '@/lib/ids';
import { normalizeSiteUrl } from '@/lib/seo';
import { clampInt } from '@/lib/utils';

import { db, safeQuery } from '../client';
import { secrets, settings } from '../schema';

export const SETTING_KEYS = {
  installed: 'installed',
  installedAt: 'installed_at',
  lastBackupAt: 'last_backup_at',
  siteName: 'site_name',
  tagline: 'tagline',
  description: 'description',
  logoUrl: 'logo_url',
  siteUrl: 'site_url',
  seoIndexing: 'seo_indexing',
  analyticsGaId: 'analytics_ga_id',
  analyticsBaiduId: 'analytics_baidu_id',
  analyticsUmamiUrl: 'analytics_umami_url',
  analyticsUmamiId: 'analytics_umami_id',
  indexNowKey: 'indexnow_key',
  faviconMode: 'favicon_mode',
  faviconUrl: 'favicon_url',
  faviconVersion: 'favicon_version',
  iconService: 'icon_service',
  iconCustomTemplate: 'icon_custom_template',
  defaultTheme: 'default_theme',
  cardColumns: 'card_columns',
  categoryPreviewCount: 'category_preview_count',
  categoryDeleteMode: 'category_delete_mode',
  trashRetentionDays: 'trash_retention_days',
  aiBaseUrl: 'ai_base_url',
  aiModel: 'ai_model',
  aiProtocol: 'ai_protocol',
  aiTagMin: 'ai_tag_min',
  aiTagMax: 'ai_tag_max',
  aiTagMaxLen: 'ai_tag_max_len',
  aiConcurrency: 'ai_concurrency',
  sessionMaxDays: 'session_max_days',
  loginRateLimit: 'login_rate_limit',
} as const;

/** Keys stored in the secrets table, not in settings. */
export const SECRET_KEYS = {
  aiApiKey: 'ai_api_key',
  sessionSecret: 'session_secret',
  // Extension bearer token; stored verbatim so the admin can view and rotate it.
  extToken: 'ext_token',
  // Baidu URL-submission token; a write credential for the site.
  baiduPushToken: 'baidu_push_token',
} as const;

const CARD_COLUMNS_MIN = 1;
const CARD_COLUMNS_MAX = 8;

export function clampCardColumns(value: unknown): number {
  return clampInt(
    value,
    { min: CARD_COLUMNS_MIN, max: CARD_COLUMNS_MAX },
    DEFAULT_SETTINGS.cardColumns,
  );
}

/** Preset-listed value or the default; hand-edited rows snap back. */
function parseCategoryPreviewCount(value: string | undefined): number {
  return value !== undefined && isCategoryPreviewCount(value)
    ? Number(value)
    : DEFAULT_SETTINGS.categoryPreviewCount;
}

/** Preset-listed value or the default; hand-edited rows snap back. */
function parseTrashRetentionDays(value: string | undefined): number {
  return isTrashRetentionDays(value)
    ? Number(value)
    : DEFAULT_SETTINGS.trashRetentionDays;
}

/** Site settings snapshot, memoized per request; defaults when unavailable. */
export const getSiteSettings = cache(async function getSiteSettings(): Promise<SiteSettings> {
  return safeQuery('getSiteSettings', async (database) => {
    // Existence probe for the AI key; a failure degrades to no key.
    const aiKeyProbe = database
      .select({ key: secrets.key })
      .from(secrets)
      // Whitespace-only values count as absent.
      .where(
        and(
          eq(secrets.key, SECRET_KEYS.aiApiKey),
          sql`btrim(${secrets.value}) <> ''`,
        ),
      )
      .limit(1)
      .then((probeRows) => probeRows.length > 0)
      .catch(() => false);

    const [rows, aiKeyExists] = await Promise.all([
      database.select().from(settings),
      aiKeyProbe,
    ]);
    return settingsFromRows(rows, aiKeyExists);
  }, DEFAULT_SETTINGS);
});

/** Stored verification codes; empty for every engine that was never configured. */
function verificationsFromRows(
  map: Map<string, string>,
): Record<VerificationId, string> {
  const codes = emptyVerifications();
  for (const target of VERIFICATION_TARGETS) {
    codes[target.id] = map.get(verificationKey(target.id)) ?? '';
  }
  return codes;
}

function settingsFromRows(
  rows: Array<{ key: string; value: string }>,
  aiKeyExists: boolean,
): SiteSettings {
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const theme = map.get(SETTING_KEYS.defaultTheme);
  const iconService = map.get(SETTING_KEYS.iconService);
  const faviconMode = map.get(SETTING_KEYS.faviconMode);
  const categoryDeleteMode = map.get(SETTING_KEYS.categoryDeleteMode);
  return {
    ...DEFAULT_SETTINGS,
    siteName: map.get(SETTING_KEYS.siteName) ?? DEFAULT_SETTINGS.siteName,
    tagline: map.get(SETTING_KEYS.tagline) ?? DEFAULT_SETTINGS.tagline,
    description: map.get(SETTING_KEYS.description) ?? DEFAULT_SETTINGS.description,
    logoUrl: map.get(SETTING_KEYS.logoUrl) ?? null,
    // An empty setting falls back to the build-time env base URL.
    siteUrl:
      normalizeSiteUrl(map.get(SETTING_KEYS.siteUrl)) ??
      normalizeSiteUrl(process.env.NEXT_PUBLIC_SITE_URL),
    seoIndexing: map.get(SETTING_KEYS.seoIndexing) !== '0',
    verifications: verificationsFromRows(map),
    analyticsGaId: map.get(SETTING_KEYS.analyticsGaId) ?? '',
    analyticsBaiduId: map.get(SETTING_KEYS.analyticsBaiduId) ?? '',
    analyticsUmamiUrl:
      normalizeSiteUrl(map.get(SETTING_KEYS.analyticsUmamiUrl)) ?? '',
    analyticsUmamiId: map.get(SETTING_KEYS.analyticsUmamiId) ?? '',
    indexNowKey: map.get(SETTING_KEYS.indexNowKey) ?? '',
    faviconMode: isFaviconMode(faviconMode)
      ? faviconMode
      : DEFAULT_SETTINGS.faviconMode,
    faviconUrl: map.get(SETTING_KEYS.faviconUrl) ?? null,
    faviconVersion: map.get(SETTING_KEYS.faviconVersion) ?? null,
    iconService: isIconService(iconService)
      ? iconService
      : DEFAULT_SETTINGS.iconService,
    iconCustomTemplate: map.get(SETTING_KEYS.iconCustomTemplate) || null,
    defaultTheme: isSkinId(theme) ? theme : DEFAULT_SETTINGS.defaultTheme,
    cardColumns: clampCardColumns(
      map.get(SETTING_KEYS.cardColumns) ?? DEFAULT_SETTINGS.cardColumns,
    ),
    categoryPreviewCount: parseCategoryPreviewCount(
      map.get(SETTING_KEYS.categoryPreviewCount),
    ),
    categoryDeleteMode: isCategoryDeleteMode(categoryDeleteMode)
      ? categoryDeleteMode
      : DEFAULT_SETTINGS.categoryDeleteMode,
    trashRetentionDays: parseTrashRetentionDays(
      map.get(SETTING_KEYS.trashRetentionDays),
    ),
    sessionMaxDays: clampSessionMaxDays(map.get(SETTING_KEYS.sessionMaxDays)),
    loginRateLimit: clampLoginRateLimit(
      map.get(SETTING_KEYS.loginRateLimit),
    ),
    // Derived from the base URL, model and key-existence probe.
    aiEnabled: Boolean(
      map.get(SETTING_KEYS.aiBaseUrl)?.trim() &&
        aiKeyExists &&
        map.get(SETTING_KEYS.aiModel)?.trim(),
    ),
    aiConcurrency: clampAiConcurrency(map.get(SETTING_KEYS.aiConcurrency)),
    aiTagMaxLen: clampAiTagMaxLen(map.get(SETTING_KEYS.aiTagMaxLen)),
    installed: map.get(SETTING_KEYS.installed) === '1',
  };
}

export async function setSettings(
  entries: Record<string, string>,
): Promise<void> {
  const rows = Object.entries(entries).map(([key, value]) => ({ key, value }));
  if (!rows.length) return;
  await db
    .insert(settings)
    .values(rows)
    .onConflictDoUpdate({
      target: settings.key,
      // Sets each conflicting key to its own incoming value.
      set: { value: sql`excluded.value` },
    });
}

export async function deleteSetting(key: string): Promise<void> {
  await db.delete(settings).where(eq(settings.key, key));
}

/** Deletes several settings keys in one statement. */
export async function deleteSettings(keys: string[]): Promise<void> {
  if (!keys.length) return;
  await db.delete(settings).where(inArray(settings.key, keys));
}

/** Atomically claims the install lock; true only for the winning writer. */
export async function claimInstallLock(): Promise<boolean> {
  const rows = await db
    .insert(settings)
    .values({ key: SETTING_KEYS.installed, value: '1' })
    .onConflictDoNothing()
    .returning({ key: settings.key });
  return rows.length > 0;
}

export async function releaseInstallLock(): Promise<void> {
  await db.delete(settings).where(eq(settings.key, SETTING_KEYS.installed));
}

/** Last export timestamp; null when never exported or the database is down. */
export async function getLastBackupAt(): Promise<string | null> {
  return safeQuery(
    'getLastBackupAt',
    async (database) => {
      const rows = await database
        .select({ value: settings.value })
        .from(settings)
        .where(eq(settings.key, SETTING_KEYS.lastBackupAt))
        .limit(1);
      return rows[0]?.value ?? null;
    },
    null,
  );
}

/** Stamps the export time behind the admin's backup reminder. */
export async function markBackupExported(): Promise<void> {
  await setSettings({ [SETTING_KEYS.lastBackupAt]: nowIso() });
}

// ─── Secrets ─────────────────────────────────────────────────────────────────
//
// The session-cookie key and the AI API key live in the secrets table.

/** Upserts one secret row; throws on database failure. */
export async function setSecret(key: string, value: string): Promise<void> {
  await db
    .insert(secrets)
    .values({ key, value })
    .onConflictDoUpdate({ target: secrets.key, set: { value } });
}

/** Deletes one secret row. */
export async function deleteSecret(key: string): Promise<void> {
  await db.delete(secrets).where(eq(secrets.key, key));
}

/** Reads one secret verbatim; null when absent or the database is down. */
export async function getSecretValue(key: string): Promise<string | null> {
  return safeQuery('getSecretValue', async (database) => {
    const rows = await database
      .select({ value: secrets.value })
      .from(secrets)
      .where(eq(secrets.key, key))
      .limit(1);
    // A stored empty string counts as absent.
    return rows[0]?.value || null;
  }, null);
}

/** Reads a secret, creating it from `candidate` if absent; null on failure. */
async function getOrCreateSecret(
  key: string,
  candidate: string,
): Promise<string | null> {
  try {
    const existing = await db
      .select({ value: secrets.value })
      .from(secrets)
      .where(eq(secrets.key, key))
      .limit(1);
    if (existing[0]?.value) return existing[0].value;

    await db
      .insert(secrets)
      .values({ key, value: candidate })
      .onConflictDoNothing();

    const rows = await db
      .select({ value: secrets.value })
      .from(secrets)
      .where(eq(secrets.key, key))
      .limit(1);
    // A stored empty string counts as absent.
    return rows[0]?.value || null;
  } catch {
    // Database unreachable; signalled via null.
    return null;
  }
}

/** Returns the session-cookie key, creating it on first use. */
export async function getOrCreateSessionSecret(
  candidate: string,
): Promise<string | null> {
  return getOrCreateSecret(SECRET_KEYS.sessionSecret, candidate);
}
