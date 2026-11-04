import { jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// The home board's layout, one row per breakpoint (FRD §8, FR-SHELL-2). The
// json is whatever the owner last saved; lib/board/layout.ts cleans it on the
// way out, so an old or hand-edited row can never break the board.
// RLS on with no policies: only the app's role reads it.
export const boardLayout = pgTable(
  "board_layout",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    breakpoint: text("breakpoint").notNull(),
    layout: jsonb("layout").$type<unknown>().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("board_layout_user_breakpoint_idx").on(table.userId, table.breakpoint)],
).enableRLS();
