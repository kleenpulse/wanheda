import { describe, expect, it } from "vitest";
import { formatDuration, itemCreateSchema, stepItem, upsertItem } from "./media";
import { seedMedia } from "./seed";
import type { MediaItem } from "./types";

const base = { id: "4f5a3c2e-1b2d-4e6f-8a9b-0c1d2e3f4a5b", kind: "video", title: "Clip", durationS: 12.5, meta: {} } as const;

describe("itemCreateSchema", () => {
  it("accepts a local file by its 64-hex fp", () => {
    expect(itemCreateSchema.safeParse({ ...base, source: "local", fp: "a".repeat(64), uri: "clip.mkv" }).success).toBe(true);
    expect(itemCreateSchema.safeParse({ ...base, source: "local", fp: "nothex", uri: "clip.mkv" }).success).toBe(false);
  });

  it("accepts an embed only when its fp matches what the uri parses to", () => {
    const uri = "https://youtu.be/dQw4w9WgXcQ";
    expect(itemCreateSchema.safeParse({ ...base, source: "embed", fp: "youtube:dQw4w9WgXcQ", uri }).success).toBe(true);
    expect(itemCreateSchema.safeParse({ ...base, source: "embed", fp: "youtube:AAAAAAAAAAA", uri }).success).toBe(false);
    expect(itemCreateSchema.safeParse({ ...base, source: "embed", fp: "https://evil.example/", uri: "https://evil.example/" }).success).toBe(false);
  });

  it("accepts a direct URL whose fp is its normalised form, and no r2 yet", () => {
    const uri = "https://example.com/a.mp4";
    expect(itemCreateSchema.safeParse({ ...base, source: "url", fp: uri, uri }).success).toBe(true);
    expect(itemCreateSchema.safeParse({ ...base, source: "url", fp: "javascript:alert(1)", uri: "javascript:alert(1)" }).success).toBe(false);
    expect(itemCreateSchema.safeParse({ ...base, source: "r2", fp: uri, uri }).success).toBe(false);
  });

  it("rejects unknown meta keys", () => {
    expect(itemCreateSchema.safeParse({ ...base, source: "local", fp: "a".repeat(64), uri: "x", meta: { embedSrc: "https://evil" } }).success).toBe(false);
  });
});

describe("library helpers", () => {
  it("upsert replaces by id or fp and keeps newest first", () => {
    const items = seedMedia(Date.parse("2026-11-07T12:00:00Z"));
    const first = items[0] as MediaItem;
    const relinked = { ...first, id: "4f5a3c2e-1b2d-4e6f-8a9b-0c1d2e3f4a5b", createdAt: "2027-01-01T00:00:00.000Z" };
    const next = upsertItem(items, relinked);
    expect(next).toHaveLength(items.length);
    expect(next[0]).toBe(relinked);
  });

  it("every seed item passes the write schema", () => {
    for (const i of seedMedia(Date.now())) {
      const { id, kind, source, fp, uri, title, durationS, meta } = i;
      expect(itemCreateSchema.safeParse({ id, kind, source, fp, uri, title, durationS, meta }).success).toBe(true);
    }
  });

  it("formats durations", () => {
    expect(formatDuration(null)).toBe("");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(3723)).toBe("1:02:03");
  });
});

describe("stepItem (prev|next media keys on a video)", () => {
  const at = (id: string, source: MediaItem["source"]): MediaItem =>
    ({ id, kind: "video", source, fp: id, uri: id, title: id, durationS: null, meta: {}, watchLaterAt: null, progress: null, createdAt: "", updatedAt: "" });
  const items = [at("a", "local"), at("b", "embed"), at("c", "url"), at("d", "local")];

  it("moves down and up the list, passing over embeds", () => {
    expect(stepItem(items, "a", 1)?.id).toBe("c");
    expect(stepItem(items, "c", 1)?.id).toBe("d");
    expect(stepItem(items, "d", -1)?.id).toBe("c");
    expect(stepItem(items, "c", -1)?.id).toBe("a");
  });

  it("is null at either end, past only embeds, or when the item is gone", () => {
    expect(stepItem(items, "d", 1)).toBeNull();
    expect(stepItem(items, "a", -1)).toBeNull();
    expect(stepItem([at("a", "local"), at("b", "embed")], "a", 1)).toBeNull();
    expect(stepItem(items, "zz", 1)).toBeNull();
  });

  it("steps off an embed to its neighbour", () => {
    expect(stepItem(items, "b", 1)?.id).toBe("c");
    expect(stepItem(items, "b", -1)?.id).toBe("a");
  });
});
