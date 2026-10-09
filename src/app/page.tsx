import type { Metadata } from 'next';
import { unstable_noStore } from 'next/cache';

import { AnalyticsScripts } from '@/components/analytics/analytics-scripts';
import { BootstrapRedirect } from '@/components/auth/bootstrap-redirect';
import { NavShell } from '@/components/nav/nav-shell';
import { SiteUnavailable } from '@/components/nav/site-unavailable';
import { WebsiteJsonLd } from '@/components/seo/json-ld';
import { getNavData } from '@/db/queries/nav';
import { getSiteSettings } from '@/db/queries/settings';
import { pageSocialMetadata, siteDescription, siteTitle } from '@/lib/seo';

// Revalidate the page every 300 seconds.
export const revalidate = 300;

export async function generateMetadata(): Promise<Metadata> {
  const settings = await getSiteSettings();
  // The layout's robots default is "index" because that is the usual setting;
  // a page that failed to read the site must not be indexed on that basis.
  if (!settings.available) {
    return { title: '暂时无法连接', robots: { index: false, follow: false } };
  }
  return pageSocialMetadata(settings, {
    path: '/',
    title: siteTitle(settings),
    description: siteDescription(settings),
  });
}

export default async function HomePage() {
  const settings = await getSiteSettings();

  // The settings could not be read. This is not the same as "not installed",
  // and caching it would keep serving the degraded page for the whole
  // revalidate window after the database has recovered.
  if (!settings.available) {
    unstable_noStore();
    return <SiteUnavailable />;
  }

  // Hop to the setup wizard before installation. Rendered as content rather
  // than returned as a `redirect()`: this page is prerendered, and EdgeOne
  // Pages corrupts the `Location` header of a prerendered redirect, which
  // would 404 the site before it is installed.
  if (!settings.installed) {
    return <BootstrapRedirect to="/setup" />;
  }

  // Public payload only: the page stays prerendered and CDN-cacheable. A
  // signed-in admin pulls the hidden rows client-side right after the session
  // check (see NavClient), so no per-user data ever enters the shared cache.
  const nav = await getNavData();
  // Same reasoning as above: do not cache a render with no bookmarks in it.
  if (!nav.available) unstable_noStore();

  return (
    <>
      <WebsiteJsonLd settings={settings} />
      <AnalyticsScripts settings={settings} />
      <NavShell nav={nav} settings={settings} />
    </>
  );
}
