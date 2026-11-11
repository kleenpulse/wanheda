"use client";

import * as React from "react";
import { flushSync } from "react-dom";
import {
  ArrowLeft,
  GalleryVerticalEnd,
  Expand,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RectangleHorizontal,
  RotateCcw,
  RotateCw,
  Shrink,
  SkipForward,
  Volume1,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { Tip, TooltipGroup } from "@/components/ui/tooltip";
import { replaceUrlParams } from "@/hooks/use-url-param";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { autoplayPref, fitPref, playerClock, resolutionLabel, shouldOfferNext, videoVolumePref } from "@/lib/media/cinema";
import { displayTitle, railItems, upNext } from "@/lib/media/episodes";
import { locate, regrant } from "@/lib/media/local";
import { formatDuration } from "@/lib/media/media";
import { frameStep, keyAction, SHORTCUTS, type KeyTarget, type PlayerAction } from "@/lib/media/player-keys";
import type { MediaItem } from "@/lib/media/types";
import { videoStore, type VideoSnapshot } from "@/lib/media/video-store";
import { nudgeVolume, wheelSteps, WHEEL_STEP } from "@/lib/media/volume";
import { cn } from "@/lib/utils";
import { openWatch } from "./watch-nav";
import { CaptionsLayer } from "./captions-layer";
import { SUBTITLE_ACCEPT, seekElement, setElementRate, stepSpeed, usePlayer } from "./player-store";
import { applyVideoVolume } from "./use-player";
import { CHROME_BUTTON, SettingsMenu, SubtitlesMenu } from "./video-menus";
import { retryThumb } from "./thumb-queue";
import { NextCard, UpNextRail } from "./up-next-rail";
import { VideoScrub } from "./video-scrub";

// The video player's chrome (T72, V65), in place of Video.js's stock skin.
//
// - `CinemaFrame` is the player's frame on /media: the stage, the resume
//   question and this chrome all live in it, it is what goes full screen, and
//   every menu, tooltip and status line renders inside it, so all of them
//   still show while it fills the screen. (iPhone Safari can only put the bare
//   <video> full screen: there the native player takes over, without these.)
// - Embeds keep their provider's own controls: no chrome over an iframe.
// - Playing never commits React once a frame: the snapshot changes at most
//   once a second, and the bar and clock are painted from the element.
// - The controls fade after a while of playing, but never while a menu is
//   open, the pointer is on them, or the keyboard is in them; hidden, they
//   are `inert`, and any key or a Tab brings them back.

/**
 * The centre play and ±10 buttons: the resume prompt's frosted glass in the
 * theme's own ink (user 2026-11-08), so they read on any frame, light or dark.
 * Under reduced transparency `--glass` is solid (globals.css).
 */
const CENTRE_GLASS =
  "pointer-events-auto grid place-items-center rounded-full glass-window text-foreground shadow-lg outline-none transition-[filter,transform] duration-150 hover:brightness-110 focus-visible:ring-2 focus-visible:ring-ring";

const HIDE_AFTER_MS = 2500;
const OSD_MS = 700;
const DOUBLE_TAP_MS = 300;
/**
 * How long a mouse click on the picture waits before it plays or pauses, in case it is the
 * first half of a double click (full screen). Short of this, a double click never touches
 * playback; a slower one (Windows allows DOUBLE_CLICK_MAX_MS) is put right when its second
 * click lands. The owner's own double clicks ran about 200 ms apart (recording, 2026-11-11).
 */
const CLICK_HOLD_MS = 280;
/** The longest gap Windows calls a double click by default. A single click older than this is nobody's first half. */
const DOUBLE_CLICK_MAX_MS = 500;
/** How long the next video may take to open before a carried picture-in-picture window closes. */
const PIP_TAKEOVER_MS = 10_000;

type Osd = { id: number; text: string; side: "left" | "right" | "center" };

const SERVER_SNAPSHOT: VideoSnapshot = {
  paused: true,
  ended: false,
  waiting: false,
  duration: Number.NaN,
  second: 0,
  volume: 1,
  muted: false,
  rate: 1,
  width: 0,
  height: 0,
  pip: false,
};

function onFullscreenChange(cb: () => void): () => void {
  document.addEventListener("fullscreenchange", cb);
  return () => {
    document.removeEventListener("fullscreenchange", cb);
  };
}

/** Is `root` the element filling the screen? */
function useFullscreen(root: HTMLElement | null): boolean {
  return React.useSyncExternalStore(
    onFullscreenChange,
    () => root !== null && document.fullscreenElement === root,
    () => false,
  );
}

const isTyping = (t: EventTarget) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * The player's frame. `children` is the stage and whatever floats over it
 * (the resume question); the chrome joins them once a `<video>` is playing.
 */
export function CinemaFrame({
  item,
  items,
  className,
  children,
}: {
  item: MediaItem;
  /** The library, for the up-next rail and the next video. */
  items: readonly MediaItem[];
  className?: string;
  children: React.ReactNode;
}) {
  const [root, setRoot] = React.useState<HTMLDivElement | null>(null);
  const full = useFullscreen(root);
  const el = usePlayer((s) => s.el);
  const failed = usePlayer((s) => s.failed);
  // The element must be this item's: on a change the old one is still registered for a moment.
  const owned = usePlayer((s) => s.itemId === item.id);
  // The rail: opened or closed by the owner, else shown while paused full screen. Kept across episodes.
  const [rail, setRail] = React.useState<boolean | null>(null);

  React.useEffect(() => {
    usePlayer.getState().setRoot(root);
    return () => {
      usePlayer.getState().setRoot(null);
    };
  }, [root]);

  const embed = item.source === "embed";
  // An embed never gets a player, so picture in picture can't follow onto it: close the window now.
  React.useEffect(() => {
    if (embed && usePlayer.getState().carryPip) usePlayer.getState().endCarry("Links from other sites play in their own player.");
  }, [embed, item.id]);

  // The frame goes only when the player closes (× or leaving the app; an item change keeps it): no
  // next video is coming, so close the window now. Passive, so it runs after the wiring's layout
  // cleanup has started the carry.
  React.useEffect(
    () => () => {
      if (usePlayer.getState().carryPip) usePlayer.getState().endCarry();
    },
    [],
  );

  const chromed = el !== null && owned && root !== null && !failed && !embed;
  return (
    <div
      ref={setRoot}
      data-fullscreen={full ? "" : undefined}
      className={cn("group/cinema @container/cinema relative isolate", full && "flex size-full max-w-none! items-center justify-center bg-island", className)}
      // Without the chrome (an embed keeps its own controls) `t` still switches theatre from the frame.
      onKeyDown={(e) => {
        if (chromed || e.key.toLowerCase() !== "t" || e.ctrlKey || e.altKey || e.metaKey || isTyping(e.target)) return;
        e.preventDefault();
        usePlayer.getState().setTheatre(!usePlayer.getState().theatre);
      }}
    >
      {children}
      {chromed ? <VideoChrome key={item.id} el={el} item={item} items={items} root={root} full={full} rail={rail} setRail={setRail} /> : null}
    </div>
  );
}

/** Where a key landed, for the key map (player-keys.ts). */
function keyTarget(target: EventTarget | null, root: HTMLElement): KeyTarget {
  if (!(target instanceof HTMLElement)) return "outside";
  // A menu (it renders in the frame) keeps every key: typeahead, arrows, Escape.
  if (target.closest("[role=menu], [role=listbox], [role=dialog]")) return "outside";
  if (target instanceof HTMLInputElement && target.type === "range") return "widget";
  if (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return "text";
  if (target === document.body) return "player";
  if (!root.contains(target)) return "outside";
  if (target === root) return "player";
  // The rail, the sliders and the menu buttons (arrow opens the menu) keep the arrows; a plain button only
  // presses, so its arrows still seek and set the volume.
  if (target.closest("[role=slider], [data-rail], [aria-haspopup]")) return "widget";
  if (target.closest("button, a")) return "button";
  return "player";
}

function VideoChrome({
  el,
  item,
  items,
  root,
  full,
  rail,
  setRail,
}: {
  el: HTMLVideoElement;
  item: MediaItem;
  items: readonly MediaItem[];
  root: HTMLDivElement;
  full: boolean;
  rail: boolean | null;
  setRail: (open: boolean | null) => void;
}) {
  const store = React.useMemo(() => videoStore(el, () => document.pictureInPictureElement === el), [el]);
  const snap = React.useSyncExternalStore(store.subscribe, store.getSnapshot, () => SERVER_SNAPSHOT);
  const reduced = useReducedMotion();
  const theatre = usePlayer((s) => s.theatre);
  const asking = usePlayer((s) => s.ask?.itemId === item.id);
  const canStep = usePlayer((s) => s.step !== null);
  const status = usePlayer((s) => s.status);
  const fit = fitPref.use();
  const autoplay = autoplayPref.use();
  const named = displayTitle(item);
  const next = React.useMemo(() => upNext(items, item)[0] ?? null, [items, item]);
  const hasList = React.useMemo(() => railItems(items, item).length > 1, [items, item]);
  const railOpen = hasList && (rail ?? (full && snap.paused));
  const [declined, setDeclined] = React.useState(false);
  const offer = next !== null && !declined && !asking && shouldOfferNext({ t: snap.second, duration: snap.duration, ended: snap.ended, hasNext: true, autoplay });
  // A local next file whose permission lapsed can't open without a click: its card waits for one.
  const [needsGesture, setNeedsGesture] = React.useState(false);
  React.useEffect(() => {
    if (!offer || next.source !== "local") return;
    let alive = true;
    void locate(next.fp).then((l) => {
      // A native folder file (desktop) needs no permission: only a lapsed handle waits for a click.
      if (alive) setNeedsGesture(l.kind !== "file" && l.kind !== "native");
    });
    return () => {
      alive = false;
    };
  }, [offer, next]);

  const [shown, setShown] = React.useState(true);
  const [help, setHelp] = React.useState(false);
  const [osd, setOsd] = React.useState<Osd | null>(null);
  const menus = React.useRef(0);
  const holding = React.useRef(false);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const osdTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const fps = React.useRef<number | null>(null);
  const subtitleInput = React.useRef<HTMLInputElement>(null);
  const lastTap = React.useRef<{ at: number; x: number } | null>(null);
  const pointerType = React.useRef<string>("mouse");
  /** The picture's pending single click, and when this run of clicks played or paused (null: it hasn't). */
  const click = React.useRef<{ timer: ReturnType<typeof setTimeout> | null; toggledAt: number | null }>({ timer: null, toggledAt: null });
  React.useEffect(() => {
    const pending = click.current;
    return () => {
      if (pending.timer !== null) clearTimeout(pending.timer);
    };
  }, []);
  /** The last pointer was a finger: the centre controls show while playing too. */
  const [touch, setTouch] = React.useState(false);
  // The controls stack's height: the captions sit just above it while it's up.
  const bottomBar = React.useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = React.useState(0);
  React.useEffect(() => {
    const node = bottomBar.current;
    if (!node) return;
    const ro = new ResizeObserver(() => {
      setBarHeight(Math.round(node.offsetHeight));
    });
    ro.observe(node);
    return () => {
      ro.disconnect();
    };
  }, []);

  const pipOk = typeof document !== "undefined" && document.pictureInPictureEnabled && !el.disablePictureInPicture;
  // A link's frames belong to another site: drawing one taints the canvas.
  const canSaveFrame = item.source !== "url";

  // --- Showing and hiding -------------------------------------------------

  const canHide = React.useCallback(() => {
    if (el.paused || menus.current > 0 || holding.current || help) return false;
    // Keyboard focus in the controls keeps them up (a mouse click's focus doesn't).
    return root.querySelector("[data-controls] :focus-visible") === null;
  }, [el, help, root]);
  // The timer reads the newest rule (the help sheet may have opened since it started).
  const canHideRef = React.useRef(canHide);
  React.useEffect(() => {
    canHideRef.current = canHide;
  }, [canHide]);

  /** Hides the controls after `ms`, or keeps checking while something holds them up. */
  const schedule = React.useCallback((ms = HIDE_AFTER_MS) => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    const check = () => {
      if (canHideRef.current()) setShown(false);
      else hideTimer.current = setTimeout(check, HIDE_AFTER_MS);
    };
    hideTimer.current = setTimeout(check, ms);
  }, []);

  const poke = React.useCallback(() => {
    setShown(true);
    schedule();
  }, [schedule]);

  // Paused, the controls stay up; playing again starts the countdown to hide them.
  const visible = shown || snap.paused;
  React.useEffect(() => {
    if (!snap.paused) schedule();
    else if (hideTimer.current) clearTimeout(hideTimer.current);
  }, [snap.paused, schedule]);

  React.useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
      if (osdTimer.current) clearTimeout(osdTimer.current);
    },
    [],
  );

  const onMenu = React.useCallback(
    (open: boolean) => {
      menus.current = Math.max(0, menus.current + (open ? 1 : -1));
      if (open) setShown(true);
      else schedule();
    },
    [schedule],
  );

  const flash = (text: string, side: Osd["side"] = "center") => {
    if (osdTimer.current) clearTimeout(osdTimer.current);
    const id = Date.now();
    setOsd({ id, text, side });
    osdTimer.current = setTimeout(() => {
      setOsd((o) => (o?.id === id ? null : o));
    }, OSD_MS);
  };

  // --- Actions ------------------------------------------------------------

  const toggleFullscreen = React.useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
      return;
    }
    if (typeof root.requestFullscreen === "function") {
      root.requestFullscreen({ navigationUI: "hide" }).catch(() => {
        usePlayer.getState().notify("Couldn't fill the screen", "The browser didn't allow it.");
      });
      return;
    }
    // iPhone Safari: only the bare <video> can fill the screen (the native player, without this chrome).
    (el as HTMLVideoElement & { webkitEnterFullscreen?: () => void }).webkitEnterFullscreen?.();
  }, [el, root]);

  const togglePip = React.useCallback(() => {
    if (document.pictureInPictureElement === el) {
      void document.exitPictureInPicture().catch(() => undefined);
      return;
    }
    el.requestPictureInPicture().catch(() => {
      usePlayer.getState().notify("Picture in picture didn't open", "Play the video first, then try again.");
    });
  }, [el]);

  // The palette's player commands drive the same actions.
  React.useEffect(() => {
    usePlayer.getState().setControls({ toggleFullscreen, togglePictureInPicture: togglePip });
    return () => {
      usePlayer.getState().setControls(null);
    };
  }, [toggleFullscreen, togglePip]);

  const togglePlay = React.useCallback(() => {
    if (el.paused || el.ended) void el.play().catch(() => undefined);
    else el.pause();
  }, [el]);

  const seekBy = (by: number) => {
    seekElement(el, el.currentTime + by);
    flash(`${by > 0 ? "+" : "−"}${String(Math.abs(by))}s`, by > 0 ? "right" : "left");
  };

  const setVolume = (next: ReturnType<typeof videoVolumePref.get>) => {
    videoVolumePref.set(next);
    applyVideoVolume(el, next);
  };

  const toggleCaptions = () => {
    const { track, lastTrack, setTrack } = usePlayer.getState();
    if (track) {
      setTrack(null);
      flash("Subtitles off");
      return;
    }
    const first = Array.from(el.textTracks).find((t) => t.kind === "subtitles" || t.kind === "captions") ?? null;
    const next = lastTrack ?? first;
    if (!next) {
      usePlayer.getState().notify("No subtitles yet", "Add a .srt or .vtt file from the subtitles menu.");
      return;
    }
    setTrack(next);
    flash(`Subtitles: ${next.label || "on"}`);
  };

  const step = (dir: 1 | -1) => {
    const go = usePlayer.getState().step;
    if (!go?.(dir)) usePlayer.getState().notify(dir > 0 ? "This is the last video" : "This is the first video");
  };

  /** Opens `to` from the rail or the next card. Moving on from the card counts this one as watched (V55). */
  const goTo = (to: MediaItem, fromCard: boolean) => {
    if (fromCard) usePlayer.getState().finish?.();
    const open = () => {
      openWatch(to.id);
    };
    // A file whose permission lapsed: this click is the gesture the browser needs to grant it again.
    if (to.source === "local" && needsGesture) {
      void regrant(to.fp)
        .then((file) => {
          if (file) retryThumb(to.fp);
        })
        .finally(open);
    } else open();
  };

  // Picture in picture was open on the player before this one: take the window over (V65). While the
  // old element is still the PiP element the browser needs no fresh click, so autoplay keeps it too.
  // If the window can't be taken, it's closed: never left frozen on the old video.
  React.useEffect(() => {
    if (!usePlayer.getState().claimCarry()) return;
    let done = false;
    const take = () => {
      if (done) return;
      done = true;
      el.requestPictureInPicture().catch(() => {
        usePlayer.getState().endCarry("Press I to open it again.");
      });
    };
    // A source still opening (a remux) gets a while longer; then the window closes.
    const giveUp = setTimeout(() => {
      if (done) return;
      done = true;
      usePlayer.getState().endCarry("The next video took too long to open.");
    }, PIP_TAKEOVER_MS);
    if (el.readyState >= el.HAVE_METADATA) take();
    else el.addEventListener("loadedmetadata", take, { once: true });
    return () => {
      clearTimeout(giveUp);
      el.removeEventListener("loadedmetadata", take);
    };
  }, [el]);

  const saveFrame = () => {
    if (!canSaveFrame || el.videoWidth === 0) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = el.videoWidth;
      canvas.height = el.videoHeight;
      canvas.getContext("2d")?.drawImage(el, 0, 0);
      const at = playerClock(el.currentTime).replace(/:/g, "-");
      const name = `${item.title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 80) || "frame"}-${at}.png`;
      canvas.toBlob((blob) => {
        if (!blob) {
          usePlayer.getState().notify("Couldn't save the frame");
          return;
        }
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.click();
        setTimeout(() => {
          URL.revokeObjectURL(url);
        }, 1000);
        usePlayer.getState().notify("Frame saved", name);
      }, "image/png");
    } catch (e) {
      usePlayer
        .getState()
        .notify("Couldn't save the frame", e instanceof DOMException && e.name === "SecurityError" ? "The site this video comes from doesn't allow it." : undefined);
    }
  };

  const run = (a: PlayerAction) => {
    switch (a.type) {
      case "toggle":
        togglePlay();
        return;
      case "seek":
        seekBy(a.by);
        return;
      case "volume": {
        const next = nudgeVolume(videoVolumePref.get(), a.by);
        setVolume(next);
        flash(next.muted ? "Muted" : `Volume ${String(Math.round(next.level * 100))}%`);
        return;
      }
      case "mute": {
        const v = videoVolumePref.get();
        setVolume({ ...v, muted: !v.muted });
        flash(v.muted ? "Sound on" : "Muted");
        return;
      }
      case "fullscreen":
        toggleFullscreen();
        return;
      case "pip":
        if (pipOk) togglePip();
        return;
      case "captions":
        toggleCaptions();
        return;
      case "theatre":
        if (!full) usePlayer.getState().setTheatre(!usePlayer.getState().theatre);
        return;
      case "next":
        step(1);
        return;
      case "prev":
        step(-1);
        return;
      case "speed": {
        const rate = stepSpeed(el.playbackRate, a.dir);
        setElementRate(el, rate);
        flash(`${String(rate)}×`);
        return;
      }
      case "jump":
        if (Number.isFinite(el.duration)) seekElement(el, el.duration * a.fraction);
        return;
      case "frame":
        seekElement(el, el.currentTime + a.dir * frameStep(fps.current));
        return;
      case "help":
        setHelp((h) => !h);
        return;
    }
  };

  const onKey = (e: KeyboardEvent | React.KeyboardEvent) => {
    if (e.defaultPrevented) return;
    if (e.key === "Escape" && help) {
      setHelp(false);
      e.preventDefault();
      return;
    }
    const action = keyAction(e, keyTarget(e.target, root), el.paused);
    if (!action) return;
    e.preventDefault();
    poke();
    run(action);
  };
  const onBodyKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (e.target === document.body) onKey(e);
  });

  // With nothing focused (the page body), the keys belong to the video playing.
  React.useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      onBodyKey(e);
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
    };
  }, []);

  // The frame rate, for a frame step: measured from the frames as they show (the probe doesn't give it).
  React.useEffect(() => {
    if (typeof el.requestVideoFrameCallback !== "function") return;
    let handle = 0;
    let prev: { frames: number; time: number } | null = null;
    const onFrame = (_now: number, meta: VideoFrameCallbackMetadata) => {
      if (prev && meta.presentedFrames - prev.frames === 1) {
        const dt = meta.mediaTime - prev.time;
        if (dt > 0.003 && dt < 0.2) fps.current = 1 / dt;
      }
      prev = { frames: meta.presentedFrames, time: meta.mediaTime };
      handle = el.requestVideoFrameCallback(onFrame);
    };
    handle = el.requestVideoFrameCallback(onFrame);
    return () => {
      el.cancelVideoFrameCallback(handle);
    };
  }, [el]);

  // --- Picture ------------------------------------------------------------

  const volume = videoVolumePref.use();
  const VolumeIcon = volume.muted || volume.level === 0 ? VolumeX : volume.level < 0.5 ? Volume1 : Volume2;
  const label = resolutionLabel(snap.width, snap.height);
  const meta = [
    label,
    formatDuration(Number.isFinite(snap.duration) ? snap.duration : item.durationS),
    item.meta.format ?? null,
  ].filter((v): v is string => Boolean(v));
  const centre = visible && !asking && (full || snap.paused || touch);
  const fade = reduced ? "" : "transition-opacity duration-300 ease-out-quint";

  return (
    <div
      role="group"
      aria-label={`Video player: ${named.show ? `${named.show}, ` : ""}${named.title}`}
      tabIndex={0}
      className={cn("absolute inset-0 z-10 outline-none focus-visible:ring-2 focus-visible:ring-ring", full ? "rounded-none" : "rounded-card", !visible && full && "cursor-none")}
      onPointerMove={(e) => {
        pointerType.current = e.pointerType;
        setTouch(e.pointerType === "touch");
        if (e.pointerType !== "touch") poke();
      }}
      onPointerLeave={() => {
        if (!el.paused) schedule(600);
      }}
      onFocus={() => {
        setShown(true);
      }}
      onKeyDownCapture={() => {
        // Hidden controls are inert: show them before the browser moves focus.
        if (!shown) {
          flushSync(() => {
            setShown(true);
          });
        }
        schedule();
      }}
      onKeyDown={onKey}
    >
      <input
        ref={subtitleInput}
        type="file"
        name="subtitles"
        accept={SUBTITLE_ACCEPT}
        hidden
        onChange={(e) => {
          const file = e.currentTarget.files?.[0];
          e.currentTarget.value = "";
          if (file) void usePlayer.getState().subtitles(file);
        }}
      />

      {/* The picture: a click plays or pauses, a double click fills the screen and leaves playback alone (the click waits CLICK_HOLD_MS to find out which it is); on touch a tap shows the controls and a double tap at either side skips. */}
      <div
        aria-hidden
        className="absolute inset-0"
        onPointerUp={(e) => {
          pointerType.current = e.pointerType;
          setTouch(e.pointerType === "touch");
          if (e.pointerType !== "touch") return;
          const now = performance.now();
          const r = e.currentTarget.getBoundingClientRect();
          const x = (e.clientX - r.left) / r.width;
          const last = lastTap.current;
          if (last && now - last.at < DOUBLE_TAP_MS && (x < 1 / 3 || x > 2 / 3)) {
            seekBy(x < 1 / 3 ? -10 : 10);
            lastTap.current = null;
            return;
          }
          lastTap.current = { at: now, x };
          if (shown && !el.paused) setShown(false);
          else poke();
        }}
        onClick={(e) => {
          if (pointerType.current === "touch") return;
          poke();
          const run = click.current;
          if (e.detail >= 2) {
            // The second click of a double click (full screen): playback is as it was before the first.
            if (run.timer !== null) {
              clearTimeout(run.timer);
              run.timer = null;
            } else if (run.toggledAt !== null) {
              // A slow double click: the first click already took effect. Undo it, unless that click is long past
              // (a second click that landed here because the button under the first one has gone).
              const fresh = performance.now() - run.toggledAt < DOUBLE_CLICK_MAX_MS;
              run.toggledAt = null;
              if (fresh) togglePlay();
            }
            return;
          }
          // A click with no pointer behind it (detail 0: a script, assistive tech) has no second half to wait for.
          if (e.detail === 0) {
            togglePlay();
            return;
          }
          run.toggledAt = null;
          if (run.timer !== null) clearTimeout(run.timer);
          run.timer = setTimeout(() => {
            run.timer = null;
            run.toggledAt = performance.now();
            togglePlay();
          }, CLICK_HOLD_MS);
        }}
        onDoubleClick={() => {
          if (pointerType.current !== "touch") toggleFullscreen();
        }}
      />

      <CaptionsLayer lift={visible ? barHeight : null} />

      {/* Seek and volume feedback. */}
      {osd ? (
        <div
          key={osd.id}
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 z-20 -translate-y-1/2 rounded-full bg-island/70 px-4 py-2 text-sm font-semibold text-island-foreground tabular backdrop-blur-md",
            osd.side === "left" ? "left-[12%]" : osd.side === "right" ? "right-[12%]" : "left-1/2 -translate-x-1/2",
          )}
        >
          {osd.text}
        </div>
      ) : null}

      {/* The status line: what a toast would say, while the player fills the screen. */}
      {status ? (
        <p role="status" className="pointer-events-none absolute top-20 left-1/2 z-30 max-w-[80%] -translate-x-1/2 rounded-full bg-island/80 px-4 py-2 text-center text-[13px] text-island-foreground backdrop-blur-md">
          {status.text}
        </p>
      ) : null}

      <div data-controls inert={!visible} className={cn("pointer-events-none absolute inset-0", fade, visible ? "opacity-100" : "opacity-0")}>
        {/* Scrims, so white controls read on any picture. */}
        <div aria-hidden className={cn("pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-linear-to-t from-island/85 via-island/35 to-transparent", full ? "h-64" : "h-36", !full && "rounded-b-card")} />
        {full ? <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-linear-to-b from-island/70 to-transparent" /> : null}

        {full ? (
          <div className="pointer-events-auto absolute inset-x-0 top-0 flex items-center gap-3 px-6 pt-5 text-island-foreground">
            <button type="button" aria-label="Leave full screen" className={CHROME_BUTTON} onClick={toggleFullscreen}>
              <ArrowLeft aria-hidden />
            </button>
            <p className="min-w-0 flex-1 truncate text-[15px] font-medium">{named.show ? `${named.show} · ${named.title}` : named.title}</p>
            <button
              type="button"
              aria-label="Close the video"
              className={cn(CHROME_BUTTON, "bg-island-foreground/12")}
              onClick={() => {
                void (document.fullscreenElement ? document.exitFullscreen() : Promise.resolve()).catch(() => undefined).finally(() => {
                  replaceUrlParams({ m: null });
                });
              }}
            >
              <X aria-hidden />
            </button>
          </div>
        ) : null}

        {centre ? (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-[clamp(1.5rem,8cqw,5rem)]">
            <button type="button" aria-label="Back 10 seconds" className={cn(CENTRE_GLASS, "relative size-14 active:scale-90")} onClick={() => { seekBy(-10); }}>
              <RotateCcw aria-hidden className="size-9" strokeWidth={1.6} />
              <span aria-hidden className="tabular absolute text-[10px] font-semibold">10</span>
            </button>
            <button
              type="button"
              aria-label={snap.paused ? "Play" : "Pause"}
              aria-keyshortcuts="k"
              className={cn(CENTRE_GLASS, "size-[clamp(3.5rem,11cqw,5.5rem)] active:scale-95")}
              onClick={togglePlay}
            >
              {snap.waiting ? (
                <LoaderCircle aria-hidden className="size-1/2 animate-spin motion-reduce:animate-none" />
              ) : snap.paused ? (
                <Play aria-hidden className="size-[42%] translate-x-[6%] fill-current" />
              ) : (
                <Pause aria-hidden className="size-[40%] fill-current" />
              )}
            </button>
            <button type="button" aria-label="Forward 10 seconds" className={cn(CENTRE_GLASS, "relative size-14 active:scale-90")} onClick={() => { seekBy(10); }}>
              <RotateCw aria-hidden className="size-9" strokeWidth={1.6} />
              <span aria-hidden className="tabular absolute text-[10px] font-semibold">10</span>
            </button>
          </div>
        ) : snap.waiting ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center">
            <LoaderCircle className="size-10 animate-spin text-island-foreground/90 motion-reduce:animate-none" />
          </div>
        ) : null}

        <div
          ref={bottomBar}
          className={cn("pointer-events-auto absolute inset-x-0 bottom-0 flex flex-col gap-1 text-island-foreground", full ? "px-8 pb-6" : "px-4 pb-3")}
          onPointerEnter={() => {
            holding.current = true;
          }}
          onPointerLeave={() => {
            holding.current = false;
            schedule();
          }}
        >
          {/* The title card, while paused full screen (as a TV app shows it). */}
          {full && snap.paused ? (
            <div className="mb-4 flex max-w-2xl flex-col gap-1.5">
              {named.show ? <p className="text-[15px] font-medium text-island-foreground/90">{named.show}</p> : null}
              {named.line || meta.length > 0 ? (
                <p className="tabular text-[13px] text-island-foreground/70">{[named.line, ...meta].filter(Boolean).join(" · ")}</p>
              ) : null}
              <h2 className="font-display text-[clamp(1.75rem,3.4cqw,3rem)] leading-tight font-semibold tracking-[-0.02em] text-balance">{named.title}</h2>
            </div>
          ) : null}
          <VideoScrub
            el={el}
            onToggle={togglePlay}
            onHold={(held) => {
              holding.current = held;
              if (!held) schedule();
            }}
          />
          <TooltipGroup side="top" container={root}>
            <div className="flex items-center gap-1">
              <Tip label={snap.paused ? "Play (k)" : "Pause (k)"} render={<button type="button" aria-label={snap.paused ? "Play" : "Pause"} className={CHROME_BUTTON} onClick={togglePlay} />}>
                {snap.paused ? <Play aria-hidden className="fill-current" /> : <Pause aria-hidden className="fill-current" />}
              </Tip>
              {canStep ? (
                <Tip label="Next (Shift N)" render={<button type="button" aria-label="Next video" className={CHROME_BUTTON} onClick={() => { step(1); }} />}>
                  <SkipForward aria-hidden className="fill-current" />
                </Tip>
              ) : null}
              <VolumeControl
                icon={<VolumeIcon aria-hidden />}
                level={volume.muted ? 0 : volume.level}
                muted={volume.muted}
                onMute={() => {
                  setVolume({ ...volume, muted: !volume.muted });
                }}
                onLevel={(level) => {
                  setVolume({ level, muted: false });
                }}
                onWheelSteps={(steps) => {
                  setVolume(nudgeVolume(videoVolumePref.get(), steps * WHEEL_STEP));
                }}
              />
              <span className="flex-1" />
              {snap.rate !== 1 ? <span className="tabular mr-1 rounded-full bg-island-foreground/12 px-2 py-0.5 text-[11.5px] font-semibold">{snap.rate}×</span> : null}
              {hasList ? (
                <Tip
                  label={railOpen ? "Hide up next" : "Up next"}
                  render={
                    <button
                      type="button"
                      aria-label="Up next"
                      aria-pressed={railOpen}
                      className={CHROME_BUTTON}
                      onClick={() => {
                        setRail(!railOpen);
                      }}
                    />
                  }
                >
                  <GalleryVerticalEnd aria-hidden />
                </Tip>
              ) : null}
              <SubtitlesMenu el={el} container={root} onOpenChange={onMenu} onAddFile={() => subtitleInput.current?.click()} />
              <SettingsMenu
                el={el}
                rate={snap.rate}
                container={root}
                canSaveFrame={canSaveFrame}
                onOpenChange={onMenu}
                onSaveFrame={saveFrame}
                onShortcuts={() => {
                  setHelp(true);
                }}
              />
              <Tip
                label={fit === "contain" ? "Fill the frame" : "Fit the whole picture"}
                render={
                  <button
                    type="button"
                    aria-label={fit === "contain" ? "Fill the frame" : "Fit the whole picture"}
                    aria-pressed={fit === "cover"}
                    // The first to step aside on a narrow player: rarely needed (user 2026-11-08), theatre stays.
                    className={cn(CHROME_BUTTON, "hidden @3xl/cinema:grid")}
                    onClick={() => {
                      fitPref.set(fit === "contain" ? "cover" : "contain");
                    }}
                  />
                }
              >
                {fit === "contain" ? <Expand aria-hidden /> : <Shrink aria-hidden />}
              </Tip>
              {pipOk ? (
                <Tip label="Picture in picture (i)" render={<button type="button" aria-label="Picture in picture" aria-pressed={snap.pip} className={CHROME_BUTTON} onClick={togglePip} />}>
                  <PictureInPicture2 aria-hidden />
                </Tip>
              ) : null}
              {full ? null : (
                <Tip
                  label={theatre ? "Default view (t)" : "Theatre (t)"}
                  render={
                    <button
                      type="button"
                      aria-label="Theatre"
                      aria-pressed={theatre}
                      // Kept on a narrow player (user 2026-11-08): a short window narrows the stage (FILL_STAGE), and that's when theatre helps most.
                      className={cn(CHROME_BUTTON, "hidden @md/cinema:grid")}
                      onClick={() => {
                        usePlayer.getState().setTheatre(!theatre);
                      }}
                    />
                  }
                >
                  <RectangleHorizontal aria-hidden />
                </Tip>
              )}
              <Tip label={full ? "Leave full screen (f)" : "Full screen (f)"} render={<button type="button" aria-label={full ? "Leave full screen" : "Full screen"} className={CHROME_BUTTON} onClick={toggleFullscreen} />}>
                {full ? <Minimize aria-hidden /> : <Maximize aria-hidden />}
              </Tip>
            </div>
          </TooltipGroup>
        </div>

        {railOpen ? (
          <div
            className="contents"
            onPointerEnter={() => {
              holding.current = true;
            }}
            onPointerLeave={() => {
              holding.current = false;
              schedule();
            }}
          >
            <UpNextRail
              items={items}
              current={item}
              liveS={snap.second}
              drum={full}
              container={root}
              onMenu={onMenu}
              onPick={(to) => {
                goTo(to, false);
              }}
              onClose={() => {
                setRail(false);
              }}
            />
          </div>
        ) : null}
      </div>

      {offer ? (
        <NextCard
          key={next.id}
          next={next}
          remainingS={Number.isFinite(snap.duration) ? snap.duration - snap.second : 0}
          ended={snap.ended}
          needsGesture={needsGesture}
          paused={snap.paused && !snap.ended}
          onPlay={() => {
            goTo(next, true);
          }}
          onCancel={() => {
            setDeclined(true);
          }}
        />
      ) : null}

      {help ? (
        <ShortcutsSheet
          onClose={() => {
            setHelp(false);
            root.focus();
          }}
        />
      ) : null}
    </div>
  );
}

function VolumeControl({
  icon,
  level,
  muted,
  onMute,
  onLevel,
  onWheelSteps,
}: {
  icon: React.ReactNode;
  level: number;
  muted: boolean;
  onMute: () => void;
  onLevel: (level: number) => void;
  onWheelSteps: (steps: number) => void;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const wheel = React.useEffectEvent(onWheelSteps);
  // React's onWheel is passive; a native listener can keep the page still.
  React.useEffect(() => {
    const node = ref.current;
    if (!node) return;
    let carry = 0;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();
      const turned = wheelSteps(carry, e.deltaY, e.deltaMode);
      carry = turned.carry;
      if (turned.steps !== 0) wheel(turned.steps);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      node.removeEventListener("wheel", onWheel);
    };
  }, []);
  const pct = `${String(level * 100)}%`;
  return (
    <div ref={ref} className="group/vol flex items-center">
      <Tip label={muted ? "Unmute (m)" : "Mute (m)"} render={<button type="button" aria-label={muted ? "Unmute" : "Mute"} className={CHROME_BUTTON} onClick={onMute} />}>
        {icon}
      </Tip>
      <div className="relative h-6 w-0 overflow-hidden rounded-full transition-[width] duration-200 ease-out-quint group-hover/vol:w-20 group-focus-within/vol:w-20 has-focus-visible:ring-2 has-focus-visible:ring-island-foreground/70 @lg/cinema:w-20">
        <div className="absolute inset-x-1.5 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-island-foreground/25">
          <div className="h-full rounded-full bg-island-foreground" style={{ width: pct }} />
        </div>
        <input
          type="range"
          aria-label="Volume"
          aria-valuetext={muted ? "Muted" : `${String(Math.round(level * 100))}%`}
          min={0}
          max={100}
          step={5}
          value={Math.round(level * 100)}
          onChange={(e) => {
            onLevel(Number(e.currentTarget.value) / 100);
          }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
        />
      </div>
    </div>
  );
}

function ShortcutsSheet({ onClose }: { onClose: () => void }) {
  const close = React.useRef<HTMLButtonElement>(null);
  React.useEffect(() => {
    close.current?.focus();
  }, []);
  return (
    <div className="absolute inset-0 z-40 grid place-items-center bg-island/55 p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-label="Keyboard shortcuts"
        className="flex max-h-full w-full max-w-md flex-col gap-3 overflow-y-auto scroll-fade rounded-card bg-sheet p-5 text-foreground shadow-lift"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onClose();
          }
        }}
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-display text-lg leading-tight tracking-[-0.01em]">Keyboard shortcuts</h3>
          <button ref={close} type="button" aria-label="Close" className="grid size-8 place-items-center rounded-full text-ink-2 outline-none hover:bg-foreground/6 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring" onClick={onClose}>
            <X aria-hidden className="size-4" />
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 text-[13px]">
          {SHORTCUTS.map((s) => (
            <React.Fragment key={s.does}>
              <dt className="flex flex-wrap gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </dt>
              <dd className="text-ink-2">{s.does}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
