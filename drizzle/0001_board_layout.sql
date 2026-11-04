CREATE TABLE "board_layout" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"breakpoint" text NOT NULL,
	"layout" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "board_layout" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "board_layout" ADD CONSTRAINT "board_layout_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "board_layout_user_breakpoint_idx" ON "board_layout" USING btree ("user_id","breakpoint");