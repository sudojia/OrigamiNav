/** Database schema: text cuid2 primary keys, text ISO-8601 timestamps, no jsonb. */

import {
  boolean,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const categories = pgTable(
  'categories',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description').notNull().default(''),
    /** Lucide icon name, resolved on the client. */
    icon: text('icon'),
    /** Tailwind-safe colour token, e.g. "teal". */
    color: text('color'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Hidden on the public site; visible only to the signed-in admin. */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [
    uniqueIndex('categories_slug_idx').on(t.slug),
    index('categories_sort_order_idx').on(t.sortOrder),
  ],
);

export const bookmarks = pgTable(
  'bookmarks',
  {
    id: text('id').primaryKey(),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    url: text('url').notNull(),
    description: text('description').notNull().default(''),
    /** Manual favicon URL; null uses the fallback favicon service. */
    iconUrl: text('icon_url'),
    sortOrder: integer('sort_order').notNull().default(0),
    /** Opens from the public site. */
    clickCount: integer('click_count').notNull().default(0),
    /** Precomputed search text: title, pinyin, description, domain, tag names. */
    searchIndex: text('search_index').notNull().default(''),
    /** Hidden on the public site; visible only to the signed-in admin. */
    hidden: boolean('hidden').notNull().default(false),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (t) => [index('bookmarks_category_sort_idx').on(t.categoryId, t.sortOrder)],
);

export const tags = pgTable(
  'tags',
  {
    id: text('id').primaryKey(),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('tags_slug_idx').on(t.slug)],
);

export const bookmarksTags = pgTable(
  'bookmarks_tags',
  {
    bookmarkId: text('bookmark_id')
      .notNull()
      .references(() => bookmarks.id, { onDelete: 'cascade' }),
    tagId: text('tag_id')
      .notNull()
      .references(() => tags.id, { onDelete: 'cascade' }),
  },
  (t) => [
    primaryKey({ columns: [t.bookmarkId, t.tagId] }),
    // Index for lookups by tag_id, which the composite PK does not cover.
    index('bookmarks_tags_tag_id_idx').on(t.tagId),
  ],
);

export const admins = pgTable(
  'admins',
  {
    id: text('id').primaryKey(),
    username: text('username').notNull(),
    /** Password hash in `scrypt$N$r$p$salt$hash` format. */
    passwordHash: text('password_hash').notNull(),
    /** Session-revocation counter embedded in every session cookie. */
    tokenVersion: integer('token_version').notNull().default(0),
    createdAt: text('created_at').notNull(),
  },
  (t) => [uniqueIndex('admins_username_idx').on(t.username)],
);

/** Key-value settings store; also holds the install flag gating /setup. */
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Secret rows (session key, AI API key) kept out of the settings snapshot. */
export const secrets = pgTable('secrets', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
});

/** Uploaded site imagery (favicon), stored base64 in text. */
export const siteAssets = pgTable('site_assets', {
  key: text('key').primaryKey(),
  mimeType: text('mime_type').notNull(),
  data: text('data').notNull(),
  updatedAt: text('updated_at').notNull(),
});

// ─── Row / insert types ──────────────────────────────────────────────────────

export type Category = typeof categories.$inferSelect;
export type Bookmark = typeof bookmarks.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type Admin = typeof admins.$inferSelect;
