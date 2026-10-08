ALTER TABLE "bookmarks" ADD COLUMN "deleted_at" text;--> statement-breakpoint
ALTER TABLE "bookmarks" ADD COLUMN "deleted_tag_ids" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "deleted_at" text;