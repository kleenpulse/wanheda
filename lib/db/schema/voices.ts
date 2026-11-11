import { jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// The read-aloud voices the owner keeps (SPEC V83): catalog ids, so another
// device can offer to fetch what it's missing. The files stay per device.
// Its own table, not a user_prefs column: the shell's prefs read selects every
// user_prefs column, and this list must never be able to fail that read.
// lib/speech/account-voices.ts checks the ids on the way in and out.
// RLS on with no policies: only the app's role reads it.
export const accountVoices = pgTable("account_voices", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  voices: jsonb("voices").$type<unknown>().notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
