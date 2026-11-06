CREATE TABLE "collection" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "collection_user_name_uq" UNIQUE("user_id","name"),
	CONSTRAINT "collection_id_user_uq" UNIQUE("id","user_id")
);
--> statement-breakpoint
ALTER TABLE "collection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"author" text,
	"file_name" text DEFAULT '' NOT NULL,
	"sha256" char(64) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"pages" integer,
	"r2_key" text,
	"cover_key" text,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"mode" text DEFAULT 'scroll' NOT NULL,
	"last_opened_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_user_sha_uq" UNIQUE("user_id","sha256"),
	CONSTRAINT "document_id_user_uq" UNIQUE("id","user_id"),
	CONSTRAINT "document_kind_ck" CHECK ("document"."kind" in ('pdf', 'md', 'txt', 'epub')),
	CONSTRAINT "document_mode_ck" CHECK ("document"."mode" in ('scroll', 'flip')),
	CONSTRAINT "document_sha_ck" CHECK ("document"."sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "document_size_ck" CHECK ("document"."size_bytes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "document" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "document_collection" (
	"document_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_collection_pk" PRIMARY KEY("document_id","collection_id")
);
--> statement-breakpoint
ALTER TABLE "document_collection" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "highlight" (
	"id" uuid PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"locator" text NOT NULL,
	"end_locator" text,
	"quote" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'yellow' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "highlight" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "reading_progress" (
	"document_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"locator" text NOT NULL,
	"percent" integer NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reading_progress_pk" PRIMARY KEY("document_id"),
	CONSTRAINT "reading_progress_percent_ck" CHECK ("reading_progress"."percent" between 0 and 100)
);
--> statement-breakpoint
ALTER TABLE "reading_progress" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "collection" ADD CONSTRAINT "collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document" ADD CONSTRAINT "document_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection" ADD CONSTRAINT "document_collection_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection" ADD CONSTRAINT "document_collection_document_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."document"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "document_collection" ADD CONSTRAINT "document_collection_collection_fk" FOREIGN KEY ("collection_id","user_id") REFERENCES "public"."collection"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "highlight" ADD CONSTRAINT "highlight_document_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."document"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reading_progress" ADD CONSTRAINT "reading_progress_document_fk" FOREIGN KEY ("document_id","user_id") REFERENCES "public"."document"("id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_user_opened_idx" ON "document" USING btree ("user_id","last_opened_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "document_collection_collection_idx" ON "document_collection" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "highlight_document_idx" ON "highlight" USING btree ("document_id","created_at");