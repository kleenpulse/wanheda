"use client";

import * as React from "react";
import type { Route } from "next";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { deleteNote, saveNote } from "@/actions/notes";
import { queueOwner } from "@/lib/device/scope";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { fetchJson } from "@/lib/fetch-json";
import {
  isBlank,
  NOTES_KEY,
  placeAfter,
  textOf,
  displayTitle,
  draftNote,
  hitOf,
  normalizeTags,
  sameContent,
  searchLocal,
  writeOf,
  type Note,
  type NoteContent,
  type NoteHit,
  type NotesPayload,
  type NotesSource,
  type RevisionsPayload,
} from "@/lib/notes/notes";
import { MemoryNotesStore, Outbox, type LocalNotesStore, type OutboxEvent } from "@/lib/notes/outbox";
import { landed, mergeNotes, removeNote, upsertNote, type NoteStatus, type Overlay } from "@/lib/notes/sync";

/*
  Notes on the client (ADR-0008, SPEC V23). The list is a TanStack query,
  prefetched by the notes page and hydrated, pulled again on focus, on
  reconnect and every 30 s. Edits go into a local overlay at once (the
  optimistic update), then into the outbox after a short pause in typing. The
  outbox lives in IndexedDB, so a write made offline or in a tab that closes
  is sent later; the overlay entry stays until the server has confirmed the
  write, so a pull can never roll an edit back. The last server list is kept
  on the device too, for when the server can't be reached. Tabs share the
  outbox and tell each other what landed. Lives in the shell, so the palette
  can capture and search from any page.
*/

const SEARCH_KEY = ["notes", "search"] as const;
const REVISIONS_KEY = ["notes", "revisions"] as const;
const TYPING_PAUSE_MS = 700;
const SYNC_MS = 30_000;
const SNAPSHOT_PAUSE_MS = 2_000;
const CHANNEL = "wanheda-notes";
const LOCK = "wanheda-notes-outbox";

/** A conflict the owner should hear about: `won` false means their edit went to history. */
export interface ConflictNote {
  id: string;
  won: boolean;
}

interface LocalState {
  overlay: Overlay;
  status: Readonly<Record<string, NoteStatus>>;
  conflict: ConflictNote | null;
  /** Writes waiting in the outbox, across tabs. */
  pending: number;
  online: boolean;
  /** The last server list kept on this device; null until loaded, or for demo. */
  snapshot: Note[] | null;
}

const useLocal = create<LocalState>(() => ({ overlay: {}, status: {}, conflict: null, pending: 0, online: true, snapshot: null }));

function setOverlay(id: string, note: Note | null) {
  useLocal.setState((s) => ({ overlay: { ...s.overlay, [id]: note } }));
}

function dropOverlay(id: string) {
  useLocal.setState((s) => {
    if (!(id in s.overlay)) return s;
    const { [id]: _gone, ...rest } = s.overlay;
    return { overlay: rest };
  });
}

function setStatus(id: string, status: NoteStatus) {
  useLocal.setState((s) => ({ status: { ...s.status, [id]: status } }));
}

export interface NotesApi {
  /** Changes a note; text waits for a pause in typing, everything else saves at once. */
  update: (id: string, patch: Partial<NoteContent>, opts?: { immediate?: boolean; restore?: boolean }) => void;
  /** A new note, saved once it has content. Returns its id. */
  create: (content?: Partial<NoteContent>) => string;
  /** Quick capture: a note with this body, saved at once (FR-NOTES-3). */
  capture: (text: string) => string;
  /** Deletes an archived note for good. */
  remove: (id: string) => void;
  /**
   * A surface (editor, note window) shows this note. The returned release
   * drops a note that never got a word (a "New note" left empty), but only
   * once no other surface still has it open.
   */
  hold: (id: string) => () => void;
  /** Sends every edit still waiting for a pause in typing. */
  flushAll: () => void;
  dismissConflict: () => void;
}

interface NotesRuntime extends NotesApi {
  /** Wires the outbox to this tab: boot from the device, listeners, sync ticks. Returns the cleanup. */
  start: () => () => void;
}

type ChannelMessage = { t: "event"; event: OutboxEvent } | { t: "status"; id: string; status: NoteStatus } | { t: "change" };

function cachedNote(qc: QueryClient, id: string): Note | undefined {
  return qc.getQueryData<NotesPayload>(NOTES_KEY)?.notes.find((n) => n.id === id) ?? useLocal.getState().snapshot?.find((n) => n.id === id);
}

function openStore(demo: boolean): Promise<LocalNotesStore> {
  if (demo || typeof indexedDB === "undefined") return Promise.resolve(new MemoryNotesStore());
  return import("@/lib/notes/local-store")
    .then((m) => m.openDeviceStore())
    .catch((error: unknown) => {
      console.error("notes: IndexedDB unavailable, keeping writes in memory", error);
      return new MemoryNotesStore();
    });
}

function withLock<T>(run: () => Promise<T>): Promise<T> {
  if (typeof navigator !== "undefined" && "locks" in navigator) return navigator.locks.request(LOCK, run);
  return run();
}

function isOnline(): boolean {
  return typeof navigator === "undefined" || navigator.onLine;
}

function createNotesRuntime(qc: QueryClient, demo: boolean): NotesRuntime {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Notes this tab has queued a write for: an emptied one stays, since the server has it. */
  const queued = new Set<string>();
  /** How many surfaces show each note (see `hold`). */
  const holds = new Map<string, number>();
  const store = openStore(demo);
  let channel: BroadcastChannel | null = null;
  const post = (message: ChannelMessage) => {
    channel?.postMessage(message);
  };

  // Server truth goes into the cache before the overlay entry is dropped. Any
  // fetch already in flight is cancelled first: it was asked before this write
  // landed, and would put the old version back.
  const confirm = (apply: (notes: Note[]) => Note[], then: () => void) => {
    void qc.cancelQueries({ queryKey: NOTES_KEY, exact: true }).then(() => {
      qc.setQueryData<NotesPayload>(NOTES_KEY, (old) => (old ? { ...old, notes: apply(old.notes) } : old));
      then();
    });
  };

  const refreshCount = async () => {
    useLocal.setState({ pending: await outbox.count() });
  };

  /** What an answered op means for this tab's view. Runs in every tab, whichever one sent it. */
  const applyEvent = (event: OutboxEvent) => {
    const id = event.op.noteId;
    if (event.kind === "delete") {
      if (event.result.ok) {
        confirm(
          (notes) => removeNote(notes, id),
          () => {
            if (useLocal.getState().overlay[id] === null) dropOverlay(id);
          },
        );
      } else if (useLocal.getState().overlay[id] === null) {
        dropOverlay(id); // refused: show the note again
      }
      return;
    }
    const { sent, result } = event;
    if (!result.ok) return; // invalid shows as an error; the edit stays on screen
    if (result.kind === "conflict" || sent.keepCurrent) void qc.invalidateQueries({ queryKey: [...REVISIONS_KEY, id] });
    // Deleted here since: the delete is queued behind this write and settles it.
    if (useLocal.getState().overlay[id] === null) return;
    if (result.kind === "conflict") {
      useLocal.setState({ conflict: { id, won: result.won } });
      if (document.visibilityState === "visible") {
        toast({
          id: `note-conflict-${id}`,
          title: "A note changed on two devices",
          body: `${displayTitle(result.note)}: ${result.won ? "your edit is newer and stays" : "the newer version is shown"}. The other one is in the note's history.`,
          action: { label: "Open note", href: `/notes?n=${id}` as Route },
        });
      }
    }
    confirm(
      (notes) => upsertNote(notes, result.note),
      () => {
        const local = useLocal.getState().overlay[id];
        if (local == null) return;
        const newerHere = local.editedAt > sent.editedAt || timers.has(id);
        if (!newerHere) dropOverlay(id);
        // Still typing on top of a write that landed: build on its version.
        else if (landed(result)) setOverlay(id, { ...local, version: result.note.version });
      },
    );
  };

  const outbox = new Outbox({
    store,
    sync: !demo,
    // The store's own account goes with each replayed write (V78).
    sendSave: (write) => saveNote(write, queueOwner()),
    sendDelete: (id) => deleteNote({ id }, queueOwner()),
    onEvent: (event) => {
      applyEvent(event);
      post({ t: "event", event });
    },
    onStatus: (id, status) => {
      setStatus(id, status);
      post({ t: "status", id, status });
    },
    onChange: () => {
      void refreshCount();
      post({ t: "change" });
    },
    online: isOnline,
    lock: withLock,
  });

  const send = (id: string, restore = false) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
    const local = useLocal.getState().overlay[id];
    if (!local) return;
    queued.add(id);
    // The place goes along only if it differs from the server's copy (SPEC V23).
    const write = writeOf(local, local.version, cachedNote(qc, id));
    void outbox.enqueue(restore ? { ...write, keepCurrent: true } : write);
  };

  const schedule = (id: string, immediate: boolean, restore = false) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    if (immediate) {
      timers.delete(id);
      send(id, restore);
      return;
    }
    timers.set(
      id,
      setTimeout(() => {
        send(id);
      }, TYPING_PAUSE_MS),
    );
  };

  const create: NotesApi["create"] = (content = {}) => {
    const id = crypto.randomUUID();
    const note = draftNote(id, Date.now(), { ...content, ...(content.tags ? { tags: normalizeTags(content.tags) } : {}) });
    setOverlay(id, note);
    if (!isBlank(note)) schedule(id, true);
    return id;
  };

  const flushAll = () => {
    for (const id of [...timers.keys()]) send(id);
  };

  /** After a reload: writes still in the outbox show on top of the list until they land. */
  const restorePending = async () => {
    const ops = await outbox.pending();
    const newest = new Map(ops.map((op) => [op.noteId, op]));
    const { overlay } = useLocal.getState();
    for (const [id, op] of newest) {
      if (id in overlay) continue;
      if (op.kind === "delete") {
        setOverlay(id, null);
        continue;
      }
      const base = cachedNote(qc, id) ?? draftNote(id, op.queuedAt);
      // An op that doesn't move the sticky carries no place: the note keeps its own.
      const board = placeAfter(base, op.write);
      setOverlay(id, { ...base, ...textOf(op.write), board, id, version: op.write.baseVersion, editedAt: op.write.editedAt });
      setStatus(id, isOnline() ? "saving" : "queued");
    }
  };

  const start = () => {
    if (demo) return () => undefined;
    const life = { stopped: false };
    channel = typeof BroadcastChannel === "undefined" ? null : new BroadcastChannel(CHANNEL);
    if (channel) {
      channel.onmessage = (e: MessageEvent<ChannelMessage>) => {
        const m = e.data;
        if (m.t === "event") applyEvent(m.event);
        else if (m.t === "status") setStatus(m.id, m.status);
        else void refreshCount();
      };
    }

    useLocal.setState({ online: isOnline() });
    void (async () => {
      const local = await store;
      const snapshot = await local.loadSnapshot().catch(() => null);
      if (life.stopped) return;
      useLocal.setState({ snapshot });
      await restorePending();
      await refreshCount();
      void outbox.flush();
    })();

    // Keep the last server list on the device, a little after it changes.
    let snapshotTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = qc.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.queryHash !== JSON.stringify(NOTES_KEY)) return;
      const data = event.query.state.data as NotesPayload | undefined;
      if (data?.source !== "owner") return;
      clearTimeout(snapshotTimer);
      snapshotTimer = setTimeout(() => {
        void store.then((s) => s.saveSnapshot(data.notes)).catch((error: unknown) => {
          console.error("notes: could not keep the list on this device", error);
        });
      }, SNAPSHOT_PAUSE_MS);
    });

    const flush = () => void outbox.flush();
    const onOnline = () => {
      useLocal.setState({ online: true });
      flush();
    };
    const onOffline = () => {
      useLocal.setState({ online: false });
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") flush();
      // Leaving the page or the tab: queue what's waiting for a pause in typing.
      else flushAll();
    };
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener("focus", flush);
    window.addEventListener("pagehide", flushAll);
    document.addEventListener("visibilitychange", onVisible);
    const tick = setInterval(flush, SYNC_MS);

    return () => {
      life.stopped = true;
      flushAll();
      clearInterval(tick);
      clearTimeout(snapshotTimer);
      unsubscribe();
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("focus", flush);
      window.removeEventListener("pagehide", flushAll);
      document.removeEventListener("visibilitychange", onVisible);
      channel?.close();
      channel = null;
    };
  };

  return {
    start,
    update(id, patch, opts = {}) {
      const base = useLocal.getState().overlay[id] ?? cachedNote(qc, id);
      if (!base) return;
      const next: Note = {
        ...base,
        ...patch,
        tags: patch.tags ? normalizeTags(patch.tags) : base.tags,
        editedAt: Math.max(Date.now(), base.editedAt + 1),
      };
      if (sameContent(base, next)) return;
      setOverlay(id, next);
      const textOnly = Object.keys(patch).every((k) => k === "title" || k === "bodyMd");
      schedule(id, opts.immediate ?? opts.restore ?? !textOnly, opts.restore);
    },
    create,
    capture: (text) => create({ bodyMd: text }),
    remove(id) {
      const note = useLocal.getState().overlay[id] ?? cachedNote(qc, id);
      if (!note?.archived) return;
      const timer = timers.get(id);
      if (timer !== undefined) clearTimeout(timer);
      timers.delete(id);
      setOverlay(id, null);
      // Queued behind the note's earlier writes, so the archive lands first.
      void outbox.remove(id);
    },
    hold(id) {
      holds.set(id, (holds.get(id) ?? 0) + 1);
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const left = (holds.get(id) ?? 1) - 1;
        if (left > 0) {
          holds.set(id, left);
          return;
        }
        holds.delete(id);
        // A tick later: a remount in the same tick (StrictMode, a key change) holds it again first.
        setTimeout(() => {
          if (holds.has(id)) return;
          const local = useLocal.getState().overlay[id];
          if (local && local.version === 0 && isBlank(local) && !queued.has(id)) dropOverlay(id);
        }, 0);
      };
    },
    flushAll,
    dismissConflict() {
      useLocal.setState({ conflict: null });
    },
  };
}

const Ctx = React.createContext<NotesApi | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const demo = useAccount().kind !== "owner";
  const runtime = React.useMemo(() => createNotesRuntime(qc, demo), [qc, demo]);

  React.useEffect(() => runtime.start(), [runtime]);

  // Demo has no outbox listeners; still queue typing when the tab is left.
  React.useEffect(() => {
    if (!demo) return;
    const flush = () => {
      if (document.visibilityState === "hidden") runtime.flushAll();
    };
    document.addEventListener("visibilitychange", flush);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      runtime.flushAll();
    };
  }, [demo, runtime]);

  return <Ctx.Provider value={runtime}>{children}</Ctx.Provider>;
}

export function useNotesApi(): NotesApi {
  const api = React.useContext(Ctx);
  if (!api) throw new Error("useNotesApi() outside NotesProvider");
  return api;
}

export interface NotesView {
  notes: Note[];
  source: NotesSource;
  loading: boolean;
  failed: boolean;
  /** The server couldn't be read, and the list shown is the copy kept on this device. */
  onDevice: boolean;
}

/** The list with local edits on top. `fetch` false: read what is cached, never ask the server. */
function useNotesList(fetch: boolean): NotesView {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => fetchJson<NotesPayload>("/api/notes"),
    enabled: fetch,
    // Demo has nothing to pull: its edits live only in this tab.
    staleTime: demo ? Infinity : 30_000,
    refetchOnWindowFocus: demo ? false : "always",
    refetchOnReconnect: demo ? false : "always",
    refetchInterval: demo ? false : SYNC_MS,
  });
  const overlay = useLocal((s) => s.overlay);
  const snapshot = useLocal((s) => s.snapshot);
  const fresh = query.data?.source === "owner" || query.data?.source === "demo" ? query.data.notes : null;
  const fallback = query.data?.notes;
  const notes = React.useMemo(() => mergeNotes(fresh ?? snapshot ?? fallback ?? [], overlay), [fresh, snapshot, fallback, overlay]);
  const source = query.data?.source ?? (demo ? "demo" : "owner");
  const failed = query.isError || source === "load-failed";
  return { notes, source, loading: query.isPending && !snapshot, failed, onDevice: failed && fresh === null && snapshot !== null };
}

/** Every note, archived included, with local edits on top. */
export function useNotes(): NotesView {
  return useNotesList(true);
}

export function useNoteStatus(id: string | null): NoteStatus | null {
  return useLocal((s) => (id ? (s.status[id] ?? null) : null));
}

export function useNoteConflict(): ConflictNote | null {
  return useLocal((s) => s.conflict);
}

/** For the sync chip: writes waiting in the outbox and whether the device is online. */
export function useNotesSync(): { pending: number; online: boolean } {
  const pending = useLocal((s) => s.pending);
  const online = useLocal((s) => s.online);
  return { pending, online };
}

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = React.useState(value);
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(value);
    }, ms);
    return () => {
      clearTimeout(t);
    };
  }, [value, ms]);
  return debounced;
}

export type SearchView = { kind: "idle" } | { kind: "loading" } | { kind: "failed" } | { kind: "hits"; hits: NoteHit[] };

/**
 * Note search for the palette (FR-NOTES-7). The owner's goes to Postgres
 * full-text search; demo, and the owner while offline, search the notes on
 * the device. Two letters minimum. Only demo fetches the list for it: the
 * owner's search never needs the whole list from the server.
 */
export function useNoteSearch(query: string, enabled: boolean): SearchView {
  const demo = useAccount().kind !== "owner";
  const online = useLocal((s) => s.online);
  const onDevice = demo || !online;
  const q = useDebounced(query.trim(), 150);
  const active = enabled && q.length >= 2;
  const { notes } = useNotesList(demo);
  const remote = useQuery({
    queryKey: [...SEARCH_KEY, q],
    queryFn: () => fetchJson<{ hits: NoteHit[] }>(`/api/notes/search?q=${encodeURIComponent(q)}`),
    enabled: active && !onDevice,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  if (!active) return { kind: "idle" };
  if (onDevice) return { kind: "hits", hits: searchLocal(notes, q).map(hitOf) };
  if (remote.isError) return { kind: "failed" };
  if (!remote.data) return { kind: "loading" };
  return { kind: "hits", hits: remote.data.hits };
}

export type HistoryView =
  | { kind: "demo" }
  | { kind: "offline" }
  | { kind: "loading" }
  | { kind: "failed" }
  | { kind: "loaded"; revisions: RevisionsPayload["revisions"] };

/** A note's history (FR-NOTES-4), read when the panel is open. Pulled again after a conflict or a restore. */
export function useNoteHistory(id: string, open: boolean): HistoryView {
  const demo = useAccount().kind !== "owner";
  const online = useLocal((s) => s.online);
  const query = useQuery({
    queryKey: [...REVISIONS_KEY, id],
    queryFn: () => fetchJson<RevisionsPayload>(`/api/notes/${id}/revisions`),
    enabled: open && !demo && online,
    staleTime: 5_000,
    placeholderData: keepPreviousData,
  });
  if (demo) return { kind: "demo" };
  if (query.data) return { kind: "loaded", revisions: query.data.revisions };
  if (!online) return { kind: "offline" };
  if (query.isError) return { kind: "failed" };
  return { kind: "loading" };
}
