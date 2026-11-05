"use client";

import * as React from "react";
import { Archive, ArchiveRestore, ChevronLeft, Pin, PinOff, Trash2, X } from "lucide-react";
import { NoteMarkdown } from "@/components/notes/note-markdown";
import { useNoteConflict, useNoteStatus, useNotesApi } from "@/components/notes/notes-provider";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { TAG_MAX, TAGS_MAX, TITLE_MAX, checklistProgress, sameContent, EMPTY_CONTENT, toggleTaskAtLine, type Note } from "@/lib/notes/notes";
import type { NoteStatus } from "@/lib/notes/sync";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<NoteStatus, string> = {
  saving: "Saving",
  saved: "Saved",
  retrying: "Not saved yet, retrying",
  local: "Demo: kept in this tab only",
  error: "Couldn't save",
};

type Mode = "write" | "read";

/** One note, edited in place: title, Markdown body (write or read, checklists tick in read), tags, pin, archive. */
export function NoteEditor({ note, onBack }: { note: Note; onBack?: () => void }) {
  const api = useNotesApi();
  const status = useNoteStatus(note.id);
  const conflict = useNoteConflict();
  const fresh = note.version === 0 && sameContent(note, EMPTY_CONTENT);
  const [mode, setMode] = React.useState<Mode>(() => (fresh || !checklistProgress(note.bodyMd) ? "write" : "read"));
  const bodyRef = React.useRef<HTMLTextAreaElement>(null);
  const progress = checklistProgress(note.bodyMd);

  // A "New note" left empty disappears when you move on.
  React.useEffect(
    () => () => {
      api.discardIfEmpty(note.id);
    },
    [api, note.id],
  );

  React.useEffect(() => {
    if (fresh) bodyRef.current?.focus();
    // Only on opening a fresh note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note.id]);

  const toggleTask = React.useCallback(
    (line: number) => {
      api.update(note.id, { bodyMd: toggleTaskAtLine(note.bodyMd, line) }, { immediate: true });
    },
    [api, note.id, note.bodyMd],
  );

  return (
    <article aria-label="Note" className="bento flex min-h-[min(70svh,640px)] flex-col p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-border/70 px-4 py-3 dark:border-glass-border">
        {onBack ? (
          <button type="button" onClick={onBack} className={buttonClass("ghost", "pill-sm", "-ml-1 pl-2 @4xl:hidden")}>
            <ChevronLeft aria-hidden />
            Notes
          </button>
        ) : null}
        <Segmented
          label="Editor mode"
          value={mode}
          options={[
            { value: "write", label: "Write" },
            { value: "read", label: "Read" },
          ]}
          onChange={setMode}
        />
        <span className="readout mr-auto truncate pl-1" role="status" aria-live="polite">
          {status ? STATUS_LABEL[status] : ""}
        </span>
        <button
          type="button"
          aria-pressed={note.pinned}
          onClick={() => {
            api.update(note.id, { pinned: !note.pinned });
          }}
          className={buttonClass("ghost", "circle-sm", note.pinned ? "text-foreground" : undefined)}
          title={note.pinned ? "Unpin" : "Pin to the top"}
        >
          {note.pinned ? <PinOff aria-hidden strokeWidth={1.75} /> : <Pin aria-hidden strokeWidth={1.75} />}
          <span className="sr-only">{note.pinned ? "Unpin" : "Pin"}</span>
        </button>
        <button
          type="button"
          onClick={() => {
            api.update(note.id, { archived: !note.archived, ...(note.archived ? {} : { pinned: false }) });
          }}
          className={buttonClass("ghost", "circle-sm")}
          title={note.archived ? "Move back to notes" : "Archive"}
        >
          {note.archived ? <ArchiveRestore aria-hidden strokeWidth={1.75} /> : <Archive aria-hidden strokeWidth={1.75} />}
          <span className="sr-only">{note.archived ? "Unarchive" : "Archive"}</span>
        </button>
        {note.archived ? (
          <button
            type="button"
            onClick={() => {
              if (window.confirm("Delete this note for good? It can't be brought back.")) {
                api.remove(note.id);
                onBack?.();
              }
            }}
            className={buttonClass("ghost", "circle-sm", "hover:text-destructive")}
            title="Delete for good"
          >
            <Trash2 aria-hidden strokeWidth={1.75} />
            <span className="sr-only">Delete for good</span>
          </button>
        ) : null}
      </div>

      {conflict?.id === note.id ? (
        <div role="status" className="mx-4 mt-3 flex items-start gap-3 rounded-[16px] bg-signal-soft px-4 py-3 text-[13px] text-foreground">
          <p className="min-w-0 flex-1 text-pretty">
            {conflict.won
              ? "This note was also changed on another device. Your edit is newer, so it stays; the other version is kept in the note's history."
              : "This note was changed on another device after your edit. The newer version is shown; yours is kept in the note's history."}
          </p>
          <button type="button" onClick={api.dismissConflict} className={buttonClass("ghost", "circle-sm", "-my-1.5 size-8")}>
            <X aria-hidden strokeWidth={1.75} />
            <span className="sr-only">Dismiss</span>
          </button>
        </div>
      ) : null}

      <div className="flex flex-1 flex-col gap-3 px-5 pt-4 pb-5 md:px-6">
        <input
          value={note.title}
          maxLength={TITLE_MAX}
          onChange={(e) => {
            api.update(note.id, { title: e.target.value });
          }}
          placeholder="Title"
          aria-label="Title"
          className="w-full bg-transparent font-display text-[22px] leading-tight tracking-[-0.01em] text-foreground outline-none placeholder:text-ink-3"
        />
        {progress ? (
          <p className="readout tabular">
            {progress.done} of {progress.total} done
          </p>
        ) : null}
        {mode === "write" ? (
          <textarea
            ref={bodyRef}
            value={note.bodyMd}
            onChange={(e) => {
              api.update(note.id, { bodyMd: e.target.value });
            }}
            onBlur={api.flushAll}
            placeholder={"Write in Markdown. A checklist is “- [ ] buy SSD”."}
            aria-label="Note body, Markdown"
            className="min-h-64 w-full flex-1 resize-none bg-transparent font-mono text-[13.5px] leading-relaxed text-foreground outline-none field-sizing-content placeholder:text-ink-3"
          />
        ) : note.bodyMd.trim() ? (
          <NoteMarkdown body={note.bodyMd} onToggleTask={toggleTask} className="flex-1" />
        ) : (
          <p className="flex-1 text-[14px] text-ink-3">Nothing written yet.</p>
        )}
        <TagEditor
          tags={note.tags}
          onChange={(tags) => {
            api.update(note.id, { tags });
          }}
        />
      </div>
    </article>
  );
}

function TagEditor({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = React.useState("");
  const full = tags.length >= TAGS_MAX;
  const add = () => {
    const tag = draft.trim().toLowerCase().slice(0, TAG_MAX);
    if (tag && !full) onChange([...tags, tag]);
    setDraft("");
  };
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 pt-3 dark:border-glass-border">
      {tags.map((tag) => (
        <span key={tag} className="inline-flex h-7 items-center gap-1 rounded-pill bg-card-nested pr-1 pl-2.5 text-[12px] text-ink-2 ring-1 ring-border dark:ring-glass-border">
          {tag}
          <button
            type="button"
            onClick={() => {
              onChange(tags.filter((t) => t !== tag));
            }}
            className="grid size-5 place-items-center rounded-full outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-3" />
            <span className="sr-only">Remove tag {tag}</span>
          </button>
        </span>
      ))}
      <input
        value={draft}
        disabled={full}
        maxLength={TAG_MAX}
        onChange={(e) => {
          setDraft(e.target.value);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === ",") {
            e.preventDefault();
            add();
          } else if (e.key === "Backspace" && draft === "" && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={add}
        placeholder={tags.length ? "Add a tag" : "Tags: type one and press Enter"}
        aria-label="Add a tag"
        className={cn("h-7 min-w-32 flex-1 bg-transparent px-1 text-[12.5px] text-foreground outline-none placeholder:text-ink-3")}
      />
    </div>
  );
}
