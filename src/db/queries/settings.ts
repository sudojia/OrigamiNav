import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { cache } from 'react';

import {
  clampLoginRateLimit,
  clampSessionMaxDays,
  DEFAULT_SETTINGS,
  isCategoryDeleteMode,
  isFaviconMode,
  isIconService,
  isSkinId,
  type SiteSettings,
} from '@/types/nav';
import { clampInt } from '@/lib/utils';

import { db, safeQuery } from '../client';
import { secrets, settings } from '../schema';

export const SETTING_KEYS = {
  installed: 'installed',
  installedAt: 'installed_at',
  siteName: 'site_name',
  tagline: 'tagline',
  description: 'description',
  logoUrl: 'logo_url',
  faviconMode: 'favicon_mode',
  faviconUrl: 'favicon_url',
  faviconVersion: 'favicon_version',
  iconService: 'icon_service',
  iconCustomTemplate: 'icon_custom_template',
  defaultTheme: 'default_theme',
  cardColumns: 'card_columns',
  categoryDeleteMode: 'category_delete_mode',
  aiBaseUrl: 'ai_base_url',
  aiModel: 'ai_model',
  aiProtocol: 'ai_protocol',
  aiTagMin: 'ai_tag_min',
  aiTagMax: 'ai_tag_max',
  sessionMaxDays: 'session_max_days',
  loginRateLimit: 'login_rate_limit',
} as const;

/** Keys stored in the secrets table, not in settings. */
export const SECRET_KEYS = {
  aiApiKey: 'ai_api_key',
  sessionSecret: 'session_secret',
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
    categoryDeleteMode: isCategoryDeleteMode(categoryDeleteMode)
      ? categoryDeleteMode
      : DEFAULT_SETTINGS.categoryDeleteMode,
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
