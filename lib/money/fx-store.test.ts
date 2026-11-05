import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FxRate } from "./fx";

// fx-store's fetch plan (FR-MONEY-14, V26; review nits on PR #21), against a
// fake `fx_rate` table and a stubbed source. The SQL itself ran against Neon
// in the T39 owner check.

// Each test imports a fresh module (its retry state is per instance); the first import is slow under a full parallel run.
vi.setConfig({ testTimeout: 20_000 });
vi.mock("server-only", () => ({}));

interface FakeDb {
  stored: FxRate[];
  failInsert: boolean;
  failSelect: boolean;
  selectDistinct: () => { from: () => { where: () => Promise<{ on: string }[]> } };
  select: () => { from: () => { where: () => Promise<FxRate[]> } };
  insert: () => { values: (rows: { onDate: string; base: string; quote: string; rate: string }[]) => { onConflictDoNothing: () => Promise<void> } };
}

function fakeDb(days: readonly string[] = []): FakeDb {
  const db: FakeDb = {
    stored: days.map((on) => ({ on, base: "USD", quote: "NGN", rate: "1500.00000000" })),
    failInsert: false,
    failSelect: false,
    selectDistinct: () => ({ from: () => ({ where: () => Promise.resolve([...new Set(db.stored.map((r) => r.on))].map((on) => ({ on }))) }) }),
    select: () => ({ from: () => ({ where: () => (db.failSelect ? Promise.reject(new Error("down")) : Promise.resolve(db.stored)) }) }),
    insert: () => ({
      values: (rows) => ({
        onConflictDoNothing: () => {
          if (db.failInsert) return Promise.reject(new Error("insert failed"));
          for (const r of rows) db.stored.push({ on: r.onDate, base: r.base as FxRate["base"], quote: r.quote as FxRate["quote"], rate: r.rate });
          return Promise.resolve();
        },
      }),
    }),
  };
  return db;
}

let db: FakeDb | null = null;
vi.mock("@/lib/db", () => ({ getDb: () => db }));

/** The source: `latest` answers with `newest`; a dated file answers for its own day unless listed as missing. */
function source(newest: string, opts: { missing?: readonly string[]; down?: boolean; firstMirrorDown?: boolean; wrongDate?: readonly string[] } = {}) {
  const calls: string[] = [];
  const fetch = vi.fn((url: string) => {
    const date = /@([\w-]+)\/v1/.exec(url)?.[1] ?? /^https:\/\/([\w-]+)\.currency-api/.exec(url)?.[1] ?? "";
    const mirror = url.includes("pages.dev");
    calls.push(mirror ? `mirror:${date}` : date);
    if (opts.down || (opts.firstMirrorDown && !mirror) || opts.missing?.includes(date)) return Promise.resolve(new Response("", { status: 404 }));
    const day = date === "latest" ? newest : opts.wrongDate?.includes(date) ? "2020-01-01" : date;
    return Promise.resolve(Response.json({ date: day, usd: { ngn: 1500.5, eur: 0.9 } }));
  });
  vi.stubGlobal("fetch", fetch);
  return { calls, fetch };
}

async function load() {
  vi.resetModules();
  return import("./fx-store");
}

const NOW = Date.parse("2026-11-05T12:00:00Z");
const HOUR = 60 * 60 * 1000;

beforeEach(() => {
  db = fakeDb();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const storedDays = () => [...new Set(db?.stored.map((r) => r.on))].sort();

describe("ensureRates", () => {
  it("does nothing without a database", async () => {
    db = null;
    const { fetch } = source("2026-11-05");
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-01", "2026-11-05", NOW)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("asks for latest first, then only the published days before it, newest first", async () => {
    const { calls } = source("2026-11-04");
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-01", "2026-11-05", NOW)).toBe(false);
    // Today (the 5th) is not published yet: never asked for by date.
    expect(calls).toEqual(["latest", "2026-11-03", "2026-11-02", "2026-11-01"]);
    expect(storedDays()).toEqual(["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
    // Stored in the direction ≥ 1, 8 places (V26).
    const first = db?.stored.filter((r) => r.on === "2026-11-01") ?? [];
    expect(first).toHaveLength(2);
    expect(first).toEqual(
      expect.arrayContaining([
        { on: "2026-11-01", base: "EUR", quote: "USD", rate: "1.11111111" },
        { on: "2026-11-01", base: "USD", quote: "NGN", rate: "1500.50000000" },
      ]),
    );
  });

  it("fetches nothing when every day is stored", async () => {
    db = fakeDb(["2026-11-03", "2026-11-04", "2026-11-05"]);
    const { fetch } = source("2026-11-05");
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-03", "2026-11-05", NOW)).toBe(false);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("fetches at most 31 days a read and says more are missing", async () => {
    const { calls } = source("2026-11-05");
    const { ensureRates } = await load();
    expect(await ensureRates("2026-09-01", "2026-11-05", NOW)).toBe(true);
    expect(calls).toHaveLength(32);
    expect(calls.slice(0, 3)).toEqual(["latest", "2026-11-04", "2026-11-03"]);
    // 4 Nov back to 5 Oct: 31 days.
    expect(calls.at(-1)).toBe("2026-10-05");
    // The next read carries on where this one stopped.
    calls.length = 0;
    expect(await ensureRates("2026-09-01", "2026-11-05", NOW)).toBe(true);
    expect(calls[0]).toBe("2026-10-04");
    calls.length = 0;
    expect(await ensureRates("2026-09-01", "2026-11-05", NOW)).toBe(false);
    expect(calls.at(-1)).toBe("2026-09-01");
    expect(storedDays()).toHaveLength(66);
  });

  it("never asks for days before the source's history starts", async () => {
    const { calls } = source("2024-03-04");
    const { ensureRates } = await load();
    await ensureRates("2024-02-20", "2024-03-04", NOW);
    expect(calls).toEqual(["latest", "2024-03-03", "2024-03-02"]);
    expect(await ensureRates("2024-01-01", "2024-02-28", NOW)).toBe(false);
  });

  it("tries the mirror when the first host fails, and refuses a file for another day", async () => {
    const { calls } = source("2026-11-05", { firstMirrorDown: true, wrongDate: ["2026-11-03"] });
    const { ensureRates } = await load();
    await ensureRates("2026-11-03", "2026-11-05", NOW);
    // Days in one batch are fetched in parallel, so only each day's own order is fixed.
    expect(calls.slice(0, 2)).toEqual(["latest", "mirror:latest"]);
    expect(calls.filter((c) => c.endsWith("2026-11-04"))).toEqual(["2026-11-04", "mirror:2026-11-04"]);
    expect(calls.filter((c) => c.endsWith("2026-11-03"))).toEqual(["2026-11-03", "mirror:2026-11-03"]);
    expect(calls).toHaveLength(6);
    expect(storedDays()).toEqual(["2026-11-04", "2026-11-05"]);
  });

  it("leaves a failed day alone for an hour, then tries it again", async () => {
    const { calls } = source("2026-11-05", { missing: ["2026-11-04"] });
    const { ensureRates } = await load();
    await ensureRates("2026-11-04", "2026-11-05", NOW);
    expect(calls).toEqual(["latest", "2026-11-04", "mirror:2026-11-04"]);
    calls.length = 0;
    expect(await ensureRates("2026-11-04", "2026-11-05", NOW + HOUR / 2)).toBe(false);
    expect(calls).toEqual([]);
    await ensureRates("2026-11-04", "2026-11-05", NOW + HOUR + 1);
    expect(calls).toEqual(["2026-11-04", "mirror:2026-11-04"]);
  });

  it("with the source down, fills older gaps up to the newest stored day", async () => {
    db = fakeDb(["2026-11-03"]);
    const { calls } = source("2026-11-05", { down: true });
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-01", "2026-11-05", NOW)).toBe(false);
    expect(calls.slice(0, 2)).toEqual(["latest", "mirror:latest"]);
    expect([...calls.slice(2)].sort()).toEqual(["2026-11-01", "2026-11-02", "mirror:2026-11-01", "mirror:2026-11-02"]);
  });

  it("with nothing stored and the source down, gives up quietly", async () => {
    const { calls } = source("2026-11-05", { down: true });
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-01", "2026-11-05", NOW)).toBe(false);
    expect(calls).toEqual(["latest", "mirror:latest"]);
  });

  it("says incomplete when storing fails", async () => {
    source("2026-11-05");
    db = fakeDb();
    db.failInsert = true;
    const { ensureRates } = await load();
    expect(await ensureRates("2026-11-01", "2026-11-05", NOW)).toBe(true);
  });
});

describe("ensureRatesWithin", () => {
  it("answers with the round's result when it is quick", async () => {
    source("2026-11-05");
    const { ensureRatesWithin } = await load();
    const later = vi.fn();
    expect(await ensureRatesWithin("2026-11-04", "2026-11-05", 1_000, later)).toBe(false);
    expect(later).not.toHaveBeenCalled();
  });

  it("hands a slow round to `later` and answers incomplete", async () => {
    let release: () => void = () => undefined;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        await gate;
        return Response.json({ date: "2026-11-05", usd: { ngn: 1500 } });
      }),
    );
    const { ensureRatesWithin } = await load();
    const later = vi.fn();
    expect(await ensureRatesWithin("2026-11-05", "2026-11-05", 10, later)).toBe(true);
    expect(later).toHaveBeenCalledTimes(1);
    release();
    await later.mock.calls[0]?.[0];
    expect(storedDays()).toEqual(["2026-11-05"]);
  });
});

describe("readRates", () => {
  it("returns clean rows, null without a database or on a failed read", async () => {
    db = fakeDb(["2026-11-04"]);
    db.stored.push({ on: "bad", base: "USD", quote: "NGN", rate: "1" });
    const { readRates } = await load();
    expect(await readRates("2026-11-04", "2026-11-05")).toEqual([{ on: "2026-11-04", base: "USD", quote: "NGN", rate: "1500.00000000" }]);
    db.failSelect = true;
    expect(await readRates("2026-11-04", "2026-11-05")).toBeNull();
    db = null;
    expect(await readRates("2026-11-04", "2026-11-05")).toBeNull();
  });
});
