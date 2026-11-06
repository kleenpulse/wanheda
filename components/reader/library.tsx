"use client";

import * as React from "react";
import { CloudOff, FilePlus2, FolderPlus, Pencil, Pin, PinOff, Search, Trash2, Upload } from "lucide-react";
import { Notice } from "@/components/income/parts";
import { EmptyState } from "@/components/shell/page-frame";
import { buttonClass } from "@/components/ui/button";
import { LiquidTank } from "@/components/ui/liquid-tank";
import { MarqueeText } from "@/components/ui/marquee-text";
import { Tip } from "@/components/ui/tooltip";
import { useNow } from "@/hooks/use-now";
import { relativeTime } from "@/lib/notifications/notifications";
import { filterLibrary, sortLibrary, tagsInUse, type Collection, type ReaderDoc, type ReaderPayload } from "@/lib/reader/reader";
import { cn } from "@/lib/utils";
import { Cover, kindLabel } from "./cover";
import { preloadPdfReader } from "./document-view";
import { EditDialog, type Editing } from "./edit-dialog";
import { openDoc, useFilePicker } from "./open-file";
import { setPinned, usePinned } from "./pin";
import { onDevice, useDeviceFiles, useReader, useReaderApi } from "./use-reader";

// The library (FR-READER-1, T46): every document with its cover, tags,
// collections, progress and when it was last opened; filters by text, tag and
// collection; files dropped anywhere on the page join it. An entry whose
// bytes aren't on this device says so and opens to the relink prompt.

const CHIP = "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-pill px-3 text-[12.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring";
const CHIP_IDLE = "bg-foreground/6 text-ink-2 hover:text-foreground dark:bg-card-nested";
const CHIP_ON = "bg-inverse text-inverse-foreground dark:bg-signal-soft dark:text-signal";

export function Library() {
  const { data, failed } = useReader();
  if (!data) {
    if (failed) return <Notice>Couldn&apos;t load your library. It will try again when you&apos;re back online.</Notice>;
    return <LibrarySkeleton />;
  }
  return <LibraryView payload={data} />;
}

function LibrarySkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy aria-label="Loading library">
      <div className="h-10 w-full max-w-md rounded-pill bg-foreground/6 dark:bg-card-nested" />
      <div className="grid grid-cols-2 gap-x-4 gap-y-6 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 @7xl:grid-cols-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="flex flex-col gap-2.5" style={{ opacity: Math.max(0.25, 1 - i * 0.12) }}>
            <div className="aspect-[3/4] rounded-[14px] bg-foreground/6 dark:bg-card-nested" />
            <div className="h-3.5 w-4/5 rounded-pill bg-foreground/6 dark:bg-card-nested" />
            <div className="h-1 w-full rounded-pill bg-foreground/6 dark:bg-card-nested" />
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryView({ payload }: { payload: ReaderPayload }) {
  const api = useReaderApi();
  const device = useDeviceFiles();
  // A PDF here will likely be opened: fetch the PDF reader's code while the owner looks (V24).
  const holdsPdf = payload.documents.some((d) => d.kind === "pdf");
  React.useEffect(() => {
    if (!holdsPdf) return;
    if ("requestIdleCallback" in window) window.requestIdleCallback(preloadPdfReader);
    else setTimeout(preloadPdfReader, 600);
  }, [holdsPdf]);
  const [query, setQuery] = React.useState("");
  const [tag, setTag] = React.useState<string | null>(null);
  const [collection, setCollection] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<Editing | null>(null);
  const picker = useFilePicker((files) => {
    void api.addFiles(files).then((docs) => {
      const [only] = docs;
      if (docs.length === 1 && only) openDoc(only.id);
    });
  });

  const tags = React.useMemo(() => tagsInUse(payload.documents), [payload.documents]);
  const activeTag = tag && tags.includes(tag) ? tag : null;
  const activeCollection = collection && payload.collections.some((c) => c.id === collection) ? collection : null;
  const docs = React.useMemo(
    () => sortLibrary(filterLibrary(payload.documents, { query, tag: activeTag, collection: activeCollection })),
    [payload.documents, query, activeTag, activeCollection],
  );
  // The pinned document leads, wherever the sort put it (one pin at a time).
  const pinned = usePinned();
  const ordered = React.useMemo(() => {
    const at = docs.findIndex((d) => d.id === pinned);
    if (at <= 0) return docs;
    return [docs[at], ...docs.slice(0, at), ...docs.slice(at + 1)].filter((d): d is ReaderDoc => d !== undefined);
  }, [docs, pinned]);
  const names = React.useMemo(() => new Map(payload.collections.map((c) => [c.id, c.name])), [payload.collections]);
  const current = payload.collections.find((c) => c.id === activeCollection) ?? null;

  const newCollection = (e: React.MouseEvent<HTMLElement>) => {
    setEditing({ kind: "collection", collection: null, origin: e.currentTarget.getBoundingClientRect() });
  };

  return (
    <DropZone onFiles={picker.add}>
      {picker.input}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <label className="relative w-full max-w-md">
            <span className="sr-only">Search the library</span>
            <Search aria-hidden className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
              }}
              placeholder="Search titles, authors, tags"
              className="h-10 w-full rounded-pill bg-foreground/6 pr-4 pl-10 dark:bg-card-nested text-[13.5px] text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <button type="button" onClick={picker.open} className={buttonClass("inverse", "pill-sm", "ml-auto")}>
            <FilePlus2 aria-hidden />
            Open file
          </button>
        </div>

        <div role="toolbar" aria-label="Filter" className="-mx-1 flex items-center gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]">
          <button type="button" aria-pressed={activeCollection === null} onClick={() => { setCollection(null); }} className={cn(CHIP, activeCollection === null ? CHIP_ON : CHIP_IDLE)}>
            All
            <span className="tabular opacity-70">{payload.documents.length}</span>
          </button>
          {payload.collections.map((c) => (
            <button
              key={c.id}
              type="button"
              aria-pressed={activeCollection === c.id}
              onClick={() => { setCollection(activeCollection === c.id ? null : c.id); }}
              className={cn(CHIP, activeCollection === c.id ? CHIP_ON : CHIP_IDLE)}
            >
              {c.name}
              <span className="tabular opacity-70">{payload.documents.filter((d) => d.collections.includes(c.id)).length}</span>
            </button>
          ))}
          <Tip
            label="New collection"
            render={
              <button type="button" onClick={newCollection} className={buttonClass("ghost", "circle-sm", "size-8 shrink-0 text-ink-3")}>
                <FolderPlus aria-hidden className="size-4" strokeWidth={1.75} />
                <span className="sr-only">New collection</span>
              </button>
            }
          />
          {tags.length > 0 ? <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border dark:bg-glass-border" /> : null}
          {tags.map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={activeTag === t}
              onClick={() => { setTag(activeTag === t ? null : t); }}
              className={cn(CHIP, activeTag === t ? CHIP_ON : CHIP_IDLE)}
            >
              #{t}
            </button>
          ))}
        </div>

        {current ? <CollectionBar collection={current} onEdit={(origin) => { setEditing({ kind: "collection", collection: current, origin }); }} onDelete={() => { api.removeCollection(current); }} /> : null}
      </div>

      {device && !device.available ? (
        <Notice>This browser won&apos;t keep files on this device (a private window?). Your library still syncs; open files in a normal window to keep them here.</Notice>
      ) : null}

      {payload.documents.length === 0 ? (
        <EmptyState
          title="Your library is empty"
          body={
            <>
              Drop a PDF, Markdown or text file here, or press <span className="font-medium text-foreground">Open file</span>. Files stay on this device; your place in them follows you.
            </>
          }
        />
      ) : docs.length === 0 ? (
        <EmptyState title="Nothing matches" body="Try another word, or clear the filters." />
      ) : (
        <ul className="grid grid-cols-2 gap-x-4 gap-y-7 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 @7xl:grid-cols-6">
          {ordered.map((d, i) => (
            <DocCard
              key={d.id}
              doc={d}
              index={i}
              pinned={d.id === pinned}
              onPin={() => {
                setPinned(d.id === pinned ? null : d.id);
              }}
              here={onDevice(d, device)}
              collections={d.collections.flatMap((id) => names.get(id) ?? [])}
              onEdit={(origin) => { setEditing({ kind: "doc", doc: d, origin }); }}
              onDelete={() => { api.remove(d); }}
            />
          ))}
        </ul>
      )}

      <EditDialog editing={editing} collections={payload.collections} onClose={() => { setEditing(null); }} />
    </DropZone>
  );
}

function CollectionBar({ collection, onEdit, onDelete }: { collection: Collection; onEdit: (origin: DOMRect) => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-2 text-[12.5px] text-ink-2">
      <span className="readout">Collection</span>
      <span className="font-medium text-foreground">{collection.name}</span>
      <button type="button" onClick={(e) => { onEdit(e.currentTarget.getBoundingClientRect()); }} className={buttonClass("ghost", "pill-sm", "h-7 px-2.5 text-[12px]")}>
        Rename
      </button>
      <button type="button" onClick={onDelete} className={buttonClass("ghost", "pill-sm", "h-7 px-2.5 text-[12px] hover:text-destructive")}>
        Delete
      </button>
    </div>
  );
}

function DocCard({
  doc,
  index,
  here,
  pinned,
  collections,
  onPin,
  onEdit,
  onDelete,
}: {
  doc: ReaderDoc;
  index: number;
  here: boolean | null;
  pinned: boolean;
  collections: string[];
  onPin: () => void;
  onEdit: (origin: DOMRect) => void;
  onDelete: () => void;
}) {
  const now = useNow(60_000);
  const percent = doc.progress?.percent ?? null;
  const opened = doc.lastOpenedAt === null ? "Not opened yet" : now === null ? "" : `Opened ${relativeTime(doc.lastOpenedAt, now)}`;
  const badge =
    here === false ? (
      <span className="inline-flex h-6 min-w-0 items-center gap-1 rounded-pill bg-background/85 px-2 font-mono text-[10px] tracking-wide text-ink-2 uppercase backdrop-blur-sm">
        <CloudOff aria-hidden className="size-3 shrink-0" />
        <span className="hidden truncate @[15rem]/card:inline">Not on this device</span>
      </span>
    ) : null;
  return (
    <li className="entrance group @container/card relative flex min-w-0 flex-col gap-2.5" style={{ ["--i" as string]: Math.min(index, 12) }}>
      <div className="relative transition-transform duration-200 [@media(hover:hover)_and_(pointer:fine)]:group-hover:-translate-y-0.5">
        {pinned ? <PinnedCover doc={doc} percent={percent ?? 0} badge={badge} /> : <Cover doc={doc} badge={badge} />}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <button
          type="button"
          onClick={() => { openDoc(doc.id); }}
          className="text-left text-[13.5px] leading-snug font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:ring-2 focus-visible:after:ring-ring"
        >
          <MarqueeText text={doc.title} />
          {here === false ? <span className="sr-only"> (not on this device)</span> : null}
        </button>
        {doc.author || collections.length > 0 ? (
          <p className="truncate text-[12px] text-ink-2">{[doc.author, ...collections].filter(Boolean).join(" · ")}</p>
        ) : null}
        {/* Pinned: the tank is the progress. */}
        <div className={cn("mt-1 flex items-center gap-2", pinned && "hidden")}>
          <div
            role="progressbar"
            aria-label="Read"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? 0}
            className="h-1 flex-1 overflow-hidden rounded-pill bg-foreground/8 dark:bg-card-nested"
          >
            <div className="h-full rounded-pill bg-signal" style={{ width: `${String(percent ?? 0)}%` }} />
          </div>
          <span className="tabular w-9 text-right font-mono text-[10.5px] text-ink-2">{percent === null ? "—" : `${String(percent)}%`}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="tabular truncate text-[11.5px] text-ink-3">
            {opened}
            {doc.tags.length > 0 ? ` · ${doc.tags.map((t) => `#${t}`).join(" ")}` : ""}
          </span>
          <span className="relative z-10 -mr-1.5 flex shrink-0 items-center text-ink-3">
            <Tip
              label={pinned ? "Unpin" : "Pin"}
              render={
                <button
                  type="button"
                  onClick={onPin}
                  aria-pressed={pinned}
                  className={buttonClass("ghost", "circle-sm", cn("size-7", pinned ? "text-signal-ink" : "text-ink-3"))}
                >
                  {pinned ? <PinOff aria-hidden className="size-[14px]" strokeWidth={1.75} /> : <Pin aria-hidden className="size-[14px]" strokeWidth={1.75} />}
                  <span className="sr-only">
                    {pinned ? "Unpin" : "Pin"} {doc.title}
                  </span>
                </button>
              }
            />
            <Tip
              label="Edit"
              render={
                <button type="button" onClick={(e) => { onEdit(e.currentTarget.getBoundingClientRect()); }} className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3")}>
                  <Pencil aria-hidden className="size-[14px]" strokeWidth={1.75} />
                  <span className="sr-only">Edit {doc.title}</span>
                </button>
              }
            />
            <Tip
              label="Delete"
              render={
                <button type="button" onClick={onDelete} className={buttonClass("ghost", "circle-sm", "size-7 text-ink-3 hover:text-destructive")}>
                  <Trash2 aria-hidden className="size-[14px]" strokeWidth={1.75} />
                  <span className="sr-only">Delete {doc.title}</span>
                </button>
              }
            />
          </span>
        </div>
      </div>
    </li>
  );
}

/**
 * The pinned document's cover (user 2026-11-06): the liquid tank from the
 * billing-cycle card, filled to how far it's read, the words split ink on
 * liquid along the surface.
 */
function PinnedCover({ doc, percent, badge }: { doc: ReaderDoc; percent: number; badge: React.ReactNode }) {
  const face = (wet: boolean) => (
    <div aria-hidden={wet || undefined} className="flex aspect-[3/4] flex-col justify-between p-3.5">
      <span className="flex items-center gap-1.5 font-mono text-[10px] tracking-[0.16em] uppercase">
        <Pin aria-hidden className="size-3" />
        {kindLabel(doc.kind)}
      </span>
      <span className="tabular font-figure text-[52px] leading-none font-extrabold tracking-[-0.04em] @[15rem]/card:text-[68px]">
        {percent}
        <span className="text-[0.5em]">%</span>
      </span>
      <span className="line-clamp-3 font-display text-[15px] leading-[1.15] font-semibold tracking-[-0.01em] text-balance">{doc.title}</span>
    </div>
  );
  return (
    <LiquidTank
      progress={percent / 100}
      aria-label={`${doc.title}, pinned`}
      className="rounded-[14px]"
      overlay={badge ? <span className="absolute top-3 right-3 z-10 flex min-w-0 justify-end">{badge}</span> : null}
    >
      {(wet) =>
        wet ? (
          face(true)
        ) : (
          <>
            <div role="progressbar" aria-label="Read" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} className="sr-only" />
            {face(false)}
          </>
        )
      }
    </LiquidTank>
  );
}

/** Files dropped anywhere on the library join it. The page shows where they'll land while a drag is over it. */
function DropZone({ onFiles, children }: { onFiles: (files: File[]) => void; children: React.ReactNode }) {
  const [over, setOver] = React.useState(false);
  const depth = React.useRef(0);
  React.useEffect(() => {
    const hasFiles = (e: DragEvent) => e.dataTransfer?.types.includes("Files") ?? false;
    const enter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current++;
      setOver(true);
    };
    const leave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setOver(false);
    };
    const overFn = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    };
    const drop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setOver(false);
      const files = [...(e.dataTransfer?.files ?? [])];
      if (files.length > 0) onFiles(files);
    };
    window.addEventListener("dragenter", enter);
    window.addEventListener("dragleave", leave);
    window.addEventListener("dragover", overFn);
    window.addEventListener("drop", drop);
    return () => {
      window.removeEventListener("dragenter", enter);
      window.removeEventListener("dragleave", leave);
      window.removeEventListener("dragover", overFn);
      window.removeEventListener("drop", drop);
    };
  }, [onFiles]);
  return (
    <>
      {children}
      <div
        aria-hidden={!over}
        className={cn(
          "pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-background/60 backdrop-blur-sm transition-opacity duration-150",
          over ? "opacity-100" : "opacity-0",
        )}
      >
        <div className="flex flex-col items-center gap-3 rounded-[28px] bg-signal-soft px-10 py-8 text-signal-ink">
          <Upload aria-hidden className="size-6" />
          <p className="font-display text-lg font-semibold">Drop to add to your library</p>
          <p className="text-[12.5px] text-ink-2">PDF, Markdown or text. Kept on this device.</p>
        </div>
      </div>
    </>
  );
}
