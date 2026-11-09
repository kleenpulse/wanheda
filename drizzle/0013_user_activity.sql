CREATE TABLE "user_activity" (
	"user_id" text NOT NULL,
	"day" date NOT NULL,
	CONSTRAINT "user_activity_user_id_day_pk" PRIMARY KEY("user_id","day")
);
--> statement-breakpoint
ALTER TABLE "user_activity" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_activity" ADD CONSTRAINT "user_activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "user_activity_day_idx" ON "user_activity" USING btree ("day");