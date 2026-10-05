import 'server-only';

import { eq } from 'drizzle-orm';

import { db, safeQuery } from '../client';
import { siteAssets } from '../schema';

/** Uploaded site imagery stored as base64 text; degrades to null on failure. */

export type SiteAsset = { mimeType: string; data: string; updatedAt: string };

export const SITE_ASSET_KEYS = {
  favicon: 'favicon',
} as const;

export async function getSiteAsset(key: string): Promise<SiteAsset | null> {
  return safeQuery(
    'getSiteAsset',
    async (database) => {
      const rows = await database
        .select({
          mimeType: siteAssets.mimeType,
          data: siteAssets.data,
          updatedAt: siteAssets.updatedAt,
        })
        .from(siteAssets)
        .where(eq(siteAssets.key, key))
        .limit(1);
      return rows[0] ?? null;
    },
    null,
  );
}

export async function putSiteAsset(
  key: string,
  mimeType: string,
  data: string,
  updatedAt: string,
): Promise<void> {
  await db
    .insert(siteAssets)
    .values({ key, mimeType, data, updatedAt })
    .onConflictDoUpdate({
      target: siteAssets.key,
      set: { mimeType, data, updatedAt },
    });
}

export async function deleteSiteAsset(key: string): Promise<void> {
  await db.delete(siteAssets).where(eq(siteAssets.key, key));
}
