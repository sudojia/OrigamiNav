import type { MetadataRoute } from 'next';

import { getSiteSettings } from '@/db/queries/settings';
import { absoluteSiteUrl } from '@/lib/seo';

// Crawl rules come from the settings table, so the file is generated per request.
export const dynamic = 'force-dynamic';

/** Public crawl rules, hidden behind the admin's indexing switch. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const settings = await getSiteSettings();

  if (!settings.seoIndexing) {
    return { rules: { userAgent: '*', disallow: '/' } };
  }

  const sitemap = absoluteSiteUrl(settings, '/sitemap.xml');
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/login', '/setup'],
    },
    ...(sitemap ? { sitemap } : {}),
  };
}
