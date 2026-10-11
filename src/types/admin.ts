import type { Category } from '@/db/schema';

import type { NavTag } from './nav';

/** One bookmark row as the admin manager renders it; the 3x-heavy
 * `search_index` column is deliberately absent from this shape. */
export type AdminBookmark = {
  id: string;
  categoryId: string;
  title: string;
  url: string;
  description: string;
  iconUrl: string | null;
  sortOrder: number;
  clickCount: number;
  hidden: boolean;
  createdAt: string;
  updatedAt: string;
  tags: NavTag[];
};

export type AdminBookmarkGroup = { category: Category; bookmarks: AdminBookmark[] };

export type CategoryWithCount = Category & { bookmarkCount: number };

/** Categories as the bookmark editor's picker consumes them. */
export type BookmarkCategoryOption = {
  id: string;
  name: string;
};

export type TagListRow = {
  id: string;
  name: string;
  slug: string;
  createdAt: string;
  count: number;
};

export type TagStats = {
  total: number;
  used: number;
  unused: number;
  /** Bookmark links over all tags. */
  refs: number;
};

/** A trashed bookmark listed under the category that went down with it. */
export type TrashCategoryBookmark = {
  id: string;
  title: string;
  url: string;
  deletedAt: string;
  /** Trashed before its category, so restoring the category leaves it behind. */
  earlierThanCategory: boolean;
};

export type TrashCategory = {
  id: string;
  name: string;
  color: string | null;
  deletedAt: string;
  bookmarks: TrashCategoryBookmark[];
};

/** A trashed bookmark whose category is still live; restorable on its own. */
export type TrashLooseBookmark = {
  id: string;
  title: string;
  url: string;
  deletedAt: string;
  categoryName: string;
};

export type TrashContents = {
  categories: TrashCategory[];
  bookmarks: TrashLooseBookmark[];
};

/** Cache footprint for the settings panel. */
export type IconCacheStats = {
  entries: number;
  /** Rows cached as "no icon anywhere", so the total is not read as icons. */
  misses: number;
  /** Decoded icon bytes, not the base64 text length. */
  bytes: number;
};
