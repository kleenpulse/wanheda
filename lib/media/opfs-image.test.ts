import { describe, expect, it, vi } from "vitest";
import { createImageCache, extFor, thumbKey } from "./opfs-image";

describe("createImageCache", () => {
  it("never keeps a miss: a picture made after the first look still shows", async () => {
    let stored: string | null = null;
    const load = vi.fn(() => Promise.resolve(stored));
    const cache = createImageCache(load);
    expect(await cache.get("d", "k")).toBeNull();
    stored = "blob:made-later";
    expect(await cache.get("d", "k")).toBe("blob:made-later");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("keeps a found picture, and forgets it (revoking the URL) when it changes", async () => {
    const load = vi.fn(() => Promise.resolve("blob:one"));
    const cache = createImageCache(load);
    await cache.get("d", "k");
    await cache.get("d", "k");
    expect(load).toHaveBeenCalledTimes(1);
    const revoke = vi.fn();
    cache.drop("d", "k", revoke);
    await Promise.resolve();
    await Promise.resolve();
    expect(revoke).toHaveBeenCalledWith("blob:one");
    await cache.get("d", "k");
    expect(load).toHaveBeenCalledTimes(2);
  });
});

describe("extFor", () => {
  it("keeps the type the encoder really gave (Safari's WebP request returns PNG)", () => {
    expect(extFor("image/webp")).toBe("webp");
    expect(extFor("image/png")).toBe("png");
    expect(extFor("image/jpeg")).toBe("jpg");
  });
});

describe("thumbKey", () => {
  it("is the sha256 hex of the fp, safe as a file name for any source", async () => {
    const k = await thumbKey("youtube:dQw4w9WgXcQ");
    expect(k).toMatch(/^[0-9a-f]{64}$/);
    expect(await thumbKey("youtube:dQw4w9WgXcQ")).toBe(k);
    expect(await thumbKey("https://example.com/a.mp4")).not.toBe(k);
  });
});
