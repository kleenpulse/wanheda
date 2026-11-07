CREATE TABLE "media_item" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"fp" text NOT NULL,
	"uri" text NOT NULL,
	"title" text NOT NULL,
	"duration_s" double precision,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "media_item_user_fp_uq" UNIQUE("user_id","fp"),
	CONSTRAINT "media_item_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "media_item_kind_ck" CHECK ("media_item"."kind" in ('video', 'audio')),
	CONSTRAINT "media_item_source_ck" CHECK ("media_item"."source" in ('local', 'url', 'embed', 'r2')),
	CONSTRAINT "media_item_duration_ck" CHECK ("media_item"."duration_s" is null or "media_item"."duration_s" >= 0)
);
--> statement-breakpoint
ALTER TABLE "media_item" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "playback_state" (
	"item_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position_s" double precision DEFAULT 0 NOT NULL,
	"watched" boolean DEFAULT false NOT NULL,
	"last_played_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playback_state_pk" PRIMARY KEY("item_id"),
	CONSTRAINT "playback_state_position_ck" CHECK ("playback_state"."position_s" >= 0)
);
--> statement-breakpoint
ALTER TABLE "playback_state" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "playlist" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_id_user_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "playlist" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "playlist_track" (
	"playlist_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"position" integer NOT NULL,
	"fp" text NOT NULL,
	"title" text NOT NULL,
	"artist" text,
	"duration_s" double precision,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "playlist_track_pk" PRIMARY KEY("playlist_id","position"),
	CONSTRAINT "playlist_track_position_ck" CHECK ("playlist_track"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "playlist_track" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "media_item" ADD CONSTRAINT "media_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_state" ADD CONSTRAINT "playback_state_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playback_state" ADD CONSTRAINT "playback_state_item_fk" FOREIGN KEY ("item_id","user_id") REFERENCES "public"."media_item"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playlist_track" ADD CONSTRAINT "playlist_track_playlist_fk" FOREIGN KEY ("playlist_id","user_id") REFERENCES "public"."playlist"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "media_item_user_created_idx" ON "media_item" USING btree ("user_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "playback_state_user_played_idx" ON "playback_state" USING btree ("user_id","last_played_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "playlist_user_idx" ON "playlist" USING btree ("user_id");