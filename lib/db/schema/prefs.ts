import { char, jsonb, pgTable, text } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// The owner's preferences (FR-SHELL-7), one row per user. Plain text columns:
// lib/prefs/prefs.ts validates every value on the way in and on the way out,
// so a hand-edited row falls back to defaults instead of breaking the shell.
// RLS on with no policies: only the app's role reads it.
export const userPrefs = pgTable("user_prefs", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  skin: text("skin").notNull().default("default"),
  accent: text("accent"),
  wallpaper: text("wallpaper").notNull().default("none"),
  timerMode: text("timer_mode").notNull().default("single"),
  // Money (Phase 3): reports convert into this currency (decided 2026-11-05: NGN
  // by default), and "today" is the owner's calendar day in this zone (SPEC V27).
  baseCurrency: char("base_currency", { length: 3 }).notNull().default("NGN"),
  timeZone: text("time_zone").notNull().default("Africa/Lagos"),
  // Reader (Settings → Reader, 2026-11-06): covers, book pages, turn, text size,
  // paper, auto-scroll speed. Null until the first save; lib/reader/prefs.ts
  // checks it field by field, so a missing or bad field keeps the device's value.
  reader: jsonb("reader").$type<unknown>(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
