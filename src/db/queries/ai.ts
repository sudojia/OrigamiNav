import 'server-only';

import { eq, inArray, sql } from 'drizzle-orm';

import { safeQuery } from '../client';
import { bookmarks, bookmarksTags, secrets, settings } from '../schema';

import { SECRET_KEYS, SETTING_KEYS } from './settings';

import {
  clampAiTagCount,
  clampAiTagMaxLen,
  DEFAULT_AI_TAG_RANGE,
  isAiProtocol,
  type AiProtocol,
} from '@/types/nav';

/** AI provider config; the API key lives in the secrets table. */

const NO_TAGS = sql`not exists (select 1 from ${bookmarksTags} where ${bookmarksTags.bookmarkId} = ${bookmarks.id})`;

export type UntaggedBookmark = {
  id: string;
  url: string;
  title: string;
  description: string;
};

/** Bookmarks carrying no tags at all, newest first. */
export async function listUntaggedBookmarks(
  limit: number,
): Promise<UntaggedBookmark[]> {
  return safeQuery(
    'listUntaggedBookmarks',
    async (database) =>
      database
        .select({
          id: bookmarks.id,
          url: bookmarks.url,
          title: bookmarks.title,
          description: bookmarks.description,
        })
        .from(bookmarks)
        .where(NO_TAGS)
        .orderBy(sql`${bookmarks.createdAt} desc`)
        .limit(limit),
    [],
  );
}

/** How many bookmarks carry no tags at all. */
export async function countUntaggedBookmarks(): Promise<number> {
  return safeQuery(
    'countUntaggedBookmarks',
    async (database) => {
      const rows = await database
        .select({ n: sql<number>`count(*)::int` })
        .from(bookmarks)
        .where(NO_TAGS);
      return rows[0]?.n ?? 0;
    },
    0,
  );
}

export type AiConfig = {
  protocol: AiProtocol;
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Suggested tag-count range for the fill action, admin-configurable. */
  tagMin: number;
  tagMax: number;
  /** Per-tag character cap fed to the prompt, admin-configurable. */
  tagMaxLen: number;
};

export type AiConfigStatus = {
  protocol: AiProtocol;
  baseUrl: string;
  model: string;
  hasApiKey: boolean;
  /** Last 4 characters of the API key. */
  keyHint: string | null;
  /** Suggested tag-count range for the fill action, admin-configurable. */
  tagMin: number;
  tagMax: number;
  /** Per-tag character cap fed to the prompt, admin-configurable. */
  tagMaxLen: number;
};

/** Reads AI settings rows plus the API key in one round-trip. */
async function readAiRows(): Promise<{
  map: Map<string, string>;
  apiKey: string;
}> {
  return safeQuery(
    'readAiSettings',
    async (database) => {
      const [rows, keyRows] = await Promise.all([
        database
          .select({ key: settings.key, value: settings.value })
          .from(settings)
          .where(
            inArray(settings.key, [
              SETTING_KEYS.aiBaseUrl,
              SETTING_KEYS.aiModel,
              SETTING_KEYS.aiProtocol,
              SETTING_KEYS.aiTagMin,
              SETTING_KEYS.aiTagMax,
              SETTING_KEYS.aiTagMaxLen,
            ]),
          ),
        database
          .select({ value: secrets.value })
          .from(secrets)
          .where(eq(secrets.key, SECRET_KEYS.aiApiKey))
          .limit(1),
      ]);
      return {
        map: new Map(rows.map((row) => [row.key, row.value])),
        apiKey: (keyRows[0]?.value ?? '').trim(),
      };
    },
    { map: new Map<string, string>(), apiKey: '' },
  );
}

/** Saved protocol; defaults to 'openai' when absent. */
function protocolOf(map: Map<string, string>): AiProtocol {
  const stored = map.get(SETTING_KEYS.aiProtocol);
  return isAiProtocol(stored) ? stored : 'openai';
}

/** Clamped tag-count range; min is folded up above max. */
function tagRangeOf(map: Map<string, string>): { tagMin: number; tagMax: number } {
  const tagMin = clampAiTagCount(
    map.get(SETTING_KEYS.aiTagMin),
    DEFAULT_AI_TAG_RANGE.min,
  );
  const tagMax = Math.max(
    clampAiTagCount(map.get(SETTING_KEYS.aiTagMax), DEFAULT_AI_TAG_RANGE.max),
    tagMin,
  );
  return { tagMin, tagMax };
}

/** Full AI config, or null when base URL, key or model is missing. */
export async function getAiConfig(): Promise<AiConfig | null> {
  const { map, apiKey } = await readAiRows();
  const baseUrl = (map.get(SETTING_KEYS.aiBaseUrl) ?? '').trim();
  const model = (map.get(SETTING_KEYS.aiModel) ?? '').trim();
  if (!baseUrl || !apiKey || !model) return null;
  return {
    protocol: protocolOf(map),
    baseUrl,
    apiKey,
    model,
    tagMaxLen: clampAiTagMaxLen(map.get(SETTING_KEYS.aiTagMaxLen)),
    ...tagRangeOf(map),
  };
}

/** Safe-for-the-client view used by the settings form. */
export async function getAiConfigStatus(): Promise<AiConfigStatus> {
  const { map, apiKey } = await readAiRows();
  return {
    protocol: protocolOf(map),
    baseUrl: (map.get(SETTING_KEYS.aiBaseUrl) ?? '').trim(),
    model: (map.get(SETTING_KEYS.aiModel) ?? '').trim(),
    ...tagRangeOf(map),
    tagMaxLen: clampAiTagMaxLen(map.get(SETTING_KEYS.aiTagMaxLen)),
    hasApiKey: apiKey.length > 0,
    keyHint: apiKey.length >= 4 ? `…${apiKey.slice(-4)}` : apiKey ? '…' : null,
  };
}
