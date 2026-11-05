CREATE TABLE "billing_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connector_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"object_id" text NOT NULL,
	"provider_product_id" text,
	"customer_ref" text,
	"subscription_ref" text,
	"order_ref" text,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "billing_event_connector_event_uq" UNIQUE("connector_id","event_id"),
	CONSTRAINT "billing_event_kind_ck" CHECK ("billing_event"."kind" in ('subscription', 'order', 'refund'))
);
--> statement-breakpoint
ALTER TABLE "billing_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "connector" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid,
	"provider" text NOT NULL,
	"sealed_secret" text NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_synced_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_provider_ck" CHECK ("connector"."provider" in ('polar'))
);
--> statement-breakpoint
ALTER TABLE "connector" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "goal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"product_id" uuid,
	"target_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"due_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "goal_kind_ck" CHECK ("goal"."kind" in ('mrr', 'save'))
);
--> statement-breakpoint
ALTER TABLE "goal" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "metric_snapshot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid,
	"on_date" date NOT NULL,
	"source" text NOT NULL,
	"currency" char(3) NOT NULL,
	"mrr_minor" bigint NOT NULL,
	"customers" integer NOT NULL,
	"arpa_minor" bigint,
	"extra" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "metric_snapshot_day_uq" UNIQUE NULLS NOT DISTINCT("user_id","product_id","on_date","source"),
	CONSTRAINT "metric_snapshot_source_ck" CHECK ("metric_snapshot"."source" in ('polar', 'computed'))
);
--> statement-breakpoint
ALTER TABLE "metric_snapshot" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "mrr_movement" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"product_id" uuid NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"customer_ref" text NOT NULL,
	"kind" text NOT NULL,
	"delta_mrr_minor" bigint NOT NULL,
	"currency" char(3) NOT NULL,
	"billing_event_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mrr_movement_kind_ck" CHECK ("mrr_movement"."kind" in ('new', 'expansion', 'contraction', 'churn', 'reactivation'))
);
--> statement-breakpoint
ALTER TABLE "mrr_movement" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "processed_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"connector_id" uuid NOT NULL,
	"event_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "processed_event_connector_event_uq" UNIQUE("connector_id","event_id")
);
--> statement-breakpoint
ALTER TABLE "processed_event" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE TABLE "product" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"url" text DEFAULT '' NOT NULL,
	"color" text DEFAULT 'slate' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "product" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing_event" ADD CONSTRAINT "billing_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing_event" ADD CONSTRAINT "billing_event_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "connector" ADD CONSTRAINT "connector_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goal" ADD CONSTRAINT "goal_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "metric_snapshot" ADD CONSTRAINT "metric_snapshot_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrr_movement" ADD CONSTRAINT "mrr_movement_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrr_movement" ADD CONSTRAINT "mrr_movement_product_id_product_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."product"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mrr_movement" ADD CONSTRAINT "mrr_movement_billing_event_id_billing_event_id_fk" FOREIGN KEY ("billing_event_id") REFERENCES "public"."billing_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_event" ADD CONSTRAINT "processed_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processed_event" ADD CONSTRAINT "processed_event_connector_id_connector_id_fk" FOREIGN KEY ("connector_id") REFERENCES "public"."connector"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product" ADD CONSTRAINT "product_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "billing_event_connector_occurred_idx" ON "billing_event" USING btree ("connector_id","occurred_at");--> statement-breakpoint
CREATE INDEX "mrr_movement_product_occurred_idx" ON "mrr_movement" USING btree ("product_id","occurred_at");