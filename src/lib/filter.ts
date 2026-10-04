import type { NavBookmark, NavCategory, NavData } from '@/types/nav';

/** Isomorphic bookmark filtering; matches against the server-precomputed `searchIndex`. */

/** Splits a query on whitespace into lowercased terms. */
export function tokenize(query: string): string[] {
  return query
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean);
}

export function bookmarkMatches(
  bookmark: NavBookmark,
  terms: string[],
  activeTagIds: Set<string>,
): boolean {
  if (activeTagIds.size > 0) {
    const has = bookmark.tags.some((t) => activeTagIds.has(t.id));
    if (!has) return false;
  }
  if (terms.length === 0) return true;

  const haystack = bookmark.searchIndex;
  if (!haystack) return false;
  return terms.every((term) => haystack.includes(term));
}

export type FilterResult = {
  categories: NavCategory[];
  total: number;
  matched: number;
  activeTagIds: string[];
};

/** Filters categories and bookmarks, dropping empty categories. */
export function filterNav(
  nav: NavData,
  query: string,
  activeTagIds: string[] = [],
): FilterResult {
  const terms = tokenize(query);
  const tagSet = new Set(activeTagIds);

  let total = 0;
  let matched = 0;
  const categories: NavCategory[] = [];

  for (const category of nav.categories) {
    total += category.bookmarks.length;
    const kept = category.bookmarks.filter((b) =>
      bookmarkMatches(b, terms, tagSet),
    );
    matched += kept.length;
    if (kept.length > 0) {
      categories.push({ ...category, bookmarks: kept });
    }
  }

  return { categories, total, matched, activeTagIds: [...tagSet] };
}

export type PaletteItem = {
  kind: 'bookmark' | 'category';
  id: string;
  label: string;
  sublabel: string;
  href: string;
  iconUrl: string | null;
};

/** Builds the flat palette list of category anchors and bookmarks. */
export function buildPaletteItems(nav: NavData): PaletteItem[] {
  const items: PaletteItem[] = [];

  for (const category of nav.categories) {
    items.push({
      kind: 'category',
      id: category.id,
      label: category.name,
      sublabel: `${category.bookmarks.length} 个书签`,
      href: `#${category.slug}`,
      iconUrl: null,
    });

    for (const bookmark of category.bookmarks) {
      items.push({
        kind: 'bookmark',
        id: bookmark.id,
        label: bookmark.title,
        sublabel: bookmark.hostname || category.name,
        href: bookmark.url,
        iconUrl: bookmark.iconUrl,
      });
    }
  }

  return items;
}

export function rankPaletteItems(
  items: PaletteItem[],
  nav: NavData,
  query: string,
  limit = 50,
): PaletteItem[] {
  const terms = tokenize(query);
  if (terms.length === 0) return items.slice(0, limit);

  const indexById = new Map<string, string>();
  for (const category of nav.categories) {
    indexById.set(
      category.id,
      `${category.name} ${category.description}`.toLowerCase(),
    );
    for (const b of category.bookmarks) indexById.set(b.id, b.searchIndex);
  }

  const first = terms[0] ?? '';
  const scored: Array<{ item: PaletteItem; score: number }> = [];

  for (const item of items) {
    const title = item.label.toLowerCase();
    const haystack = indexById.get(item.id) ?? title;
    if (!terms.every((t) => haystack.includes(t))) continue;

    // Score: title prefix < title substring < index-only match.
    let score = title.startsWith(first) ? 0 : title.includes(first) ? 50 : 100;
    if (item.kind === 'bookmark') score -= 5;
    score += title.length / 100;
    scored.push({ item, score });
  }

  scored.sort((a, b) => a.score - b.score);
  return scored.slice(0, limit).map((s) => s.item);
}
