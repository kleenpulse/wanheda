CREATE TABLE "budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"category_id" uuid,
	"period" text DEFAULT 'month' NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"rollover" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "budget_user_category_period_uq" UNIQUE NULLS NOT DISTINCT("user_id","category_id","period"),
	CONSTRAINT "budget_period_ck" CHECK ("budget"."period" = 'month'),
	CONSTRAINT "budget_amount_ck" CHECK ("budget"."amount_minor" > 0),
	CONSTRAINT "budget_currency_ck" CHECK ("budget"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "budget" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"parent_id" uuid,
	"emoji" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_user_slug_uq" UNIQUE("user_id","slug"),
	CONSTRAINT "category_kind_ck" CHECK ("category"."kind" in ('expense', 'income', 'transfer'))
);
--> statement-breakpoint
ALTER TABLE "category" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "fx_rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"on_date" date NOT NULL,
	"base" char(3) NOT NULL,
	"quote" char(3) NOT NULL,
	"rate" numeric(18, 8) NOT NULL,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "fx_rate_day_pair_uq" UNIQUE("on_date","base","quote"),
	CONSTRAINT "fx_rate_positive_ck" CHECK ("fx_rate"."rate" > 0)
);
--> statement-breakpoint
ALTER TABLE "fx_rate" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"filename" text NOT NULL,
	"mapping_id" uuid,
	"rows_total" integer NOT NULL,
	"rows_imported" integer NOT NULL,
	"rows_skipped" integer NOT NULL,
	"skipped" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_batch_user_key_uq" UNIQUE("user_id","idempotency_key")
);
--> statement-breakpoint
ALTER TABLE "import_batch" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "import_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"bank_name" text NOT NULL,
	"columns" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "import_mapping_user_bank_uq" UNIQUE("user_id","bank_name")
);
--> statement-breakpoint
ALTER TABLE "import_mapping" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "money_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"slug" text,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"currency" char(3) NOT NULL,
	"opening_minor" bigint DEFAULT 0 NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "money_account_user_slug_uq" UNIQUE("user_id","slug"),
	CONSTRAINT "money_account_kind_ck" CHECK ("money_account"."kind" in ('cash', 'bank', 'card', 'wallet', 'crypto')),
	CONSTRAINT "money_account_currency_ck" CHECK ("money_account"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "money_account" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"match" jsonb NOT NULL,
	"action" jsonb NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "rule" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "subscription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"cycle" text NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"anchor_on" date NOT NULL,
	"trial_ends_on" date,
	"remind_days" integer DEFAULT 3 NOT NULL,
	"account_id" uuid,
	"category_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"cancel_url" text,
	"logo_url" text,
	"detected_from_txn" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "subscription_cycle_ck" CHECK ("subscription"."cycle" in ('day', 'week', 'month', 'year')),
	CONSTRAINT "subscription_interval_ck" CHECK ("subscription"."interval_count" between 1 and 366),
	CONSTRAINT "subscription_status_ck" CHECK ("subscription"."status" in ('active', 'paused', 'cancelled')),
	CONSTRAINT "subscription_amount_ck" CHECK ("subscription"."amount_minor" > 0),
	CONSTRAINT "subscription_remind_ck" CHECK ("subscription"."remind_days" between 0 and 60),
	CONSTRAINT "subscription_currency_ck" CHECK ("subscription"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "subscription" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "txn" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"account_id" uuid NOT NULL,
	"posted_on" date NOT NULL,
	"amount_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"payee" text DEFAULT '' NOT NULL,
	"category_id" uuid,
	"note" text DEFAULT '' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"external_id" text,
	"import_batch_id" uuid,
	"transfer_id" uuid,
	"attachment_key" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "txn_account_source_external_uq" UNIQUE("account_id","source","external_id"),
	CONSTRAINT "txn_source_ck" CHECK ("txn"."source" in ('manual', 'import', 'bank', 'webhook')),
	CONSTRAINT "txn_currency_ck" CHECK ("txn"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "txn" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "base_currency" char(3) DEFAULT 'NGN' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_prefs" ADD COLUMN "time_zone" text DEFAULT 'Africa/Lagos' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget" ADD CONSTRAINT "budget_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category" ADD CONSTRAINT "category_parent_id_category_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_account_id_money_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_batch" ADD CONSTRAINT "import_batch_mapping_id_import_mapping_id_fk" FOREIGN KEY ("mapping_id") REFERENCES "public"."import_mapping"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_mapping" ADD CONSTRAINT "import_mapping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "money_account" ADD CONSTRAINT "money_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rule" ADD CONSTRAINT "rule_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_account_id_money_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_account"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_account_id_money_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."money_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."category"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "txn" ADD CONSTRAINT "txn_import_batch_id_import_batch_id_fk" FOREIGN KEY ("import_batch_id") REFERENCES "public"."import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_user_priority_idx" ON "rule" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "subscription_user_idx" ON "subscription" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "txn_user_posted_idx" ON "txn" USING btree ("user_id","posted_on" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "txn_import_batch_idx" ON "txn" USING btree ("import_batch_id");