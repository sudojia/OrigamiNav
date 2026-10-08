import type { MetadataRoute } from 'next';

import { listVisibleCategorySlugs } from '@/db/queries/categories';
import { getSiteSettings } from '@/db/queries/settings';

// Settings and categories live in the database, so the file is generated per request.
export const dynamic = 'force-dynamic';

/** The nav page plus one page per visible category. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const settings = await getSiteSettings();
  const base = settings.siteUrl;
  if (!settings.seoIndexing || !base) return [];

  const categories = await listVisibleCategorySlugs();
  return [
    { url: `${base}/`, changeFrequency: 'daily', priority: 1 },
    ...categories.map((category): MetadataRoute.Sitemap[number] => ({
      url: `${base}/c/${encodeURIComponent(category.slug)}`,
      // The category's own update time; the nav page has no single timestamp.
      lastModified: category.updatedAt,
      changeFrequency: 'weekly',
      priority: 0.7,
    })),
  ];
}
