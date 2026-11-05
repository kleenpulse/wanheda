import { sortNotes, type Note, type NoteWrite } from "./notes";

// The client side of note sync (ADR-0008), kept free of React so it can be
// tested. Local edits live in an overlay above the server list until the
// server confirms them, so a refetch or an RSC hydration that lands before
// the confirmation never rolls an edit back. The sender keeps one write per
// note in flight. T30 moves the queue into a Dexie outbox.

/** Local edits: a note, or null for one deleted here and not yet confirmed. */
export type Overlay = Readonly<Record<string, Note | null>>;

/** The list the owner sees: server notes with local edits on top. */
export function mergeNotes(server: readonly Note[], overlay: Overlay): Note[] {
  const out = new Map<string, Note>();
  for (const n of server) out.set(n.id, n);
  for (const [id, local] of Object.entries(overlay)) {
    if (local === null) out.delete(id);
    else out.set(id, local);
  }
  return sortNotes([...out.values()]);
}

export function upsertNote(notes: readonly Note[], next: Note): Note[] {
  const i = notes.findIndex((n) => n.id === next.id);
  if (i === -1) return [next, ...notes];
  const copy = [...notes];
  copy[i] = next;
  return copy;
}

export function removeNote(notes: readonly Note[], id: string): Note[] {
  return notes.filter((n) => n.id !== id);
}

/** What one send came back with: the save action's result, or a thrown request. */
export type SendResult =
  | { ok: true; kind: "saved" | "unchanged"; note: Note }
  | { ok: true; kind: "conflict"; note: Note; won: boolean }
  | { ok: false; reason: "demo" | "invalid" | "failed" };

/** Whether the server now holds this write's content (so later writes build on its version). */
export function landed(result: SendResult): result is Extract<SendResult, { ok: true }> {
  return result.ok && (result.kind !== "conflict" || result.won);
}

export type NoteStatus = "saving" | "saved" | "retrying" | "local" | "error";

export interface SenderOptions {
  send: (write: NoteWrite) => Promise<SendResult>;
  onResult: (write: NoteWrite, result: SendResult) => void;
  onStatus: (id: string, status: NoteStatus) => void;
  retryMs?: number;
  setTimer?: (fn: () => void, ms: number) => unknown;
}

/**
 * One write per note in flight; a newer write waits and replaces any older
 * one still waiting. A write that was waiting while an earlier one landed is
 * sent on the version that landing produced: it continues the same edit, so
 * it must not count as a conflict with itself. After a lost conflict nothing
 * is carried over, so the waiting write conflicts in turn and the later edit
 * wins by V23 with the other kept in history. Failed sends retry.
 */
export class NoteSender {
  readonly #inFlight = new Set<string>();
  readonly #waiting = new Map<string, NoteWrite>();
  readonly #landedVersion = new Map<string, number>();
  readonly #retrying = new Set<string>();
  readonly #opts: Required<SenderOptions>;

  constructor(opts: SenderOptions) {
    this.#opts = { retryMs: 5_000, setTimer: (fn, ms) => setTimeout(fn, ms), ...opts };
  }

  enqueue(write: NoteWrite): void {
    if (this.#inFlight.has(write.id) || this.#retrying.has(write.id)) {
      this.#waiting.set(write.id, write);
      return;
    }
    void this.#send(write);
  }

  /** True while a note has a write in flight, waiting or retrying. */
  busy(id: string): boolean {
    return this.#inFlight.has(id) || this.#waiting.has(id) || this.#retrying.has(id);
  }

  async #send(write: NoteWrite): Promise<void> {
    const { id } = write;
    this.#inFlight.add(id);
    this.#opts.onStatus(id, "saving");
    const known = this.#landedVersion.get(id);
    const sent = known !== undefined && known > write.baseVersion ? { ...write, baseVersion: known } : write;

    let result: SendResult;
    try {
      result = await this.#opts.send(sent);
    } catch {
      result = { ok: false, reason: "failed" };
    }
    this.#inFlight.delete(id);

    if (result.ok) {
      if (landed(result)) this.#landedVersion.set(id, result.note.version);
      else this.#landedVersion.delete(id);
    }
    this.#opts.onResult(sent, result);

    if (!result.ok && result.reason === "failed") {
      // Keep the newest content; try again later.
      if (!this.#waiting.has(id)) this.#waiting.set(id, sent);
      this.#retrying.add(id);
      this.#opts.onStatus(id, "retrying");
      this.#opts.setTimer(() => {
        this.#retrying.delete(id);
        this.#next(id);
      }, this.#opts.retryMs);
      return;
    }

    const status: NoteStatus = result.ok ? "saved" : result.reason === "demo" ? "local" : "error";
    if (!this.#next(id)) this.#opts.onStatus(id, status);
  }

  #next(id: string): boolean {
    const next = this.#waiting.get(id);
    if (!next) return false;
    this.#waiting.delete(id);
    void this.#send(next);
    return true;
  }
}
