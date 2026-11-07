"use client";

import * as React from "react";
import {
  BookmarkCheck,
  BookmarkPlus,
  Captions,
  Clapperboard,
  FolderOpen,
  HardDrive,
  Link2,
  Music,
  Plus,
  RectangleHorizontal,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { toast } from "@/components/ui/toaster";
import { pushUrl, replaceUrlParams, useUrlParam } from "@/hooks/use-url-param";
import { formatDuration, mediaHref } from "@/lib/media/media";
import { continueList, watchLaterList } from "@/lib/media/playback";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { MusicView } from "./music-view";
import { SUBTITLE_ACCEPT, usePlayer } from "./player-store";
import { Stage, preloadSurface } from "./stage";
import { useFilePick } from "./use-file-pick";
import { providerName, useMedia, useMediaApi } from "./use-media";

// /media (T61, T62): one player, the library beside it (or below it in
// theatre mode). `?m=` is the item playing, so a reload or a link reopens it.
// Adding a file never uploads it (V54).

function sourceLabel(item: MediaItem): string {
  if (item.source === "local") return "This device";
  if (item.source === "embed") return providerName(item.meta.provider ?? "");
  return "Link";
}

function ItemIcon({ item }: { item: MediaItem }) {
  const Icon = item.source === "local" ? HardDrive : item.source === "embed" ? Link2 : item.kind === "audio" ? Music : Clapperboard;
  return <Icon aria-hidden className="size-4" />;
}

function AddBar({ onAdded }: { onAdded: (item: MediaItem) => void }) {
  const api = useMediaApi();
  const [link, setLink] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const pick = useFilePick(async (file, handle) => {
    setBusy(true);
    try {
      const item = await api.addFile(file, handle);
      if (item) onAdded(item);
    } finally {
      setBusy(false);
    }
  });

  return (
    <div className="flex flex-col gap-2">
      {pick.input}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          void api.addLink(link).then((r) => {
            if ("error" in r) setError(r.error);
            else {
              setLink("");
              onAdded(r);
            }
          });
        }}
      >
        <label className="sr-only" htmlFor="media-link">
          Link to play
        </label>
        <input
          id="media-link"
          value={link}
          onChange={(e) => {
            setLink(e.currentTarget.value);
            setError(null);
          }}
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="Paste a YouTube, Vimeo, SoundCloud, Spotify or video link"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? "media-link-error" : undefined}
          className="h-10 min-w-0 flex-1 rounded-pill bg-foreground/6 px-4 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested"
        />
        <button type="submit" disabled={!link.trim()} className={buttonClass("inverse", "circle-sm")} aria-label="Add link">
          <Plus aria-hidden />
        </button>
      </form>
      {error ? (
        <p id="media-link-error" role="alert" className="flex items-center gap-1.5 px-1 text-[13px] text-signal-ink">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={pick.open}
        onPointerEnter={preloadSurface}
        disabled={busy}
        className={buttonClass("ghost", "pill-sm", "self-start bg-foreground/6 text-foreground dark:bg-card-nested")}
      >
        <FolderOpen aria-hidden />
        {busy ? "Reading…" : "Open a file"}
      </button>
    </div>
  );
}

function Row({ item, active, onRemove, onWatchLater }: { item: MediaItem; active: boolean; onRemove: () => void; onWatchLater: () => void }) {
  const duration = formatDuration(item.durationS);
  const watched = item.progress?.watched ?? false;
  const share = item.progress && item.durationS ? Math.min(1, item.progress.positionS / item.durationS) : 0;
  const queued = item.watchLaterAt !== null;
  return (
    <li className="group relative">
      <button
        type="button"
        aria-current={active ? "true" : undefined}
        onPointerEnter={preloadSurface}
        onClick={() => {
          pushUrl(mediaHref(item.id));
        }}
        className={cn(
          "flex w-full items-center gap-3 rounded-[12px] py-2.5 pr-20 pl-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
          active ? "bg-signal-soft text-foreground dark:bg-signal/15" : "hover:bg-foreground/5 dark:hover:bg-card-nested",
        )}
      >
        <span
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full",
            active ? "bg-signal text-stage" : "bg-foreground/6 text-ink-2 dark:bg-card-nested",
          )}
        >
          <ItemIcon item={item} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">{item.title}</span>
          <span className="truncate text-xs text-ink-2">
            {sourceLabel(item)}
            {watched ? " · Watched" : null}
            {duration ? (
              <>
                {" · "}
                <span className="tabular">{duration}</span>
              </>
            ) : null}
          </span>
          {share > 0 && !watched ? (
            <span aria-hidden className="h-1 w-full overflow-hidden rounded-pill bg-foreground/8">
              <span className="block h-full rounded-pill bg-signal" style={{ width: `${String(Math.round(share * 100))}%` }} />
            </span>
          ) : null}
        </span>
      </button>
      <span className="absolute top-1/2 right-1.5 flex -translate-y-1/2 items-center">
        <button
          type="button"
          onClick={onWatchLater}
          aria-label={queued ? `Remove ${item.title} from Watch later` : `Watch ${item.title} later`}
          aria-pressed={queued}
          className={buttonClass(
            "ghost",
            "circle-sm",
            queued ? "text-signal-ink" : "opacity-0 group-hover:opacity-100 focus-visible:opacity-100",
          )}
        >
          {queued ? <BookmarkCheck aria-hidden className="size-4" /> : <BookmarkPlus aria-hidden className="size-4" />}
        </button>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${item.title}`}
          className={buttonClass("ghost", "circle-sm", "opacity-0 group-hover:opacity-100 focus-visible:opacity-100")}
        >
          <Trash2 aria-hidden className="size-4" />
        </button>
      </span>
    </li>
  );
}

function ListSkeleton() {
  return (
    <ul aria-busy aria-label="Loading library" className="flex flex-col gap-1">
      {Array.from({ length: 4 }, (_, i) => (
        <li key={i} className="flex items-center gap-3 px-3 py-2.5" style={{ opacity: 1 - i * 0.2 }}>
          <span className="size-8 rounded-full bg-foreground/6 dark:bg-card-nested" />
          <span className="h-3.5 w-3/5 rounded-pill bg-foreground/6 dark:bg-card-nested" />
        </li>
      ))}
    </ul>
  );
}

const isSubtitleFile = (f: File) => /\.(srt|vtt)$/i.test(f.name);

const chip = (on: boolean) =>
  buttonClass("ghost", "pill-sm", on ? "bg-signal-soft text-signal-ink dark:bg-signal/15" : "bg-foreground/6 text-foreground dark:bg-card-nested");

/** Watch later, sidecar subtitles and theatre, under the stage. */
function NowPlayingBar({ item }: { item: MediaItem }) {
  const api = useMediaApi();
  const theatre = usePlayer((s) => s.theatre);
  const setTheatre = usePlayer((s) => s.setTheatre);
  const playable = usePlayer((s) => s.el !== null);
  const pickRef = React.useRef<HTMLInputElement>(null);
  const queued = item.watchLaterAt !== null;
  return (
    <div className="flex flex-wrap items-center gap-2 px-1">
      <button
        type="button"
        aria-pressed={queued}
        className={chip(queued)}
        onClick={() => {
          api.setWatchLater(item, !queued);
        }}
      >
        {queued ? <BookmarkCheck aria-hidden /> : <BookmarkPlus aria-hidden />}
        Watch later
      </button>
      {playable ? (
        <>
          <input
            ref={pickRef}
            type="file"
            accept={SUBTITLE_ACCEPT}
            hidden
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              e.currentTarget.value = "";
              if (file) void usePlayer.getState().subtitles(file);
            }}
          />
          <button type="button" className={chip(false)} onClick={() => pickRef.current?.click()}>
            <Captions aria-hidden />
            Add subtitles
          </button>
        </>
      ) : null}
      <button
        type="button"
        aria-pressed={theatre}
        aria-keyshortcuts="t"
        className={chip(theatre)}
        onClick={() => {
          setTheatre(!theatre);
        }}
      >
        <RectangleHorizontal aria-hidden />
        Theatre
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="px-3 font-mono text-[11px] tracking-[0.08em] text-ink-3 uppercase">{title}</h3>
      {children}
    </div>
  );
}

const TABS = [
  { value: "videos", label: "Videos" },
  { value: "music", label: "Music" },
] as const;

/** Videos (the library and player) or Music (this device's folder, T63). `?tab=music` keeps the choice on reload. */
export function MediaApp() {
  const tab = useUrlParam("tab") === "music" ? "music" : "videos";
  return (
    <div className="flex min-w-0 flex-col gap-5">
      <Segmented
        label="Media"
        value={tab}
        options={TABS}
        onChange={(v) => {
          replaceUrlParams({ tab: v === "music" ? "music" : null, b: null, g: null });
        }}
      />
      {tab === "music" ? <MusicView /> : <VideosView />}
    </div>
  );
}

function VideosView() {
  const { data, failed, refetch } = useMedia();
  const api = useMediaApi();
  const selected = useUrlParam("m");
  const items = data?.items ?? null;
  const current = items?.find((i) => i.id === selected) ?? null;
  const [dragging, setDragging] = React.useState(false);
  const theatre = usePlayer((s) => s.theatre);
  const going = items ? continueList(items) : [];
  const later = items ? watchLaterList(items) : [];

  const open = (item: MediaItem) => {
    pushUrl(mediaHref(item.id));
  };

  const row = (item: MediaItem) => (
    <Row
      key={item.id}
      item={item}
      active={item.id === current?.id}
      onWatchLater={() => {
        api.setWatchLater(item, item.watchLaterAt === null);
      }}
      onRemove={() => {
        api.remove(item, () => {
          if (new URLSearchParams(window.location.search).get("m") === item.id) replaceUrlParams({ m: null });
        });
      }}
    />
  );

  return (
    <div
      className={cn("grid gap-6", !theatre && "lg:grid-cols-[minmax(0,1fr)_22rem]")}
      onKeyDown={(e) => {
        // `t` toggles theatre while focus is in the player; Video.js keeps its own keys.
        if (e.key !== "t" || e.ctrlKey || e.metaKey || e.altKey) return;
        const target = e.target as HTMLElement;
        if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
        if (!target.closest("[aria-label=Player]")) return;
        e.preventDefault();
        usePlayer.getState().setTheatre(!usePlayer.getState().theatre);
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "copy";
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragging(false);
      }}
      onDrop={(e) => {
        const file = e.dataTransfer.files[0];
        if (!file) return;
        e.preventDefault();
        setDragging(false);
        // A subtitle file joins the playing video (V57); anything else joins the library.
        if (isSubtitleFile(file)) {
          void usePlayer
            .getState()
            .subtitles(file)
            .then((ok) => {
              if (!ok) toast({ title: "Nothing is playing", body: "Play a video, then drop its subtitles on it." });
            });
          return;
        }
        void api.addFile(file, null).then((item) => {
          if (item) open(item);
        });
      }}
    >
      <section aria-label="Player" className={cn("flex min-w-0 flex-col gap-3 rounded-card transition-shadow", dragging && "ring-2 ring-signal")}>
        {current ? (
          <>
            <Stage item={current} />
            <div className="flex min-w-0 flex-col gap-0.5 px-1">
              <h2 className="truncate font-display text-xl leading-tight tracking-[-0.01em] text-foreground">{current.title}</h2>
              <p className="truncate text-xs text-ink-2">
                {sourceLabel(current)}
                {current.source === "local" ? ` · ${current.uri}` : ""}
              </p>
            </div>
            <NowPlayingBar item={current} />
          </>
        ) : (
          <div className="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-card bg-foreground/5 px-6 text-center dark:bg-card-nested">
            <Clapperboard aria-hidden className="size-6 text-ink-3" />
            <p className="text-sm text-ink-2">
              {items && items.length === 0 ? "Open a video or audio file, drop one here, or paste a link." : "Pick something to play."}
            </p>
          </div>
        )}
      </section>

      <aside aria-label="Library" className="flex min-w-0 flex-col gap-4">
        <AddBar onAdded={open} />
        {failed ? (
          <p className="flex items-center gap-2 px-1 text-[13px] text-ink-2">
            Couldn&apos;t load the library.
            <button type="button" className="font-medium text-signal-ink underline-offset-2 hover:underline" onClick={() => void refetch()}>
              Try again
            </button>
          </p>
        ) : items === null ? (
          <ListSkeleton />
        ) : items.length === 0 ? null : (
          <div className="-mx-1 flex max-h-[min(70vh,44rem)] flex-col gap-4 overflow-y-auto scroll-fade overscroll-contain px-1 py-1">
            {going.length > 0 ? (
              <Section title="Continue">
                <ul className="flex flex-col gap-1">{going.map(row)}</ul>
              </Section>
            ) : null}
            {later.length > 0 ? (
              <Section title="Watch later">
                <ul className="flex flex-col gap-1">{later.map(row)}</ul>
              </Section>
            ) : null}
            <Section title="All">
              <ul className="flex flex-col gap-1">{items.map(row)}</ul>
            </Section>
          </div>
        )}
      </aside>
    </div>
  );
}
