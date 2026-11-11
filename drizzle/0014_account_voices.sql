CREATE TABLE "account_voices" (
	"user_id" text PRIMARY KEY NOT NULL,
	"voices" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account_voices" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "account_voices" ADD CONSTRAINT "account_voices_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;