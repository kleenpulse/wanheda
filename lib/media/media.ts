// The media library's shared contract: query key, payload and write schemas.
// The server checks every write against the same rules the client used, so a
// row's fp always matches its source (V54) and an embed's uri always parses to
// an allowlisted provider (V56).

import { z } from "zod";
import { playOrder } from "./episodes";
import { MEDIA_KINDS, type MediaItem, type MediaMeta, type MediaProgress } from "./types";
import { parseMediaUrl } from "./url";

export const MEDIA_KEY = ["media"] as const;

export type MediaPayloadSource = "owner" | "demo" | "load-failed";
export type MediaPayload = { source: MediaPayloadSource; items: MediaItem[] };

export const TITLE_MAX = 200;
export const URI_MAX = 2048;
export const LIBRARY_LIMIT = 2000;
const FP_HEX = /^[0-9a-f]{64}$/;

const meta = z
  .object({
    size: z.number().int().nonnegative().max(2 ** 50).optional(),
    format: z.string().max(40).optional(),
    provider: z.string().max(20).optional(),
    folder: z.string().max(200).optional(),
  })
  .strict();

export const itemCreateSchema = z
  .object({
    id: z.uuid(),
    kind: z.enum(MEDIA_KINDS as [MediaItem["kind"], ...MediaItem["kind"][]]),
    // Uploads stay off until V38's bucket, so no `r2` items yet.
    source: z.enum(["local", "url", "embed"]),
    fp: z.string().min(1).max(URI_MAX),
    uri: z.string().min(1).max(URI_MAX),
    title: z.string().trim().min(1).max(TITLE_MAX),
    durationS: z.number().nonnegative().max(1e7).nullable(),
    meta,
  })
  .strict()
  .superRefine((d, ctx) => {
    if (d.source === "local") {
      if (!FP_HEX.test(d.fp)) ctx.addIssue({ code: "custom", message: "bad fp", path: ["fp"] });
      if (d.uri.length > 255) ctx.addIssue({ code: "custom", message: "name too long", path: ["uri"] });
      return;
    }
    const parsed = parseMediaUrl(d.uri);
    const want = d.source === "embed" ? "embed" : "url";
    if (parsed.kind !== want || parsed.fp !== d.fp) ctx.addIssue({ code: "custom", message: "fp does not match uri", path: ["fp"] });
  });

export type ItemCreate = z.infer<typeof itemCreateSchema>;

export const idSchema = z.object({ id: z.uuid() }).strict();

export const watchLaterSchema = z.object({ id: z.uuid(), on: z.boolean() }).strict();

/** Where an item was left (V55). `at` is the client's clock in ms; newer wins on the server. */
export const playbackWriteSchema = z
  .object({
    itemId: z.uuid(),
    positionS: z.number().nonnegative().max(1e7),
    watched: z.boolean(),
    at: z.number().int().positive(),
  })
  .strict();

export type PlaybackWrite = z.infer<typeof playbackWriteSchema>;

export type PlaybackReply =
  | { ok: true; kind: "saved" | "stale"; progress: MediaProgress }
  | { ok: false; reason: "demo" | "invalid" | "failed" | "gone" };

export type MediaFail = { ok: false; reason: "demo" | "invalid" | "off" | "failed" | "gone" | "not-yours" };
export type ItemReply = { ok: true; item: MediaItem; existing: boolean } | MediaFail;
export type DeleteReply = { ok: true } | MediaFail;

/** The item's place in /media: `?m=` is the item playing. */
export function mediaHref(id: string): `/media?m=${string}` {
  return `/media?m=${encodeURIComponent(id)}`;
}

/** Newest first, as the library lists them. */
export function sortItems(items: readonly MediaItem[]): MediaItem[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Adds or replaces one item in a payload, matched by id or by fp (a relink). */
export function upsertItem(items: readonly MediaItem[], item: MediaItem): MediaItem[] {
  return sortItems([item, ...items.filter((i) => i.id !== item.id && i.fp !== item.fp)]);
}

/**
 * The item `dir` steps from `id` in its play order (episodes.ts: the rest of
 * its show in episode order, else the library list), for the prev|next media
 * keys, Shift+N|P and autoplay, so they all agree with the up-next rail (T72).
 * Embeds are passed over: a provider iframe never takes the keys, so landing
 * on one would end the run. Null at either end, or when `id` is gone.
 */
export function stepItem(items: readonly MediaItem[], id: string, dir: 1 | -1): MediaItem | null {
  const current = items.find((i) => i.id === id);
  if (!current) return null;
  const order = playOrder(items, current);
  const at = order.findIndex((i) => i.id === id);
  for (let i = at + dir; i >= 0 && i < order.length; i += dir) {
    const item = order[i];
    if (item && item.source !== "embed") return item;
  }
  return null;
}

/** "1:02:03", "4:05", or "" for an unknown duration. */
export function formatDuration(s: number | null): string {
  if (s === null || !Number.isFinite(s) || s < 0) return "";
  const t = Math.round(s);
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const sec = String(t % 60).padStart(2, "0");
  return h > 0 ? `${String(h)}:${String(m).padStart(2, "0")}:${sec}` : `${String(m)}:${sec}`;
}

/** The meta a stored row may carry: only these keys survive a read (the store's whitelist). */
export function toMeta(raw: unknown): MediaMeta {
  if (typeof raw !== "object" || raw === null) return {};
  const r = raw as Record<string, unknown>;
  return {
    ...(typeof r.size === "number" ? { size: r.size } : {}),
    ...(typeof r.format === "string" ? { format: r.format } : {}),
    ...(typeof r.provider === "string" ? { provider: r.provider } : {}),
    ...(typeof r.folder === "string" ? { folder: r.folder.slice(0, 200) } : {}),
  };
}
