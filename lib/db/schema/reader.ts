import { sql } from "drizzle-orm";
import {
  bigint,
  char,
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// Reader (FRD 6.5, Phase 5). A document is a row here and bytes elsewhere: in
// each device's OPFS while R2 is off (SPEC V38, decided 2026-11-06), in a
// private R2 bucket once it is on. The server never holds the bytes.
// Identity is the sha256 of the bytes per user (V39), so the same file opened
// on another device finds its row, relinks and resumes.
//
// Every child row carries user_id and points at its parent through
// (id, user_id), so a link between two users' rows can't exist even if a
// store check were wrong. RLS on with no policies: only the app's role reads.

const at = (name: string) => timestamp(name, { withTimezone: true });
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const document = pgTable(
  "document",
  {
    // Made on the client, so a create replayed from a retry lands once.
    id: uuid("id").primaryKey(),
    userId: owner(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    author: text("author"),
    // The name the file had when first opened, for the "open it on this device" prompt.
    fileName: text("file_name").notNull().default(""),
    sha256: char("sha256", { length: 64 }).notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    pages: integer("pages"),
    // Null while the file lives only on devices (local-only, V38).
    r2Key: text("r2_key"),
    coverKey: text("cover_key"),
    tags: text("tags")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    mode: text("mode").notNull().default("scroll"),
    lastOpenedAt: at("last_opened_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("document_user_sha_uq").on(t.userId, t.sha256),
    unique("document_id_user_uq").on(t.id, t.userId),
    index("document_user_opened_idx").on(t.userId, t.lastOpenedAt.desc()),
    check("document_kind_ck", sql`${t.kind} in ('pdf', 'md', 'txt', 'epub')`),
    check("document_mode_ck", sql`${t.mode} in ('scroll', 'flip')`),
    check("document_sha_ck", sql`${t.sha256} ~ '^[0-9a-f]{64}$'`),
    check("document_size_ck", sql`${t.sizeBytes} >= 0`),
  ],
).enableRLS();

export const collection = pgTable(
  "collection",
  {
    id: uuid("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("collection_user_name_uq").on(t.userId, t.name), unique("collection_id_user_uq").on(t.id, t.userId)],
).enableRLS();

export const documentCollection = pgTable(
  "document_collection",
  {
    documentId: uuid("document_id").notNull(),
    collectionId: uuid("collection_id").notNull(),
    userId: owner(),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "document_collection_pk", columns: [t.documentId, t.collectionId] }),
    foreignKey({ name: "document_collection_document_fk", columns: [t.documentId, t.userId], foreignColumns: [document.id, document.userId] }).onDelete(
      "cascade",
    ),
    foreignKey({
      name: "document_collection_collection_fk",
      columns: [t.collectionId, t.userId],
      foreignColumns: [collection.id, collection.userId],
    }).onDelete("cascade"),
    index("document_collection_collection_idx").on(t.collectionId),
  ],
).enableRLS();

// One row per document (V41). `at` is the client's clock at the reading
// position: a write only lands over an older one, so a stale tab or device
// can't drag a newer position back.
export const readingProgress = pgTable(
  "reading_progress",
  {
    documentId: uuid("document_id").notNull(),
    userId: owner(),
    locator: text("locator").notNull(),
    percent: integer("percent").notNull(),
    at: at("at").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "reading_progress_pk", columns: [t.documentId] }),
    foreignKey({ name: "reading_progress_document_fk", columns: [t.documentId, t.userId], foreignColumns: [document.id, document.userId] }).onDelete(
      "cascade",
    ),
    check("reading_progress_percent_ck", sql`${t.percent} between 0 and 100`),
  ],
).enableRLS();

// Highlights and notes on a selection (T52, P1). The table lands with 0007 so
// that feature needs no second migration.
export const highlight = pgTable(
  "highlight",
  {
    id: uuid("id").primaryKey(),
    documentId: uuid("document_id").notNull(),
    userId: owner(),
    locator: text("locator").notNull(),
    endLocator: text("end_locator"),
    quote: text("quote").notNull(),
    note: text("note").notNull().default(""),
    color: text("color").notNull().default("yellow"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    foreignKey({ name: "highlight_document_fk", columns: [t.documentId, t.userId], foreignColumns: [document.id, document.userId] }).onDelete("cascade"),
    index("highlight_document_idx").on(t.documentId, t.createdAt),
  ],
).enableRLS();
