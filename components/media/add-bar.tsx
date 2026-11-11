"use client";

import * as React from "react";
import { FileVideo, FolderOpen, Link2, Plus, Search, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { desktopFiles } from "@/lib/platform/desktop";
import { toast } from "@/components/ui/toaster";
import { readEntry } from "@/lib/media/entry";
import { fsaFolderPicker, videosInFiles, videosInFolder, type FolderVideo, videosInNative } from "@/lib/media/local";
import type { MediaItem } from "@/lib/media/types";
import { cn } from "@/lib/utils";
import { preloadSurface } from "./stage";
import { useFilePick } from "./use-file-pick";
import { providerName, useMedia, useMediaApi } from "./use-media";

// Adding to the video library (T61, T70): paste a link, open a file, or open a
// folder. Nothing is uploaded (V54). On the Videos tab, beside the player, and
// in Home's first-run card. A file or a link opens once added; a folder only
// joins the library (user 2026-11-11: an import must not start playing).
//
// The field reads what is typed (lib/media/entry.ts): a link is added, and
// anything else is not mistaken for one. On the Videos tab the same field is
// the library's search too (`field`, user 2026-11-11: one box, not two): words
// and file names filter the grid as they are typed, and only a link adds.

const plural = (n: number, one: string) => `${n.toLocaleString("en-GB")} ${n === 1 ? one : `${one}s`}`;

export function AddBar({
  onAdded,
  field,
}: {
  /** One file or link was added (never a folder's videos). */
  onAdded: (item: MediaItem) => void;
  /** The Videos tab: the field's text lives with the grid, which searches with it. */
  field?: { text: string; onText: (text: string) => void };
}) {
  const api = useMediaApi();
  const items = useMedia().data?.items ?? null;
  const [own, setOwn] = React.useState("");
  const smart = field !== undefined;
  const text = field ? field.text : own;
  const setText = field ? field.onText : setOwn;
  const entry = React.useMemo(() => readEntry(text), [text]);
  const isLink = entry.kind === "link" || entry.kind === "bad-link";
  /** What the field made of the text, said under it. */
  const hint =
    entry.kind === "link"
      ? items?.some((i) => i.fp === entry.link.fp)
        ? "Already in your library. Press Enter to open it."
        : `${entry.link.kind === "embed" ? providerName(entry.link.provider) : entry.link.mediaKind === "audio" ? "Audio" : "Video"} link. Press Enter to add it.`
      : entry.kind === "bad-link"
        ? entry.reason
        : smart && entry.kind === "search" && entry.from === "file"
          ? "Looking for this file in your library. To add it, use Open a file."
          : null;
  const Icon = isLink ? Link2 : entry.kind === "search" && entry.from === "file" ? FileVideo : Search;
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  /** A folder being added: how far along (`of` null while it's still being read). */
  const [adding, setAdding] = React.useState<{ done: number; of: number | null } | null>(null);
  const folderRef = React.useRef<HTMLInputElement>(null);
  const pick = useFilePick(async (file, handle) => {
    setBusy(true);
    try {
      const item = await api.addFile(file, handle);
      if (item) onAdded(item);
    } finally {
      setBusy(false);
    }
  });

  const addVideos = async (name: string, load: () => Promise<FolderVideo[]>) => {
    // Busy from the start: a big tree takes a while to read, and a second pick mustn't start meanwhile.
    setAdding({ done: 0, of: null });
    try {
      const videos = await load();
      if (videos.length === 0) {
        toast({ title: `No videos in ${name}`, body: "Music goes in the Music tab, from its own folder." });
        return;
      }
      setAdding({ done: 0, of: videos.length });
      const { added, known, copies, failed } = await api.addFolder(videos, (done) => {
        setAdding({ done, of: videos.length });
      }, name);
      const notes = [
        known > 0 ? `${plural(known, "video")} ${known === 1 ? "was" : "were"} already in your list.` : null,
        copies > 0 ? `${plural(copies, "file")} ${copies === 1 ? "is a copy" : "are copies"} of another, so ${copies === 1 ? "it's" : "they're"} listed once.` : null,
        failed > 0 ? `${plural(failed, "file")} couldn't be read or saved. Try ${failed === 1 ? "it" : "them"} again with Open a file.` : null,
      ].filter((n) => n !== null);
      toast({
        title:
          added > 0
            ? `Added ${plural(added, "video")} from ${name}`
            : known > 0
              ? `Nothing new in ${name}`
              : `Couldn't add the videos in ${name}`,
        body: notes.length > 0 ? notes.join(" ") : "They play from this folder on this device; nothing is uploaded.",
      });
    } catch {
      toast({ title: `Couldn't read ${name}`, body: "The browser wouldn't open it. Anything added before it stopped stays in your list." });
    } finally {
      setAdding(null);
    }
  };

  const openFolder = () => {
    // The desktop app picks and keeps the folder itself (V72): no permission to lose, nothing read whole.
    const files = desktopFiles();
    if (files) {
      void files.pick("video").then(
        (root) => (root ? addVideos(root.name, () => videosInNative(root)) : undefined),
        () => undefined,
      );
      return;
    }
    const picker = fsaFolderPicker();
    if (!picker) {
      folderRef.current?.click();
      return;
    }
    void picker({ mode: "read", id: "wanheda-videos" }).then(
      (dir) => addVideos(dir.name, () => videosInFolder(dir)),
      () => undefined, // closed the picker
    );
  };

  return (
    <div className="flex flex-col gap-2">
      {pick.input}
      <input
        ref={folderRef}
        type="file"
        name="video-folder"
        hidden
        multiple
        {...({ webkitdirectory: "" } as Record<string, string>)}
        onChange={(e) => {
          const files = Array.from(e.currentTarget.files ?? []);
          e.currentTarget.value = "";
          if (files.length === 0) return;
          void addVideos(files[0]?.webkitRelativePath.split("/")[0] ?? "the folder", () => Promise.resolve(videosInFiles(files)));
        }}
      />
      {/* One row (user 2026-11-11): the link and its +, then Open a file and Open a folder. Narrow (beside the player), the two wrap under the field. */}
      <div className="flex flex-wrap items-center gap-2">
        <form
          className="flex min-w-[min(100%,22rem)] flex-1 items-center gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            if (entry.kind === "bad-link") setError(entry.reason);
            // Words in the search field are a search, not a mistake; in a link-only field they are.
            else if (entry.kind === "search" && !smart) setError("That isn't a link. Paste a YouTube, Vimeo, SoundCloud, Spotify or video link.");
            if (entry.kind !== "link") return;
            void api.addLink(entry.text).then((r) => {
              if ("error" in r) setError(r.error);
              else {
                setText("");
                onAdded(r);
              }
            });
          }}
        >
          <label className="sr-only" htmlFor="media-link">
            {smart ? "Search your videos, or paste a link to add" : "Link to play"}
          </label>
          <span className="relative flex min-w-0 flex-1 items-center">
            {smart ? <Icon aria-hidden className={cn("pointer-events-none absolute left-3.5 size-4", isLink ? "text-signal-ink dark:text-signal" : "text-ink-3")} /> : null}
            <input
              id="media-link"
              type={smart ? "search" : "text"}
              value={text}
              onChange={(e) => {
                setText(e.currentTarget.value);
                setError(null);
              }}
              {...(smart ? {} : { inputMode: "url" as const })}
              autoComplete="off"
              spellCheck={false}
              placeholder={smart && items && items.length > 0 ? "Search your videos, or paste a link to add" : "Paste a YouTube, Vimeo, SoundCloud, Spotify or video link"}
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "media-link-error" : hint ? "media-link-hint" : undefined}
              className={cn(
                "h-10 w-full min-w-0 rounded-pill bg-foreground/6 pr-4 text-sm text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested",
                smart ? "pl-10" : "pl-4",
              )}
            />
          </span>
          <button type="submit" disabled={smart ? entry.kind !== "link" : entry.kind === "empty"} className={buttonClass("inverse", "circle-sm")} aria-label="Add link">
            <Plus aria-hidden />
          </button>
        </form>
        <button
          type="button"
          onClick={pick.open}
          onPointerEnter={preloadSurface}
          disabled={busy || adding !== null}
          className={buttonClass("ghost", "pill-sm", "shrink-0 bg-foreground/6 text-foreground dark:bg-card-nested")}
        >
          <FileVideo aria-hidden />
          {busy ? "Reading…" : "Open a file"}
        </button>
        <button
          type="button"
          onClick={openFolder}
          onPointerEnter={preloadSurface}
          disabled={busy || adding !== null}
          aria-live="polite"
          className={buttonClass("ghost", "pill-sm", "shrink-0 bg-foreground/6 text-foreground dark:bg-card-nested")}
        >
          <FolderOpen aria-hidden />
          {adding?.of === null ? (
            "Reading folder…"
          ) : adding ? (
            <span className="tabular">
              Adding {adding.done} of {adding.of}…
            </span>
          ) : (
            "Open a folder"
          )}
        </button>
      </div>
      {error ? (
        <p id="media-link-error" role="alert" className="flex items-center gap-1.5 px-1 text-[13px] text-signal-ink">
          <TriangleAlert aria-hidden className="size-3.5 shrink-0" />
          {error}
        </p>
      ) : hint ? (
        <p id="media-link-hint" aria-live="polite" className="px-1 text-[13px] text-ink-2">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
