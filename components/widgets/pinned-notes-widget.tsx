"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Pin, Plus } from "lucide-react";
import { useNotes, useNotesApi } from "@/components/notes/notes-provider";
import { STICKY_FILL, STICKY_MARK, StickyProgress } from "@/components/notes/sticky";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { checklistProgress, displayTitle, excerpt, sortNotes } from "@/lib/notes/notes";
import { cn } from "@/lib/utils";
import { WidgetCard } from "./widget-card";

/** The scratchpad the widget used to be kept its text here, on this device only. */
const LEGACY_KEY = "wanheda-quick-note";

const legacyListeners = new Set<() => void>();

function subscribeLegacy(listener: () => void) {
  legacyListeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    legacyListeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readLegacy(): string | null {
  try {
    return localStorage.getItem(LEGACY_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** The old scratchpad's text, for the owner, until it becomes a real note or is discarded. */
function useLegacyNote(enabled: boolean) {
  const text = React.useSyncExternalStore(subscribeLegacy, readLegacy, () => null);
  const settle = () => {
    try {
      localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* blocked storage: it is offered again next time */
    }
    for (const listener of legacyListeners) listener();
  };
  return { text: enabled ? text : null, settle };
}

/**
 * Pinned notes on Home (FR-NOTES-2): each one in its colour, with checklist
 * progress, opening in Notes. The widget's id (`home.note`) is from the
 * scratchpad it replaces, whose text is offered once as a new note.
 */
export function PinnedNotesWidget() {
  const { notes, loading } = useNotes();
  const api = useNotesApi();
  const router = useRouter();
  const owner = useAccount().kind === "owner";
  const legacy = useLegacyNote(owner);
  const pinned = sortNotes(notes.filter((n) => n.pinned && !n.archived));

  const newNote = () => {
    router.push(`/notes?n=${api.create({ pinned: true })}` as Route);
  };

  return (
    <WidgetCard
      title="Pinned notes"
      icon={Pin}
      note={
        <button type="button" onClick={newNote} className="readout inline-flex items-center gap-1 hover:text-foreground">
          <Plus aria-hidden className="size-3" />
          New
        </button>
      }
    >
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto overscroll-contain">
        {legacy.text ? (
          <div role="group" aria-label="Quick note from this device" className="flex flex-wrap items-center gap-2 rounded-[14px] bg-card-nested px-3 py-2 ring-1 ring-border dark:ring-glass-border">
            <p className="min-w-0 flex-1 text-[13px] text-ink-2">
              <span className="text-foreground">Your quick note</span> from this device:{" "}
              <span className="italic">{legacy.text.length > 80 ? `${legacy.text.slice(0, 79)}…` : legacy.text}</span>
            </p>
            <span className="flex gap-1.5">
              <button
                type="button"
                onClick={() => {
                  if (legacy.text) api.capture(legacy.text);
                  legacy.settle();
                }}
                className={buttonClass("inverse", "pill-sm")}
              >
                Save as a note
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Discard the quick note on this device? It isn't saved anywhere else.")) legacy.settle();
                }}
                className={buttonClass("ghost", "pill-sm")}
              >
                Discard
              </button>
            </span>
          </div>
        ) : null}

        {loading && !notes.length ? (
          <p className="text-[13px] text-ink-2">Loading notes…</p>
        ) : pinned.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
            {pinned.map((n) => {
              const progress = checklistProgress(n.bodyMd);
              const text = excerpt(n, 90);
              return (
                <li key={n.id}>
                  <Link
                    href={`/notes?n=${n.id}` as Route}
                    className={cn(
                      "lift flex h-full flex-col gap-1 overflow-hidden rounded-[14px] pb-2 text-foreground ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border",
                      STICKY_FILL[n.color],
                    )}
                  >
                    <span aria-hidden className={cn("h-1 shrink-0", STICKY_MARK[n.color], n.color === "plain" && "opacity-20")} />
                    <span className="truncate px-3 pt-0.5 text-[13.5px] font-medium">{displayTitle(n)}</span>
                    {text ? <span className="line-clamp-2 px-3 text-[12.5px] leading-snug text-ink-2">{text}</span> : null}
                    {progress ? (
                      <span className="mt-auto px-3 pt-1">
                        <StickyProgress done={progress.done} total={progress.total} color={n.color} />
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="text-[13px] text-ink-2">
            Nothing pinned yet. Pin a note in{" "}
            <Link href="/notes" className="text-foreground underline underline-offset-2">
              Notes
            </Link>{" "}
            to keep it here.
          </p>
        )}
      </div>
    </WidgetCard>
  );
}
