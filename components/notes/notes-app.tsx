"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Pin, Plus, Search } from "lucide-react";
import { NoteEditor } from "@/components/notes/note-editor";
import { NotesBoard, type NotesBoardHandle } from "@/components/notes/notes-board";
import { useNotes, useNotesApi } from "@/components/notes/notes-provider";
import { EmptyState } from "@/components/shell/page-frame";
import { Kbd } from "@/components/ui/kbd";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { useNow } from "@/hooks/use-now";
import { checklistProgress, displayTitle, excerpt, type Note } from "@/lib/notes/notes";
import { relativeTime } from "@/lib/notifications/notifications";
import { cn } from "@/lib/utils";

/*
  The Notes app (FR-NOTES-2): the list or the board, with the open note
  beside it on wide sheets; on narrow ones the list or board, and the note
  you drill into. `?n=` holds the open note and `?view=board|archive` the
  view, through the History API, so Back works and nothing waits on the
  server (SPEC B4: route state lives in the URL, not in component state).
*/

type View = "notes" | "board" | "archive";

/** Same as Tailwind's @4xl, where the list and the note sit side by side. */
const WIDE_PX = 896;

function parseView(value: string | null): View {
  return value === "archive" || value === "board" ? value : "notes";
}

function useNotesUrl() {
  const params = useSearchParams();
  const pathname = usePathname();
  const id = params.get("n");
  const view = parseView(params.get("view"));
  const pushed = React.useRef(false);

  const href = (next: { id: string | null; view: View }) => {
    const q = new URLSearchParams();
    if (next.view !== "notes") q.set("view", next.view);
    if (next.id) q.set("n", next.id);
    const s = q.toString();
    return s ? `${pathname}?${s}` : pathname;
  };
  /** Narrow sheets push, so Back returns to the list; wide ones replace. */
  const open = (next: string, drill: boolean, inView: View = view) => {
    if (drill) {
      pushed.current = true;
      window.history.pushState(null, "", href({ id: next, view: inView }));
    } else {
      window.history.replaceState(null, "", href({ id: next, view: inView }));
    }
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", href({ id: null, view }));
    }
  };
  const setView = (v: View) => {
    window.history.replaceState(null, "", href({ id: null, view: v }));
  };
  return { id, view, open, close, setView };
}

function matches(n: Note, filter: string): boolean {
  const words = filter.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = `${n.title}\n${n.bodyMd}\n${n.tags.join(" ")}`.toLowerCase();
  return words.every((w) => hay.includes(w));
}

export function NotesApp() {
  const { notes, source, loading, failed, onDevice } = useNotes();
  const api = useNotesApi();
  const url = useNotesUrl();
  const rootRef = React.useRef<HTMLDivElement>(null);
  // The board view renders the view switch in another branch: one id for both, so the pill slides between them.
  const viewSwitchId = React.useId();
  const [filter, setFilter] = React.useState("");
  const isWide = () => (rootRef.current?.offsetWidth ?? 0) >= WIDE_PX;

  const boardRef = React.useRef<NotesBoardHandle>(null);

  const inView = notes.filter((n) => n.archived === (url.view === "archive"));
  const shown = inView.filter((n) => matches(n, filter));
  const archivedCount = notes.length - notes.filter((n) => !n.archived).length;
  const selected = url.id ? (notes.find((n) => n.id === url.id) ?? null) : null;

  const newNote = () => {
    // On the board, the new sticky lands in the middle of the view.
    const place = url.view === "board" ? boardRef.current?.centerPlace() : undefined;
    const view = url.view === "archive" ? "notes" : url.view;
    url.open(api.create(place ? { board: place } : {}), !isWide(), view);
  };

  const viewBar = (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        label="Which notes"
        layoutId={viewSwitchId}
        className="tabular"
        value={url.view}
        options={[
          { value: "notes", label: `List ${String(notes.length - archivedCount)}` },
          { value: "board", label: "Board" },
          { value: "archive", label: `Archive ${String(archivedCount)}` },
        ]}
        onChange={url.setView}
      />
      <button type="button" onClick={newNote} className={buttonClass("inverse", "pill-sm", "ml-auto")}>
        <Plus aria-hidden />
        New note
      </button>
    </div>
  );

  const failedNotice = failed ? (
    <p role="alert" className="rounded-[16px] bg-card-nested px-4 py-3 text-[13px] text-ink-2">
      {onDevice
        ? "Couldn't reach the server. These are the notes kept on this device; edits sync when it answers."
        : "Couldn't load your notes from the server. What you see was written on this device."}
    </p>
  ) : null;

  const demoNote = source === "demo" ? <p className="readout px-1">Demo: sample notes. Changes stay in this tab.</p> : null;

  if (url.view === "board") {
    return (
      <div ref={rootRef} className="flex flex-col gap-3">
        <div className={cn(selected && "hidden @4xl:block")}>{viewBar}</div>
        {failedNotice}
        <div className={cn("grid gap-4", selected && "@4xl:grid-cols-[minmax(0,1fr)_minmax(360px,500px)] @4xl:items-start")}>
          <section aria-label="Board" className={cn("h-[min(74svh,820px)] min-h-[420px] min-w-0", selected && "hidden @4xl:block")}>
            <NotesBoard
              ref={boardRef}
              notes={notes}
              loading={loading}
              selectedId={url.id}
              onOpen={(id) => {
                url.open(id, !isWide());
              }}
            />
          </section>
          {selected ? (
            <div className="min-w-0 @4xl:sticky @4xl:top-6">
              <NoteEditor key={selected.id} note={selected} onBack={url.close} backLabel="Board" />
            </div>
          ) : null}
        </div>
        {demoNote}
      </div>
    );
  }

  return (
    <div ref={rootRef} className="grid gap-4 @4xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] @4xl:items-start">
      <section aria-label="Notes" className={cn("flex min-w-0 flex-col gap-3", selected && "hidden @4xl:flex")}>
        {viewBar}
        <label className="relative block">
          <span className="sr-only">Filter notes</span>
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink-3" />
          <input
            value={filter}
            onChange={(e) => {
              setFilter(e.target.value);
            }}
            placeholder="Filter"
            className="h-10 w-full rounded-pill bg-card pr-4 pl-10 text-[13.5px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border"
          />
        </label>

        {failedNotice}

        {loading && !notes.length ? (
          <ListSkeleton />
        ) : shown.length ? (
          <ul className="flex flex-col gap-2">
            {shown.map((n) => (
              <li key={n.id}>
                <NoteRow
                  note={n}
                  selected={n.id === url.id}
                  onOpen={() => {
                    url.open(n.id, !isWide());
                  }}
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="bento flex">
            <EmptyState
              title={filter ? "No note matches" : url.view === "archive" ? "The archive is empty" : "No notes yet"}
              body={
                filter ? (
                  "Try fewer words."
                ) : url.view === "archive" ? (
                  "Archived notes wait here until you bring them back or delete them."
                ) : (
                  <>
                    Press New note, or type <span className="font-mono">note buy SSD</span> in the palette (<Kbd>Ctrl</Kbd> <Kbd>K</Kbd>).
                  </>
                )
              }
            />
          </div>
        )}
        {demoNote}
      </section>

      {selected ? (
        <div className="min-w-0 @4xl:sticky @4xl:top-6">
          <NoteEditor key={selected.id} note={selected} onBack={url.close} />
        </div>
      ) : url.id && !loading ? (
        <div className="bento flex">
          <EmptyState title="That note is gone" body="It was deleted, or it lives on another account." />
        </div>
      ) : (
        <div className="bento hidden min-h-[min(70svh,640px)] @4xl:flex">
          <EmptyState title="Pick a note" body="Or start a new one. Everything saves as you type." />
        </div>
      )}
    </div>
  );
}

function NoteRow({ note, selected, onOpen }: { note: Note; selected: boolean; onOpen: () => void }) {
  const now = useNow(60_000);
  const progress = checklistProgress(note.bodyMd);
  const text = excerpt(note);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "bento lift flex w-full flex-col gap-1.5 px-4 py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring",
        selected && "ring-2 ring-signal",
      )}
    >
      <span className="flex items-center gap-2">
        {note.pinned ? <Pin aria-label="Pinned" className="size-3.5 shrink-0 text-ink-2" strokeWidth={1.75} /> : null}
        <span className="min-w-0 flex-1 truncate text-[14.5px] font-medium text-foreground">{displayTitle(note)}</span>
      </span>
      {text ? <span className="line-clamp-2 text-[13px] leading-snug text-ink-2">{text}</span> : null}
      <span className="readout flex flex-wrap items-center gap-x-3 gap-y-1 tabular">
        {progress ? (
          <span>
            {progress.done}/{progress.total} done
          </span>
        ) : null}
        {note.tags.slice(0, 3).map((t) => (
          <span key={t}>#{t}</span>
        ))}
        <span className="ml-auto">{now === null ? "" : relativeTime(note.editedAt, now)}</span>
      </span>
    </button>
  );
}

function ListSkeleton() {
  return (
    <div aria-busy className="flex flex-col gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="bento h-[84px] opacity-60" />
      ))}
    </div>
  );
}
