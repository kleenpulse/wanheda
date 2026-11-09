import { date, index, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { user } from "./auth";

// One row per user per UTC day they used Wanheda (ADR-0015): the admin page's
// daily, weekly and monthly active counts. Only the day is kept, never what was
// done or from where. Session rows can't stand in: Better Auth refreshes
// `updated_at` at most once a day per session, so they undercount.
// RLS on with no policies: only the app's role reads it.
export const userActivity = pgTable(
  "user_activity",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.userId, table.day] }), index("user_activity_day_idx").on(table.day)],
).enableRLS();
