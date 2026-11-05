import { sql } from "drizzle-orm";
import { boolean, customType, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

const tsvector = customType<{ data: string }>({
  dataType: () => "tsvector",
});

// Sticky notes (FR-NOTES-1). The id is made on the client, so a write replayed
// from the offline outbox lands once (SPEC V23). `version` counts accepted
// writes and `edited_at` is the client's clock at the edit: together they
// settle a conflict between two devices (lib/notes/notes.ts resolveWrite).
// The board and reminder columns arrive now so Phase 2 needs one migration.
// RLS on with no policies: only the app's role reads it.
export const note = pgTable(
  "note",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull().default(""),
    bodyMd: text("body_md").notNull().default(""),
    color: text("color").notNull().default("plain"),
    pinned: boolean("pinned").notNull().default(false),
    archived: boolean("archived").notNull().default(false),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    boardX: integer("board_x"),
    boardY: integer("board_y"),
    boardW: integer("board_w"),
    boardH: integer("board_h"),
    remindAt: timestamp("remind_at", { withTimezone: true }),
    version: integer("version").notNull().default(1),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    // `simple`, not `english`: no stemming or stop words, so any language and
    // any exact word is found. Prefix queries cover "buy" → "buying".
    search: tsvector("search").generatedAlwaysAs(
      sql`setweight(to_tsvector('simple', coalesce("title", '')), 'A') || setweight(to_tsvector('simple', coalesce("body_md", '')), 'B')`,
    ),
  },
  (table) => [
    index("note_user_updated_idx").on(table.userId, table.updatedAt.desc()),
    index("note_search_idx").using("gin", table.search),
  ],
).enableRLS();

// The losing side of a conflict (FR-NOTES-4): what a note held before a newer
// write from another device replaced it, or a write that arrived late and lost.
// Nothing is ever lost from history, only from view.
export const noteRevision = pgTable(
  "note_revision",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    noteId: uuid("note_id")
      .notNull()
      .references(() => note.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull(),
    replacedAt: timestamp("replaced_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index("note_revision_note_idx").on(table.noteId, table.replacedAt.desc())],
).enableRLS();
