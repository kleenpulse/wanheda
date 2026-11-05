"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, Maximize2, Pin, Plus, Search } from "lucide-react";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { STATUS_LABEL } from "@/components/notes/note-editor";
import { useNoteStatus, useNotes, useNotesApi } from "@/components/notes/notes-provider";
import { NoteColorMenu, STICKY_FILL, STICKY_MARK, StickyProgress, Swatch } from "@/components/notes/sticky";
import { buttonClass } from "@/components/ui/button";
import { BODY_MAX, TITLE_MAX, checklistProgress, displayTitle, sortNotes, type Note } from "@/lib/notes/notes";
import { cn } from "@/lib/utils";

// The note mini window (FR-NOTES-2, `notes.note`): one note floating over any
// app, picked inside the window. Which note it shows is per device, like the
// window's place.

const useNoteWindow = create<{ noteId: string | null; show: (id: string | null) => void }>()(
  persist(
    (set) => ({
      noteId: null,
      show(noteId) {
        set({ noteId });
      },
    }),
    {
      name: "wanheda-note-window",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ noteId: s.noteId }),
      merge: (persisted, current) => {
        const id = (persisted as { noteId?: unknown } | undefined)?.noteId;
        return { ...current, noteId: typeof id === "string" ? id : null };
      },
      // The server renders no windows; the body loads it after mount.
      skipHydration: true,
    },
  ),
);

export function NoteWindow() {
  const { notes, loading } = useNotes();
  const api = useNotesApi();
  const noteId = useNoteWindow((s) => s.noteId);
  const show = useNoteWindow((s) => s.show);
  const note = noteId ? notes.find((n) => n.id === noteId && !n.archived) : undefined;
  const [ready, setReady] = React.useState(false);
  React.useEffect(() => {
    void Promise.resolve(useNoteWindow.persist.rehydrate()).then(() => {
      setReady(true);
    });
  }, []);

  // A note left blank goes when the window moves on or closes, unless /notes still shows it.
  React.useEffect(() => (noteId ? api.hold(noteId) : undefined), [api, noteId]);

  if (!ready) return null;
  if (note) {
    return (
      <WindowEditor
        note={note}
        onBack={() => {
          show(null);
        }}
      />
    );
  }
  return (
    <NotePicker
      notes={notes}
      loading={loading}
      onPick={show}
      onNew={() => {
        show(api.create());
      }}
    />
  );
}

function NotePicker({
  notes,
  loading,
  onPick,
  onNew,
}: {
  notes: readonly Note[];
  loading: boolean;
  onPick: (id: string) => void;
  onNew: () => void;
}) {
  const [filter, setFilter] = React.useState("");
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = sortNotes(notes.filter((n) => !n.archived)).filter((n) => {
    const hay = `${n.title}\n${n.bodyMd}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });

  return (
    <div className="flex min-h-full flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <label className="relative min-w-0 flex-1">
          <span className="sr-only">Find a note</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
            placeholder="Find a note"
            className="h-9 w-full rounded-pill bg-card-nested pr-3 pl-9 text-[13px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border"
          />
        </label>
        <button type="button" onClick={onNew} className={buttonClass("inverse", "pill-sm")}>
          <Plus aria-hidden />
          New
        </button>
      </div>
      {loading && !notes.length ? (
        <p className="text-[13px] text-ink-2">Loading notes…</p>
      ) : shown.length ? (
        <ul className="flex flex-col gap-1.5">
          {shown.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => {
                  onPick(n.id);
                }}
                className="flex w-full items-center gap-2.5 rounded-[14px] px-2.5 py-2 text-left outline-none hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-accent"
              >
                <Swatch color={n.color} />
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-foreground">{displayTitle(n)}</span>
                {n.pinned ? <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-ink-2" strokeWidth={1.75} /> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[13px] text-ink-2">{filter ? "No note matches." : "No notes yet. Start one with New."}</p>
      )}
    </div>
  );
}

function WindowEditor({ note, onBack }: { note: Note; onBack: () => void }) {
  const api = useNotesApi();
  const status = useNoteStatus(note.id);
  const progress = checklistProgress(note.bodyMd);
  const titleId = React.useId();

  return (
    <div className={cn("flex min-h-full flex-col", STICKY_FILL[note.color])}>
      <span aria-hidden className={cn("h-1 shrink-0", STICKY_MARK[note.color], note.color === "plain" && "opacity-20")} />
      <div className="flex items-center gap-1 px-2 pt-1.5">
        <button type="button" onClick={onBack} className={buttonClass("ghost", "pill-sm", "pl-2")}>
          <ChevronLeft aria-hidden />
          Notes
        </button>
        <span className="readout min-w-0 flex-1 truncate" role="status" aria-live="polite">
          {status ? STATUS_LABEL[status] : ""}
        </span>
        <NoteColorMenu
          color={note.color}
          onPick={(color) => {
            api.update(note.id, { color });
          }}
        />
        <Link href={`/notes?n=${note.id}` as Route} className={buttonClass("ghost", "circle-sm", "size-8")} title="Open in Notes">
          <Maximize2 aria-hidden strokeWidth={1.75} />
          <span className="sr-only">Open in Notes</span>
        </Link>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pt-1 pb-4">
        <label htmlFor={titleId} className="sr-only">
          Title
        </label>
        <input
          id={titleId}
          value={note.title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            api.update(note.id, { title: e.target.value });
          }}
          placeholder="Title"
          className="bg-transparent text-[16px] font-medium text-foreground outline-none placeholder:text-ink-2"
        />
        <textarea
          aria-label="Note"
          value={note.bodyMd}
          maxLength={BODY_MAX}
          onChange={(e) => {
            api.update(note.id, { bodyMd: e.target.value });
          }}
          placeholder="Write in Markdown. - [ ] makes a checklist."
          className="min-h-24 flex-1 resize-none bg-transparent text-[13.5px] leading-relaxed text-foreground outline-none placeholder:text-ink-2"
        />
        {progress ? <StickyProgress done={progress.done} total={progress.total} color={note.color} /> : null}
      </div>
    </div>
  );
}
