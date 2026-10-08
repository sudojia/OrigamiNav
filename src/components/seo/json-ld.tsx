import { absoluteSiteUrl, siteDescription, siteTitle } from '@/lib/seo';
import type { NavCategory, SiteSettings } from '@/types/nav';

/** Structured data blocks; native script tags per the Next.js JSON-LD guide. */

/**
 * Serializes with `<` escaped, so no settings or bookmark value can close the
 * script tag early.
 */
function JsonLdScript({ data }: { data: Record<string, unknown> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}

/** WebSite node for the nav page; needs an absolute URL to be valid. */
export function WebsiteJsonLd({ settings }: { settings: SiteSettings }) {
  const url = absoluteSiteUrl(settings, '/');
  if (!url) return null;

  return (
    <JsonLdScript
      data={{
        '@context': 'https://schema.org',
        '@type': 'WebSite',
        name: siteTitle(settings),
        url,
        description: siteDescription(settings),
        inLanguage: 'zh-CN',
      }}
    />
  );
}

/** Item-list cap: the page renders every bookmark, the markup does not have to. */
const ITEM_LIST_LIMIT = 100;

/** CollectionPage plus its ItemList for a category page. */
export function CategoryJsonLd({
  settings,
  category,
}: {
  settings: SiteSettings;
  category: NavCategory;
}) {
  const url = absoluteSiteUrl(
    settings,
    `/c/${encodeURIComponent(category.slug)}`,
  );
  if (!url) return null;

  return (
    <JsonLdScript
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name: category.name,
        description:
          category.description ||
          `${siteTitle(settings)} 的「${category.name}」分类书签导航`,
        url,
        inLanguage: 'zh-CN',
        isPartOf: {
          '@type': 'WebSite',
          name: siteTitle(settings),
          url: absoluteSiteUrl(settings, '/'),
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: category.bookmarks.length,
          itemListElement: category.bookmarks
            .slice(0, ITEM_LIST_LIMIT)
            .map((bookmark, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: bookmark.title,
              url: bookmark.url,
            })),
        },
      }}
    />
  );
}
