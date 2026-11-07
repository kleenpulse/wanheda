import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  doublePrecision,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth";
import { createdAt, updatedAt } from "./columns";

// Media (FRD 6.5, Phase 7). An item is a row here; a local file's bytes never
// leave the device it was opened on (SPEC V54, V38). `fp` is the identity key
// for every source: the quick hash of a local file, a normalised URL, or
// `<provider>:<id>` for an embed. The same fp on another device relinks the
// row and its playback state.

const at = (name: string) => timestamp(name, { withTimezone: true });
const owner = () =>
  text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" });

export const mediaItem = pgTable(
  "media_item",
  {
    id: uuid("id").primaryKey(), // client-made, replay-safe
    userId: owner(),
    kind: text("kind").notNull(),
    source: text("source").notNull(),
    fp: text("fp").notNull(),
    uri: text("uri").notNull(),
    title: text("title").notNull(),
    durationS: doublePrecision("duration_s"),
    meta: jsonb("meta").$type<unknown>().notNull().default(sql`'{}'::jsonb`),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("media_item_user_fp_uq").on(t.userId, t.fp),
    unique("media_item_id_user_uq").on(t.id, t.userId),
    index("media_item_user_created_idx").on(t.userId, t.createdAt.desc()),
    check("media_item_kind_ck", sql`${t.kind} in ('video', 'audio')`),
    check("media_item_source_ck", sql`${t.source} in ('local', 'url', 'embed', 'r2')`),
    check("media_item_duration_ck", sql`${t.durationS} is null or ${t.durationS} >= 0`),
  ],
).enableRLS();

// Where each item was left (V55). One row per item; T62 writes it.
export const playbackState = pgTable(
  "playback_state",
  {
    itemId: uuid("item_id").notNull(),
    userId: owner(),
    positionS: doublePrecision("position_s").notNull().default(0),
    watched: boolean("watched").notNull().default(false),
    lastPlayedAt: at("last_played_at").notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [
    primaryKey({ name: "playback_state_pk", columns: [t.itemId] }),
    foreignKey({ name: "playback_state_item_fk", columns: [t.itemId, t.userId], foreignColumns: [mediaItem.id, mediaItem.userId] }).onDelete("cascade"),
    index("playback_state_user_played_idx").on(t.userId, t.lastPlayedAt.desc()),
    check("playback_state_position_ck", sql`${t.positionS} >= 0`),
  ],
).enableRLS();

// Playlists (T66). Tracks point at an fp, not an item id: a music track lives
// in each device's own index (V58), so a playlist resolves by fp on whichever
// device plays it. The tables land with 0009 so T66 needs no migration.
export const playlist = pgTable(
  "playlist",
  {
    id: uuid("id").primaryKey(),
    userId: owner(),
    name: text("name").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [unique("playlist_id_user_uq").on(t.id, t.userId), index("playlist_user_idx").on(t.userId)],
).enableRLS();

export const playlistTrack = pgTable(
  "playlist_track",
  {
    playlistId: uuid("playlist_id").notNull(),
    userId: owner(),
    position: integer("position").notNull(),
    fp: text("fp").notNull(),
    title: text("title").notNull(),
    artist: text("artist"),
    durationS: doublePrecision("duration_s"),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ name: "playlist_track_pk", columns: [t.playlistId, t.position] }),
    foreignKey({ name: "playlist_track_playlist_fk", columns: [t.playlistId, t.userId], foreignColumns: [playlist.id, playlist.userId] }).onDelete("cascade"),
    check("playlist_track_position_ck", sql`${t.position} >= 0`),
  ],
).enableRLS();
