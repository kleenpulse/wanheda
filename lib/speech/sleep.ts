// The sleep timer (V49): speech pauses after a number of minutes, or when the
// voice reaches the next chapter. Pure, so the store and its views agree.

/** What the owner picks. */
export type SleepChoice = { kind: "minutes"; minutes: number } | { kind: "chapter" };

/** A running sleep timer: the wall-clock time it pauses at, or the sentence it pauses on. */
export type Sleep = { kind: "minutes"; minutes: number; at: number } | { kind: "chapter"; end: number };

/** The minute choices, in the order a sleep chip cycles through them. */
export const SLEEP_MINUTES = [15, 30, 45, 60] as const;

/**
 * The first sentence of the chapter after `sentence`: where "end of chapter"
 * pauses. `starts` are the chapters' first sentences, ascending. With no
 * later chapter it is `total`, the end of the document.
 */
export function chapterEnd(starts: readonly number[], sentence: number, total: number): number {
  for (const s of starts) if (s > sentence) return s;
  return total;
}

export function startSleep(choice: SleepChoice, now: number, starts: readonly number[], sentence: number, total: number): Sleep {
  return choice.kind === "minutes"
    ? { kind: "minutes", minutes: choice.minutes, at: now + choice.minutes * 60_000 }
    : { kind: "chapter", end: chapterEnd(starts, sentence, total) };
}

/**
 * The next choice for a chip that cycles: off, each minute choice, end of
 * chapter (only when the document has chapters), then off again.
 */
export function nextSleep(current: Sleep | null, hasChapters: boolean): SleepChoice | null {
  const order: (SleepChoice | null)[] = [null, ...SLEEP_MINUTES.map((minutes) => ({ kind: "minutes", minutes }) as const)];
  if (hasChapters) order.push({ kind: "chapter" });
  const at = current === null ? 0 : order.findIndex((c) => c !== null && c.kind === current.kind && (c.kind === "chapter" || (current.kind === "minutes" && c.minutes === current.minutes)));
  return order[(Math.max(0, at) + 1) % order.length] ?? null;
}

/** "12:05" left of a minute timer, or "End of chapter". */
export function sleepLabel(sleep: Sleep, now: number): string {
  if (sleep.kind === "chapter") return "End of chapter";
  const s = Math.max(0, Math.ceil((sleep.at - now) / 1000));
  return `${String(Math.floor(s / 60))}:${String(s % 60).padStart(2, "0")}`;
}
