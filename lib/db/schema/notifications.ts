import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt } from "./columns";

// Past alerts for the notification centre (FR-SHELL-6): timers now; renewals,
// budget crossings, webhooks and downloads as their modules land. `read_at`
// null means unread. `dedupe_key` makes an alert raised twice (two tabs, a
// retried webhook) land once.
// RLS on with no policies: only the app's role reads it.
export const notification = pgTable(
  "notification",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    dedupeKey: text("dedupe_key").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("notification_user_dedupe_idx").on(table.userId, table.dedupeKey),
    index("notification_user_created_idx").on(table.userId, table.createdAt.desc()),
  ],
).enableRLS();
