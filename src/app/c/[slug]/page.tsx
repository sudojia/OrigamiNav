import type { Metadata } from 'next';
import { unstable_noStore } from 'next/cache';
import { notFound } from 'next/navigation';

import { AnalyticsScripts } from '@/components/analytics/analytics-scripts';
import { BootstrapRedirect } from '@/components/auth/bootstrap-redirect';
import { NavShell } from '@/components/nav/nav-shell';
import { SiteUnavailable } from '@/components/nav/site-unavailable';
import { BreadcrumbJsonLd, CategoryJsonLd } from '@/components/seo/json-ld';
import {
  getCategoryBySlug,
  listVisibleCategorySlugs,
} from '@/db/queries/categories';
import { getNavData } from '@/db/queries/nav';
import { getSiteSettings } from '@/db/queries/settings';
import { categoryDescription, pageSocialMetadata } from '@/lib/seo';

// Category pages are content, not user state: same ISR window as the nav page.
export const revalidate = 300;

type CategoryPageProps = { params: Promise<{ slug: string }> };

/**
 * Prerenders every visible category and turns on ISR for the rest, so a new
 * category is rendered once on demand and then served from cache.
 */
export async function generateStaticParams() {
  const categories = await listVisibleCategorySlugs();
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({
  params,
}: CategoryPageProps): Promise<Metadata> {
  const { slug } = await params;
  const [settings, category] = await Promise.all([
    getSiteSettings(),
    getCategoryBySlug(slug),
  ]);

  // A read failure is not "this category does not exist"; say so, and keep the
  // transient page out of the index.
  if (!settings.available) {
    return { title: '暂时无法连接', robots: { index: false, follow: false } };
  }

  // Hidden and unknown categories have no public page.
  if (!category || category.hidden) {
    return { title: '分类不存在', robots: { index: false, follow: false } };
  }

  // A category whose bookmarks are all hidden has nothing to index; it is also
  // kept out of the sitemap, so the two never disagree.
  if (category.visibleBookmarks === 0) {
    return {
      title: category.name,
      robots: { index: false, follow: false },
    };
  }

  const description = categoryDescription(settings, category);

  return {
    title: category.name,
    description,
    ...pageSocialMetadata(settings, {
      path: `/c/${encodeURIComponent(category.slug)}`,
      title: category.name,
      description,
    }),
  };
}

export default async function CategoryPage({ params }: CategoryPageProps) {
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

  const nav = await getNavData();
  // Database unreachable: keep the page alive with the offline notice rather
  // than 404 a category that still exists. Not cached, so the page recovers as
  // soon as the database answers again.
  if (!nav.available) {
    unstable_noStore();
    return <NavShell nav={nav} settings={settings} pinnedSlug={slug} />;
  }

  const category = nav.categories.find((item) => item.slug === slug);
  // Hidden categories are absent from the public payload.
  if (!category) notFound();

  return (
    <>
      <CategoryJsonLd settings={settings} category={category} />
      <BreadcrumbJsonLd settings={settings} category={category} />
      <AnalyticsScripts settings={settings} />
      <NavShell nav={nav} settings={settings} pinnedSlug={slug} />
    </>
  );
}
