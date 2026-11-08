ALTER TABLE "user_prefs" ADD COLUMN "wallpaper_scope" text DEFAULT 'home' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "wallpaper_cover" text DEFAULT 'sheet' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "wallpaper_pages" jsonb;