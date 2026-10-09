import {
  absoluteSiteUrl,
  categoryDescription,
  siteDescription,
  siteTitle,
  tagPageDescription,
} from '@/lib/seo';
import type {
  NavBookmark,
  NavCategory,
  NavTagCount,
  SiteSettings,
} from '@/types/nav';

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

/** CollectionPage plus its ItemList; shared by the category and tag pages. */
function CollectionPageJsonLd({
  settings,
  name,
  description,
  path,
  bookmarks,
}: {
  settings: SiteSettings;
  name: string;
  description: string;
  /** Site-relative path of the page being described. */
  path: string;
  bookmarks: NavBookmark[];
}) {
  const url = absoluteSiteUrl(settings, path);
  if (!url) return null;

  return (
    <JsonLdScript
      data={{
        '@context': 'https://schema.org',
        '@type': 'CollectionPage',
        name,
        description,
        url,
        inLanguage: 'zh-CN',
        isPartOf: {
          '@type': 'WebSite',
          name: siteTitle(settings),
          url: absoluteSiteUrl(settings, '/'),
        },
        mainEntity: {
          '@type': 'ItemList',
          numberOfItems: bookmarks.length,
          itemListElement: bookmarks.slice(0, ITEM_LIST_LIMIT).map(
            (bookmark, index) => ({
              '@type': 'ListItem',
              position: index + 1,
              name: bookmark.title,
              url: bookmark.url,
            }),
          ),
        },
      }}
    />
  );
}

/** CollectionPage plus its ItemList for a category page. */
export function CategoryJsonLd({
  settings,
  category,
}: {
  settings: SiteSettings;
  category: NavCategory;
}) {
  return (
    <CollectionPageJsonLd
      settings={settings}
      name={category.name}
      description={categoryDescription(settings, category)}
      path={`/c/${encodeURIComponent(category.slug)}`}
      bookmarks={category.bookmarks}
    />
  );
}

/**
 * CollectionPage for a tag page. A tag spans categories, so its items are the
 * bookmarks of every section the page renders, in the same order.
 */
export function TagPageJsonLd({
  settings,
  tag,
  categories,
}: {
  settings: SiteSettings;
  tag: NavTagCount;
  categories: NavCategory[];
}) {
  return (
    <CollectionPageJsonLd
      settings={settings}
      name={tag.name}
      description={tagPageDescription(settings, tag)}
      path={`/t/${encodeURIComponent(tag.slug)}`}
      bookmarks={categories.flatMap((category) => category.bookmarks)}
    />
  );
}

/** Home > page trail, matching the back link the page renders. */
function BreadcrumbTrailJsonLd({
  settings,
  name,
  path,
}: {
  settings: SiteSettings;
  name: string;
  path: string;
}) {
  const home = absoluteSiteUrl(settings, '/');
  const url = absoluteSiteUrl(settings, path);
  if (!home || !url) return null;

  return (
    <JsonLdScript
      data={{
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          {
            '@type': 'ListItem',
            position: 1,
            name: siteTitle(settings),
            item: home,
          },
          { '@type': 'ListItem', position: 2, name, item: url },
        ],
      }}
    />
  );
}

/** Home > category trail. */
export function BreadcrumbJsonLd({
  settings,
  category,
}: {
  settings: SiteSettings;
  category: NavCategory;
}) {
  return (
    <BreadcrumbTrailJsonLd
      settings={settings}
      name={category.name}
      path={`/c/${encodeURIComponent(category.slug)}`}
    />
  );
}

/** Home > tag trail. */
export function TagBreadcrumbJsonLd({
  settings,
  tag,
}: {
  settings: SiteSettings;
  tag: NavTagCount;
}) {
  return (
    <BreadcrumbTrailJsonLd
      settings={settings}
      name={tag.name}
      path={`/t/${encodeURIComponent(tag.slug)}`}
    />
  );
}
