CREATE TABLE "bookmark_icons" (
	"host" text PRIMARY KEY NOT NULL,
	"mime_type" text DEFAULT '' NOT NULL,
	"data" text DEFAULT '' NOT NULL,
	"fetched_at" text NOT NULL
);
