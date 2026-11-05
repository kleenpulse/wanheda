import "server-only";
import { and, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { fxRate } from "@/lib/db/schema";
import { addDays, isDay, type Day } from "./dates";
import { cleanRates, FX_HISTORY_START, ratesFromTable, type FxRate } from "./fx";

/*
  Daily FX rates (FR-MONEY-14, decided 2026-11-05: the fawazahmed0 currency
  API). There is no cron (as with V31's reminders): the first read of a day
  fetches that day, and a read over older days fills the ones still missing,
  a few at a time, newest first. Rates are public and the same for everyone,
  so `fx_rate` has no owner. A failed fetch is tried again later; a read never
  waits on more than one round of fetches.
*/

/** Days fetched per read at most; the client asks again while `incomplete`. */
const FETCH_PER_READ = 31;
const PARALLEL = 6;
const TIMEOUT_MS = 8_000;
/** A day that failed is left alone this long (per server instance). */
const RETRY_AFTER_MS = 60 * 60 * 1000;

const tried = new Map<string, number>();

const sourceSchema = z.object({ date: z.string(), usd: z.record(z.string(), z.unknown()) });

/** `date`: a Day, or "latest". */
function urls(date: string): string[] {
  return [
    `https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@${date}/v1/currencies/usd.min.json`,
    `https://${date}.currency-api.pages.dev/v1/currencies/usd.min.json`,
  ];
}

/** One day's table from the source (a mirror if the first fails), or null. */
async function fetchDay(date: string): Promise<FxRate[] | null> {
  for (const url of urls(date)) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
      if (!res.ok) continue;
      const parsed = sourceSchema.safeParse(await res.json());
      if (!parsed.success || !isDay(parsed.data.date)) continue;
      // "latest" says which day it is; a dated file must be that day.
      if (date !== "latest" && parsed.data.date !== date) continue;
      const rates = ratesFromTable(parsed.data.date, parsed.data.usd);
      if (rates.length > 0) return rates;
    } catch {
      // Next mirror.
    }
  }
  return null;
}

async function store(rates: readonly FxRate[]): Promise<void> {
  const db = getDb();
  if (!db || rates.length === 0) return;
  await db
    .insert(fxRate)
    .values(rates.map((r) => ({ onDate: r.on, base: r.base, quote: r.quote, rate: r.rate })))
    .onConflictDoNothing({ target: [fxRate.onDate, fxRate.base, fxRate.quote] });
}

async function storedDays(from: Day, to: Day): Promise<Set<Day>> {
  const db = getDb();
  if (!db) return new Set();
  const rows = await db
    .selectDistinct({ on: fxRate.onDate })
    .from(fxRate)
    .where(and(gte(fxRate.onDate, from), lte(fxRate.onDate, to)));
  return new Set(rows.map((r) => r.on));
}

function due(key: string, now: number): boolean {
  const at = tried.get(key);
  return at === undefined || now - at > RETRY_AFTER_MS;
}

/**
 * Fetches the days in [from, today] that are not stored yet: today through
 * "latest", older ones by date, at most FETCH_PER_READ per call. Returns
 * whether days are still missing that a later call would fetch.
 */
export async function ensureRates(from: Day, today: Day, now = Date.now()): Promise<boolean> {
  if (!getDb()) return false;
  const start = from < FX_HISTORY_START ? FX_HISTORY_START : from;
  if (start > today) return false;
  const have = await storedDays(start, today);
  const missing: Day[] = [];
  for (let d = today; d >= start; d = addDays(d, -1)) if (!have.has(d)) missing.push(d);
  if (missing.length === 0) return false;

  const jobs: string[] = [];
  if (!have.has(today) && due("latest", now)) jobs.push("latest");
  // The source publishes a day after it ends, so today itself comes only through "latest".
  const older = missing.filter((d) => d !== today && due(d, now));
  jobs.push(...older.slice(0, FETCH_PER_READ));
  for (const j of jobs) tried.set(j, now);

  for (let i = 0; i < jobs.length; i += PARALLEL) {
    const batch = await Promise.all(jobs.slice(i, i + PARALLEL).map((j) => fetchDay(j)));
    const rates = batch.flatMap((r) => r ?? []);
    try {
      await store(rates);
    } catch (error) {
      console.error("fx: storing rates failed", error);
      return true;
    }
  }
  return older.length > FETCH_PER_READ;
}

/**
 * Stored rates for [from, to], plus the latest day before `from`, so the
 * first days of the range convert too (V26: the latest earlier rate).
 */
export async function readRates(from: Day, to: Day): Promise<FxRate[] | null> {
  const db = getDb();
  if (!db) return null;
  try {
    const floor = sql`coalesce((select max(${fxRate.onDate}) from ${fxRate} where ${fxRate.onDate} <= ${from}), ${from})`;
    const rows = await db
      .select({ on: fxRate.onDate, base: fxRate.base, quote: fxRate.quote, rate: fxRate.rate })
      .from(fxRate)
      .where(and(gte(fxRate.onDate, floor), lte(fxRate.onDate, to)));
    return cleanRates(rows);
  } catch (error) {
    console.error("fx: reading rates failed", error);
    return null;
  }
}
