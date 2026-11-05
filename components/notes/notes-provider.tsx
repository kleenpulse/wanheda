"use client";

import * as React from "react";
import { keepPreviousData, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { create } from "zustand";
import { deleteNote, saveNote } from "@/actions/notes";
import { useAccount } from "@/components/shell/account";
import {
  EMPTY_CONTENT,
  NOTES_KEY,
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
} from "@/lib/notes/notes";
import { NoteSender, landed, mergeNotes, removeNote, upsertNote, type NoteStatus, type Overlay } from "@/lib/notes/sync";

/*
  Notes on the client (ADR-0008). The list is a TanStack query, prefetched by
  the notes page and hydrated. Edits go into a local overlay at once (the
  optimistic update), then to the server through one NoteSender after a short
  pause in typing. The overlay entry stays until the server has confirmed the
  write, so a refetch can never roll an edit back. Lives in the shell, so the
  palette can capture and search from any page.
*/


const SEARCH_KEY = ["notes", "search"] as const;
const TYPING_PAUSE_MS = 700;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { accept: "application/json" } });
  if (!res.ok || !res.headers.get("content-type")?.includes("application/json")) {
    throw new Error(`${url} answered ${String(res.status)}`);
  }
  return (await res.json()) as T;
}

/** A conflict the owner should hear about: `won` false means their edit went to history. */
export interface ConflictNote {
  id: string;
  won: boolean;
}

interface LocalState {
  overlay: Overlay;
  status: Readonly<Record<string, NoteStatus>>;
  conflict: ConflictNote | null;
}

const useLocal = create<LocalState>(() => ({ overlay: {}, status: {}, conflict: null }));

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
  update: (id: string, patch: Partial<NoteContent>, opts?: { immediate?: boolean }) => void;
  /** A new note, saved once it has content. Returns its id. */
  create: (content?: Partial<NoteContent>) => string;
  /** Quick capture: a note with this body, saved at once (FR-NOTES-3). */
  capture: (text: string) => string;
  /** Deletes an archived note for good. */
  remove: (id: string) => void;
  /** Drops a note that never got any content (a "New note" left empty). */
  discardIfEmpty: (id: string) => void;
  /** Sends every edit still waiting for a pause in typing. */
  flushAll: () => void;
  dismissConflict: () => void;
}

function cachedNote(qc: QueryClient, id: string): Note | undefined {
  return qc.getQueryData<NotesPayload>(NOTES_KEY)?.notes.find((n) => n.id === id);
}

function createNotesApi(qc: QueryClient): NotesApi {
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  // Server truth goes into the cache before the overlay entry is dropped. Any
  // fetch already in flight is cancelled first: it was asked before this write
  // landed, and would put the old version back.
  const confirm = (apply: (notes: Note[]) => Note[], then: () => void) => {
    void qc.cancelQueries({ queryKey: NOTES_KEY }).then(() => {
      qc.setQueryData<NotesPayload>(NOTES_KEY, (old) => (old ? { ...old, notes: apply(old.notes) } : old));
      then();
    });
  };

  const sender = new NoteSender({
    send: (write) => saveNote(write),
    onStatus: setStatus,
    onResult: (write, result) => {
      if (!result.ok) return; // demo stays local; failed retries; invalid shows as an error
      const server = result.note;
      const newerHere = () => {
        const local = useLocal.getState().overlay[write.id];
        return local != null && (local.editedAt > write.editedAt || timers.has(write.id));
      };
      if (result.kind === "conflict") useLocal.setState({ conflict: { id: write.id, won: result.won } });
      confirm(
        (notes) => upsertNote(notes, server),
        () => {
          const local = useLocal.getState().overlay[write.id];
          if (!newerHere()) dropOverlay(write.id);
          // Still typing on top of a write that landed: build on its version.
          else if (local && landed(result)) setOverlay(write.id, { ...local, version: server.version });
        },
      );
    },
  });

  const send = (id: string) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    timers.delete(id);
    const local = useLocal.getState().overlay[id];
    if (local) sender.enqueue(writeOf(local));
  };

  const schedule = (id: string, immediate: boolean) => {
    const timer = timers.get(id);
    if (timer !== undefined) clearTimeout(timer);
    if (immediate) {
      timers.delete(id);
      send(id);
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
    if (!sameContent(note, EMPTY_CONTENT)) schedule(id, true);
    return id;
  };

  return {
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
      schedule(id, opts.immediate ?? !textOnly);
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
      // Never reached the server: nothing to delete there.
      if (note.version === 0 && !sender.busy(id)) return;
      void deleteNote({ id })
        .catch(() => ({ ok: false as const, reason: "failed" as const }))
        .then((r) => {
          if (r.ok) confirm((notes) => removeNote(notes, id), () => {
            dropOverlay(id);
          });
          else if (r.reason !== "demo") {
            dropOverlay(id);
            setStatus(id, "error");
          }
        });
    },
    discardIfEmpty(id) {
      const local = useLocal.getState().overlay[id];
      if (local && local.version === 0 && sameContent(local, EMPTY_CONTENT) && !sender.busy(id)) dropOverlay(id);
    },
    flushAll() {
      for (const id of [...timers.keys()]) send(id);
    },
    dismissConflict() {
      useLocal.setState({ conflict: null });
    },
  };
}

const Ctx = React.createContext<NotesApi | null>(null);

export function NotesProvider({ children }: { children: React.ReactNode }) {
  const qc = useQueryClient();
  const api = React.useMemo(() => createNotesApi(qc), [qc]);

  // Leaving the page or the tab: send what's waiting for a pause in typing.
  React.useEffect(() => {
    const flush = () => {
      if (document.visibilityState === "hidden") api.flushAll();
    };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", api.flushAll);
    return () => {
      document.removeEventListener("visibilitychange", flush);
      window.removeEventListener("pagehide", api.flushAll);
      api.flushAll();
    };
  }, [api]);

  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
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
}

/** Every note, archived included, with local edits on top. */
export function useNotes(): NotesView {
  const demo = useAccount().kind !== "owner";
  const query = useQuery({
    queryKey: NOTES_KEY,
    queryFn: () => fetchJson<NotesPayload>("/api/notes"),
    // Demo has nothing to refetch: its edits live only in this tab.
    staleTime: demo ? Infinity : 30_000,
    refetchOnWindowFocus: !demo,
  });
  const overlay = useLocal((s) => s.overlay);
  const notes = React.useMemo(() => mergeNotes(query.data?.notes ?? [], overlay), [query.data, overlay]);
  const source = query.data?.source ?? (demo ? "demo" : "owner");
  return { notes, source, loading: query.isPending, failed: query.isError || source === "load-failed" };
}

export function useNoteStatus(id: string | null): NoteStatus | null {
  return useLocal((s) => (id ? (s.status[id] ?? null) : null));
}

export function useNoteConflict(): ConflictNote | null {
  return useLocal((s) => s.conflict);
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
 * full-text search; demo searches its notes in memory. Two letters minimum.
 */
export function useNoteSearch(query: string, enabled: boolean): SearchView {
  const demo = useAccount().kind !== "owner";
  const q = useDebounced(query.trim(), 150);
  const active = enabled && q.length >= 2;
  const { notes } = useNotes();
  const remote = useQuery({
    queryKey: [...SEARCH_KEY, q],
    queryFn: () => fetchJson<{ hits: NoteHit[] }>(`/api/notes/search?q=${encodeURIComponent(q)}`),
    enabled: active && !demo,
    staleTime: 10_000,
    placeholderData: keepPreviousData,
  });
  if (!active) return { kind: "idle" };
  if (demo) return { kind: "hits", hits: searchLocal(notes, q).map(hitOf) };
  if (remote.isError) return { kind: "failed" };
  if (!remote.data) return { kind: "loading" };
  return { kind: "hits", hits: remote.data.hits };
}
