// What the floating island shows (V70), as plain data the desktop shell can
// carry from the main window to the island window (desktop/island.ts checks
// it there). Pure: island-mirror.tsx gathers the stores, this shapes them.
// Timers aren't here: the island window reads the shared activity store,
// like a second tab. No amounts (V25): alert text is the notice's own.

export type IslandItem =
  | { kind: "media"; id: string; title: string; artist: string; coverKey: string | null; playing: boolean; startedAt: number }
  | { kind: "speech"; id: string; title: string; progress: number; paused: boolean; path: string | null; startedAt: number }
  | { kind: "transfer"; id: string; label: string; detail: string; progress: number | null; failed: boolean }
  | { kind: "alert"; id: string; noticeId: string; tag: "money" | "income"; title: string; body: string; path: string | null };

export type IslandSnapshot = { items: IslandItem[]; lastTimer: string | null; lastTimerAt: number };

/** What the floating island's buttons ask the main window to do (`open` is the shell's own). */
export type IslandCommand =
  | { kind: "music"; action: "toggle" | "next" | "previous" }
  | { kind: "speech"; action: "toggle" | "stop" }
  | { kind: "dismiss"; noticeId: string }
  | { kind: "open"; path: string };

/** The shell's limits (desktop/island.ts): longer text would drop the whole snapshot. */
const MAX_TEXT = 200;
const MAX_BODY = 300;
const MAX_ITEMS = 24;
const COVER_KEY = /^[A-Za-z0-9:_.-]{1,128}$/;

function clip(text: string, max = MAX_TEXT): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

const share = (n: number, of: number) => (of > 0 ? Math.min(1, Math.max(0, n / of)) : 0);
const time = (n: number) => (Number.isFinite(n) && n > 0 ? n : 0);
const pathOf = (href: string | null | undefined) => (href && href.startsWith("/") && !href.startsWith("//") ? href : null);

export interface SnapshotInput {
  music: { title: string; artist: string; coverKey: string | null; playing: boolean; startedAt: number } | null;
  speech: { title: string; sentence: number; total: number; paused: boolean; href: string | null; startedAt: number } | null;
  downloads: readonly { id: string; label: string; phase: string; received: number; total: number }[];
  remux: string | null;
  scan: { failed: boolean; parsed: number; toParse: number } | null;
  alerts: readonly { id: string; noticeId: string; tag: "money" | "income"; title: string; body: string | null; href: string | null }[];
  lastTimer: string | null;
  lastTimerAt: number;
}

export function buildIslandSnapshot(input: SnapshotInput): IslandSnapshot {
  const items: IslandItem[] = [];
  const { music, speech } = input;
  if (music) {
    items.push({
      kind: "media",
      id: "media",
      title: clip(music.title),
      artist: clip(music.artist),
      coverKey: music.coverKey !== null && COVER_KEY.test(music.coverKey) ? music.coverKey : null,
      playing: music.playing,
      startedAt: time(music.startedAt),
    });
  }
  if (speech) {
    items.push({
      kind: "speech",
      id: "speech",
      title: clip(speech.title),
      progress: speech.total > 0 ? share(speech.sentence + 1, speech.total) : 0,
      paused: speech.paused,
      path: pathOf(speech.href),
      startedAt: time(speech.startedAt),
    });
  }
  for (const d of input.downloads) {
    const failed = d.phase === "failed";
    const progress = failed || d.phase === "queued" ? null : share(d.received, d.total);
    const detail = failed ? "Download failed" : progress === null ? "Waiting for the download ahead" : `Downloading, ${String(Math.floor(progress * 100))}%`;
    items.push({ kind: "transfer", id: `transfer:${d.id}`, label: clip(`${d.label} voice`), detail, progress, failed });
  }
  if (input.remux !== null) items.push({ kind: "transfer", id: "remux", label: clip(input.remux), detail: "Preparing to play", progress: null, failed: false });
  if (input.scan) {
    const { failed, parsed, toParse } = input.scan;
    items.push({
      kind: "transfer",
      id: "scan",
      label: failed ? "Scan stopped" : "Reading new music",
      detail: failed ? "Open Music to try again" : `${parsed.toLocaleString()} of ${toParse.toLocaleString()} files`,
      progress: failed ? null : share(parsed, toParse),
      failed,
    });
  }
  for (const a of input.alerts) {
    items.push({ kind: "alert", id: a.id, noticeId: a.noticeId, tag: a.tag, title: clip(a.title), body: clip(a.body ?? "", MAX_BODY), path: pathOf(a.href) });
  }
  return { items: items.slice(0, MAX_ITEMS), lastTimer: input.lastTimer, lastTimerAt: time(input.lastTimerAt) };
}

/** Same content: a publish is skipped, so a store tick that changed nothing the island shows sends nothing. */
export function sameSnapshot(a: IslandSnapshot | null, b: IslandSnapshot): boolean {
  return a !== null && JSON.stringify(a) === JSON.stringify(b);
}
