import { pgTable, text } from "drizzle-orm/pg-core";
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
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}).enableRLS();
