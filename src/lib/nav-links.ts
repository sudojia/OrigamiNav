import type { NavCategory } from '@/types/nav';

/** Category URL helper; safe to import from server and client. */

/**
 * Public URL of a category: its own page, or the in-page view for hidden
 * categories, which have no public page.
 */
export function categoryHref(
  category: Pick<NavCategory, 'slug' | 'hidden'>,
): string {
  return category.hidden
    ? `/?category=${encodeURIComponent(category.slug)}`
    : `/c/${encodeURIComponent(category.slug)}`;
}
