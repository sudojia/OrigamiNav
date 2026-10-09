import type { Metadata } from 'next';
import { unstable_noStore } from 'next/cache';
import { notFound } from 'next/navigation';

import { AnalyticsScripts } from '@/components/analytics/analytics-scripts';
import { BootstrapRedirect } from '@/components/auth/bootstrap-redirect';
import { NavShell } from '@/components/nav/nav-shell';
import { SiteUnavailable } from '@/components/nav/site-unavailable';
import {
  TagBreadcrumbJsonLd,
  TagPageJsonLd,
} from '@/components/seo/json-ld';
import { getNavData } from '@/db/queries/nav';
import { getSiteSettings } from '@/db/queries/settings';
import {
  getTagPageTarget,
  listTagPageTargets,
  TAG_PAGE_MIN_BOOKMARKS,
} from '@/db/queries/tags';
import { pageSocialMetadata, tagPageDescription } from '@/lib/seo';

// Tag pages are content, not user state: same ISR window as the nav page.
export const revalidate = 300;

type TagPageProps = { params: Promise<{ slug: string }> };

/**
 * Prerenders every tag worth indexing and turns on ISR for the rest, so a new
 * tag is rendered once on demand and then served from cache.
 */
export async function generateStaticParams() {
  const tags = await listTagPageTargets();
  return tags.map((tag) => ({ slug: tag.slug }));
}

export async function generateMetadata({
  params,
}: TagPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [settings, tag] = await Promise.all([
    getSiteSettings(),
    getTagPageTarget(slug),
  ]);

  if (!settings.available) {
    return { title: '暂时无法连接', robots: { index: false, follow: false } };
  }

  if (!tag) {
    return { title: '标签不存在', robots: { index: false, follow: false } };
  }

  // Too few bookmarks to be a page of its own: visitors still get the list, but
  // the category pages already hold these links. Kept out of the sitemap too.
  if (tag.count < TAG_PAGE_MIN_BOOKMARKS) {
    return { title: tag.name, robots: { index: false, follow: false } };
  }

  const description = tagPageDescription(settings, tag);

  return {
    title: tag.name,
    description,
    ...pageSocialMetadata(settings, {
      path: `/t/${encodeURIComponent(tag.slug)}`,
      title: tag.name,
      description,
    }),
  };
}

export default async function TagPage({ params }: TagPageProps) {
  const { slug } = await params;
  const settings = await getSiteSettings();

  // Unreadable settings mean "unknown", not "not installed"; see the nav page.
  if (!settings.available) {
    unstable_noStore();
    return <SiteUnavailable />;
  }

  if (!settings.installed) {
    return <BootstrapRedirect to="/setup" />;
  }

  const nav = await getNavData({ tagSlug: slug });

  // Database unreachable: keep the page alive with the offline notice rather
  // than 404 a tag that still exists.
  if (!nav.available) {
    unstable_noStore();
    return <NavShell nav={nav} settings={settings} />;
  }

  // A tag appears in the payload only while a visible bookmark carries it, so
  // its absence is exactly "no page to render".
  const tag = nav.tags.find((item) => item.slug === slug) ?? null;
  if (!tag) notFound();

  return (
    <>
      <TagPageJsonLd settings={settings} tag={tag} categories={nav.categories} />
      <TagBreadcrumbJsonLd settings={settings} tag={tag} />
      <AnalyticsScripts settings={settings} />
      <NavShell nav={nav} settings={settings} pinnedTag={tag} />
    </>
  );
}