// Timer arithmetic for the activity bus. Pure and clock-free: every function
// takes `now` (epoch ms), so a timer is two numbers that survive a reload, a
// navigation or another tab, and the tests need no fake timers.

export interface Timer {
  id: string;
  label: string;
  /** The length it was set to, plus any time added. For the progress ring. */
  totalMs: number;
  /** Epoch ms when it ends, while running. */
  endsAt: number | null;
  /** Time left, while paused. */
  pausedLeftMs: number | null;
}

export const MINUTE = 60_000;
/** Longest timer the palette will start: a day. */
export const MAX_TIMER_MS = 24 * 60 * MINUTE;

export function createTimer(id: string, ms: number, now: number, label = defaultLabel(ms)): Timer {
  const total = clampMs(ms);
  return { id, label, totalMs: total, endsAt: now + total, pausedLeftMs: null };
}

export function remainingMs(t: Timer, now: number): number {
  if (t.pausedLeftMs !== null) return t.pausedLeftMs;
  return Math.max(0, (t.endsAt ?? now) - now);
}

export function isRunning(t: Timer): boolean {
  return t.pausedLeftMs === null;
}

export function isDone(t: Timer, now: number): boolean {
  return remainingMs(t, now) === 0;
}

/** 1 → 0 as the timer runs down. */
export function progress(t: Timer, now: number): number {
  return t.totalMs > 0 ? remainingMs(t, now) / t.totalMs : 0;
}

export function pause(t: Timer, now: number): Timer {
  if (!isRunning(t) || isDone(t, now)) return t;
  return { ...t, endsAt: null, pausedLeftMs: remainingMs(t, now) };
}

export function resume(t: Timer, now: number): Timer {
  if (isRunning(t)) return t;
  return { ...t, endsAt: now + (t.pausedLeftMs ?? 0), pausedLeftMs: null };
}

/** +5 min and friends. On a finished timer it starts it again with that much. */
export function addTime(t: Timer, ms: number, now: number): Timer {
  const left = remainingMs(t, now);
  const nextLeft = clampMs(left + ms);
  const totalMs = left === 0 ? nextLeft : Math.min(MAX_TIMER_MS, t.totalMs + (nextLeft - left));
  return isRunning(t) || left === 0
    ? { ...t, totalMs, endsAt: now + nextLeft, pausedLeftMs: null }
    : { ...t, totalMs, pausedLeftMs: nextLeft };
}

/** "25:00", "1:05:09". Rounds up, so a timer shows 0:00 only when it is done. */
export function formatClock(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

/**
 * What the palette understands as "start a timer": "25", "25m", "25 min",
 * "timer 10", "90s", "1h", "1h30". Returns ms, or null for anything else.
 */
export function parseTimerQuery(query: string): number | null {
  const q = query.trim().toLowerCase().replace(/^timer\s*/, "");
  const hm = /^(\d{1,2})\s*h(?:ours?)?\s*(?:(\d{1,2})\s*(?:m|min|mins|minutes?)?)?$/.exec(q);
  if (hm) return valid((Number(hm[1]) * 60 + Number(hm[2] ?? 0)) * MINUTE);
  const sec = /^(\d{1,5})\s*(?:s|sec|secs|seconds?)$/.exec(q);
  if (sec) return valid(Number(sec[1]) * 1000);
  const min = /^(\d{1,4})\s*(?:m|min|mins|minutes?)?$/.exec(q);
  if (min) return valid(Number(min[1]) * MINUTE);
  return null;
}

/** "25 min", "30 sec", "1 min 30 sec", "1 h 30 min". Seconds only under an hour. */
export function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const parts = [h > 0 ? `${String(h)} h` : "", m > 0 ? `${String(m)} min` : "", h === 0 && s > 0 ? `${String(s)} sec` : ""];
  return parts.filter(Boolean).join(" ") || "0 sec";
}

function defaultLabel(ms: number): string {
  return `${formatDuration(ms)} timer`;
}

function valid(ms: number): number | null {
  return ms > 0 && ms <= MAX_TIMER_MS ? ms : null;
}

function clampMs(ms: number): number {
  return Math.min(MAX_TIMER_MS, Math.max(0, Math.round(ms)));
}
