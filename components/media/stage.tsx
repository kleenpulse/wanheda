"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { CloudOff, FolderOpen, KeyRound, TriangleAlert } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { toast } from "@/components/ui/toaster";
import { cannotMessage, planPlayback, type PlaybackPlan, type Probe } from "@/lib/media/ladder";
import { locate, regrant, rememberFile, type Located } from "@/lib/media/local";
import type { MediaItem } from "@/lib/media/types";
import { parseMediaUrl } from "@/lib/media/url";
import { MediaEngine, browserCapsDeps, capsFrom } from "@/lib/platform/media";
import { cn } from "@/lib/utils";
import { slowRemuxNotice } from "./remux-status";
import { providerName, useMediaApi } from "./use-media";
import { useFilePick } from "./use-file-pick";
import { usePlayer } from "./player-store";
import { retryThumb } from "./thumb-queue";
import { usePlayerWiring } from "./use-player";

// The player area (T61). Embeds get an allowlisted iframe rebuilt from the
// item's URI (V56); links play in the browser; local files go up the ladder
// (V52): native, else a streamed remux in the media worker (V53), else a
// sentence that names the codec and the track.

/** In the player's full-screen frame (`group/cinema` with data-fullscreen) the stage fills it, square and black. */
const STAGE =
  "relative aspect-video w-full overflow-hidden rounded-card bg-stage group-data-[fullscreen]/cinema:aspect-auto group-data-[fullscreen]/cinema:h-full group-data-[fullscreen]/cinema:rounded-none group-data-[fullscreen]/cinema:bg-island";

function StageShell() {
  return <div aria-busy aria-label="Opening" className={STAGE} />;
}

const MediaSurface = dynamic(() => import("./media-surface"), { ssr: false, loading: StageShell });

export function preloadSurface(): void {
  void import("./media-surface").catch(() => undefined);
}

/** The ladder's step, for the overlay and for the exit log (T65: "transcode never called"). */
type Phase =
  | { kind: "opening" }
  | { kind: "playing"; mode: "native" | "remux" | "link" }
  | { kind: "cannot"; message: string };

function Notice({ icon: Icon, title, children }: { icon: React.ComponentType<{ className?: string }>; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-card bg-foreground/5 px-6 py-12 text-center dark:bg-card-nested">
      <span className="flex size-11 items-center justify-center rounded-full bg-signal-soft text-signal-ink">
        <Icon aria-hidden className="size-5" />
      </span>
      <p className="max-w-sm font-display text-xl leading-tight tracking-[-0.01em] text-pretty text-foreground">{title}</p>
      {children}
    </div>
  );
}

function log(item: MediaItem, plan: PlaybackPlan | { mode: string }, probe: Probe | null): void {
  // The exit run reads this (T65): which rung played, and never a transcode.
  if (typeof localStorage !== "undefined" && localStorage.getItem("wanheda:media-log") === "1") {
    console.info("[media]", item.title, plan.mode, probe ? { format: probe.format, tracks: probe.tracks } : null);
  }
}

/** Points the element at a source: a URL (native) or the remux's MSE handle; null detaches it. */
function setSource(el: HTMLVideoElement, source: string | MediaProvider | null): void {
  el.pause();
  el.removeAttribute("src");
  el.srcObject = null;
  if (typeof source === "string") el.src = source;
  else if (source) el.srcObject = source;
  else el.load();
}

/** The surface's `<video>`, held in a ref; `mounted` changes when it (re)mounts so effects rerun. */
function useVideoElement() {
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [mounted, setMounted] = React.useState(0);
  const onElement = React.useCallback((node: HTMLVideoElement | null) => {
    ref.current = node;
    setMounted((n) => n + 1);
  }, []);
  return { ref, mounted, onElement };
}

/** Plays a local file: probe, plan, then native or remux. */
function LocalPlayer({ item: live, file }: { item: MediaItem; file: File }) {
  // Frozen at mount (the stage keys players by item): a saved position changes
  // the cached item, and that must never re-run the source effects.
  const [item] = React.useState(live);
  const video = useVideoElement();
  const [phase, setPhase] = React.useState<Phase>({ kind: "opening" });
  const { mounted } = video;
  // Before the source effect: its cleanups (last position, session release) run first.
  usePlayerWiring(video.ref, mounted, item);
  // The chrome stays off a file that can't play: the notice says why.
  const cannot = phase.kind === "cannot";
  React.useEffect(() => {
    usePlayer.getState().setFailed(cannot);
  }, [cannot]);

  React.useEffect(() => {
    const el = video.ref.current;
    if (!el) return;
    // An object, so a cleanup during an await is seen after it.
    const life = { alive: true };
    const isAlive = () => life.alive;
    const engine = new MediaEngine();
    const jobId = crypto.randomUUID();
    const cleanups: (() => void)[] = [];
    // Ends the slow-start card (timer included); a no-op until a remux starts.
    let endNotice: () => void = () => undefined;
    const listen = <K extends keyof HTMLMediaElementEventMap>(type: K, fn: (e: HTMLMediaElementEventMap[K]) => void) => {
      el.addEventListener(type, fn);
      cleanups.push(() => {
        el.removeEventListener(type, fn);
      });
    };
    const fail = (message: string) => {
      endNotice();
      if (!isAlive()) return;
      setPhase({ kind: "cannot", message });
    };

    const remux = async (plan: Extract<PlaybackPlan, { mode: "remux" }>) => {
      endNotice = slowRemuxNotice({
        id: jobId,
        title: item.title,
        cancel: () => {
          engine.close();
          fail("Stopped before it started playing.");
        },
      });
      listen("loadeddata", () => {
        endNotice();
      });
      cleanups.push(
        engine.on((m) => {
          if (m.type === "remux-failed") fail(`This file couldn't be converted to play: ${m.message}`);
        }),
      );
      listen("timeupdate", () => {
        engine.time(el.currentTime);
      });
      listen("seeking", () => {
        engine.seek(el.currentTime);
      });
      // Backstop: a stall asks the worker whether the remux must restart there.
      listen("waiting", () => {
        // Mid-seek, `seeking` already asked; before metadata there is nothing to ask about.
        if (!el.seeking && el.readyState >= el.HAVE_METADATA) engine.seek(el.currentTime);
      });
      const handle = await engine.remux(plan.video, plan.audio);
      if (!isAlive()) return;
      setSource(el, handle);
      setPhase({ kind: "playing", mode: "remux" });
      void el.play().catch(() => undefined);
    };

    void (async () => {
      let opened;
      try {
        opened = await engine.open(file);
      } catch {
        fail("The media reader stopped. Open the file again.");
        return;
      }
      if (!isAlive()) return;
      if (opened.fp !== item.fp) {
        fail("This file has changed since it was added, so it isn't the same video any more.");
        return;
      }
      const probe = opened.probe;
      if (!probe) {
        // Mediabunny can't read the container; the browser may still play it.
        if (file.type && el.canPlayType(file.type) !== "") {
          log(item, { mode: "native (unprobed)" }, null);
          const url = URL.createObjectURL(file);
          cleanups.push(() => {
            URL.revokeObjectURL(url);
          });
          listen("error", () => {
            fail("This file isn't a format this player can read.");
          });
          setSource(el, url);
          setPhase({ kind: "playing", mode: "native" });
          void el.play().catch(() => undefined);
        } else fail("This file isn't a format this player can read.");
        return;
      }
      const caps = capsFrom(probe, browserCapsDeps(el));
      const plan = planPlayback(probe, caps);
      log(item, plan, probe);
      if (plan.mode === "cannot") {
        fail(cannotMessage(plan.reason));
        return;
      }
      if (plan.mode === "transcode") {
        fail("This file needs converting, which isn't built yet.");
        return;
      }
      if (plan.mode === "remux") {
        remux(plan).catch((e: unknown) => {
          fail(e instanceof Error ? e.message : "The conversion failed.");
        });
        return;
      }

      const url = URL.createObjectURL(file);
      cleanups.push(() => {
        URL.revokeObjectURL(url);
      });
      // Once: a native load error falls to the remux (V52); any later error just says so.
      const state = { started: false, fellBack: false };
      listen("loadeddata", () => {
        state.started = true;
      });
      listen("error", () => {
        if (state.started || state.fellBack) {
          fail("Playback stopped with an error.");
          return;
        }
        state.fellBack = true;
        const again = planPlayback(probe, { ...caps, nativeFailed: true });
        log(item, again, probe);
        setSource(el, null);
        if (again.mode === "remux") {
          remux(again).catch(() => {
            fail("The conversion failed.");
          });
        } else fail(again.mode === "cannot" ? cannotMessage(again.reason) : "This file can't play here.");
      });
      setSource(el, url);
      setPhase({ kind: "playing", mode: "native" });
      void el.play().catch(() => undefined);
    })();

    return () => {
      life.alive = false;
      for (const c of cleanups) c();
      endNotice();
      engine.close();
      setSource(el, null);
    };
    // `mounted` stands for the element: the effect reruns when it remounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, file, item]);

  return (
    <div className="flex flex-col gap-3 group-data-[fullscreen]/cinema:h-full">
      <div className={cn(STAGE, phase.kind === "cannot" && "hidden")}>
        <MediaSurface title={item.title} onElement={video.onElement} />
      </div>
      {phase.kind === "cannot" ? (
        <Notice icon={TriangleAlert} title="Can't play this file">
          <p className="max-w-sm text-[13px] leading-relaxed text-pretty text-ink-2">{phase.message}</p>
        </Notice>
      ) : null}
    </div>
  );
}

/** A direct http(s) media URL: the browser fetches it; the server never does (V56). */
function LinkPlayer({ item: live }: { item: MediaItem }) {
  // Frozen at mount, as in LocalPlayer.
  const [item] = React.useState(live);
  const video = useVideoElement();
  const { mounted } = video;
  const [failed, setFailed] = React.useState(false);
  usePlayerWiring(video.ref, mounted, item);
  React.useEffect(() => {
    const el = video.ref.current;
    if (!el) return;
    const parsed = parseMediaUrl(item.uri);
    if (parsed.kind !== "url") return;
    const onError = () => {
      setFailed(true);
    };
    el.addEventListener("error", onError);
    setSource(el, parsed.url);
    log(item, { mode: "link" }, null);
    // Opening plays, as a local file does, so a run of next keys goes on through links.
    void el.play().catch(() => undefined);
    return () => {
      el.removeEventListener("error", onError);
      setSource(el, null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, item]);
  if (failed) {
    return (
      <Notice icon={TriangleAlert} title="That link didn't play">
        <p className="max-w-sm text-[13px] leading-relaxed text-pretty text-ink-2">
          It may not point straight at a video or audio file, or the site may not allow playing it elsewhere.
        </p>
      </Notice>
    );
  }
  return (
    <div className={STAGE}>
      <MediaSurface title={item.title} onElement={video.onElement} />
    </div>
  );
}

const EMBED_ALLOW = "autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write";

function EmbedPlayer({ item }: { item: MediaItem }) {
  // Rebuilt from the URI every time, never read from storage (V56).
  const parsed = parseMediaUrl(item.uri);
  if (parsed.kind !== "embed") {
    return <Notice icon={TriangleAlert} title="This link can't be embedded" />;
  }
  const tall = parsed.provider === "spotify" || parsed.provider === "soundcloud";
  return (
    <iframe
      key={parsed.embedSrc}
      src={parsed.embedSrc}
      title={`${item.title} (${providerName(parsed.provider)})`}
      allow={EMBED_ALLOW}
      allowFullScreen
      referrerPolicy="strict-origin-when-cross-origin"
      sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox"
      loading="eager"
      className={cn("w-full rounded-card bg-stage", tall ? "h-[352px]" : "aspect-video")}
    />
  );
}

/** "Not on this device", or a kept file that needs a click for permission (V54). */
function FileMissing({ item, located, onFile }: { item: MediaItem; located: Exclude<Located, { kind: "file" }>; onFile: (f: File) => void }) {
  const api = useMediaApi();
  const [busy, setBusy] = React.useState(false);
  const pick = useFilePick(async (file, handle) => {
    setBusy(true);
    try {
      const added = await api.addFile(file, handle);
      if (!added) return;
      if (added.fp === item.fp) {
        rememberFile(item.fp, file);
        onFile(file);
      } else {
        toast({ title: "That's a different file", body: `It doesn't match ${item.title}, so it was added as its own item.` });
      }
    } finally {
      setBusy(false);
    }
  });

  if (located.kind === "permission") {
    return (
      <Notice icon={KeyRound} title="Allow access to play it">
        <p className="max-w-sm text-[13px] leading-relaxed text-pretty text-ink-2">
          The browser needs your permission again to read <span className="font-medium text-foreground">{located.name}</span>.
        </p>
        <button
          type="button"
          className={buttonClass("inverse", "pill-sm")}
          onClick={() => {
            void regrant(item.fp).then((file) => {
              if (file) onFile(file);
            });
          }}
        >
          <KeyRound aria-hidden />
          Allow
        </button>
      </Notice>
    );
  }
  return (
    <Notice icon={CloudOff} title="Not on this device">
      {pick.input}
      <p className="max-w-sm text-[13px] leading-relaxed text-pretty text-ink-2">
        Open <span className="font-medium text-foreground">{item.uri}</span> from this device to play it here. The file never leaves the device it&apos;s on.
      </p>
      <button type="button" onClick={pick.open} disabled={busy} className={buttonClass("inverse", "pill-sm")}>
        <FolderOpen aria-hidden />
        {busy ? "Checking…" : "Open file"}
      </button>
    </Notice>
  );
}

function LocalItem({ item }: { item: MediaItem }) {
  const [located, setLocated] = React.useState<Located | null>(null);
  React.useEffect(() => {
    // Stage keys this by item, so a new item starts from null without a reset here.
    let alive = true;
    void locate(item.fp).then((l) => {
      if (alive) setLocated(l);
    });
    return () => {
      alive = false;
    };
  }, [item.fp]);
  if (!located) return <StageShell />;
  if (located.kind === "file") return <LocalPlayer key={item.id} item={item} file={located.file} />;
  return (
    <FileMissing
      item={item}
      located={located}
      onFile={(file) => {
        setLocated({ kind: "file", file });
        // On this device again: its thumbnail may be made now.
        retryThumb(item.fp);
      }}
    />
  );
}

export function Stage({ item }: { item: MediaItem }) {
  switch (item.source) {
    case "embed":
      return <EmbedPlayer item={item} />;
    case "url":
      return <LinkPlayer key={item.id} item={item} />;
    case "local":
      return <LocalItem key={item.id} item={item} />;
    case "r2":
      return <Notice icon={CloudOff} title="Uploads aren't on yet" />;
  }
}
