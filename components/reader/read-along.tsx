"use client";

import * as React from "react";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, AudioLines, LoaderCircle, Pause, Play, SlidersHorizontal, Square } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useAccount } from "@/components/shell/account";
import { toast } from "@/components/ui/toaster";
import { Tip } from "@/components/ui/tooltip";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { turnFor } from "@/lib/reader/book";
import type { Sentence } from "@/lib/reader/extract";
import { holdsPlace, type Direction } from "@/lib/reader/read-along";
import type { ReaderDoc } from "@/lib/reader/reader";
import { BANNER_SPRING } from "@/lib/motion";
import { primeSpeech, useSpeech } from "@/lib/speech/store";
import { useWindows } from "@/lib/windows/store";
import { cn } from "@/lib/utils";
import { useSpeechError } from "@/components/speech/use-speech-error";
import { BAR_H, ICON_BUTTON } from "./chrome";
import { onForget } from "./doc-cache";
import { ensureText, readText, textOutcome, useTextProgress } from "./text";

// Read-along (T56, V48), shared by the PDF and the Markdown reader. "Play
// from here" reads the document's sentences (text.json, V44) from the first
// one at or after the shown place; the spoken one is highlighted and the view
// follows it. The owner moving the view (wheel, drag, a turn, a navigation
// key) turns follow off while the voice goes on; an arrow pill at the stage's
// edge then points to the spoken sentence, and takes the view back to it.
// While following, the voice's sentence is the reader's place (resume.ts).
//
// Each reader supplies a target: how its view finds, paints, shows and
// places a sentence. Everything about when is here.

export interface ReadAlongTarget {
  /** "Play from here": the first sentence at or after the shown place. */
  startAt(sentences: readonly Sentence[]): number;
  /** Paints the spoken sentence; null clears it. */
  mark(s: Sentence | null): void;
  /** Brings the sentence into view (follow): turns to its page or scrolls to it. */
  bring(s: Sentence, smooth: boolean): void;
  /** Where the sentence is from the view, null when it shows. */
  where(s: Sentence): Direction | null;
  /** Saves the sentence's place as the reader's own (it shows, follow is on); false when it has none yet (not found on the page). */
  save(s: Sentence): boolean;
  /** The first sentence of each chapter after the first (the sleep timer's "end of chapter", V49); empty when there are none. */
  chapters(sentences: readonly Sentence[]): readonly number[] | Promise<readonly number[]>;
}

export interface ReadAlong {
  /** Speech is on this document (playing or paused). */
  active: boolean;
  playing: boolean;
  following: boolean;
  /** Where the pill points, or null: none shows. */
  direction: Direction | null;
  /** Getting the text ready before the first sentence: pages read of all, or `true` when there is no count. */
  preparing: { done: number; total: number } | true | null;
  /** The voice holds the reader's place: speaking this document with follow on (resume.ts). */
  holding: boolean;
  /** Play from here; pause and resume once speaking; a second press while preparing cancels. */
  play: () => void;
  stop: () => void;
  /** Follow on, and back to the spoken sentence (the pill). */
  followOn: () => void;
  /** The owner moved the view with a control (a turn, a page, the contents, find): follow off. */
  turned: () => void;
  /** The view moved (scrolled, turned, laid out again): look where the sentence is. */
  update: () => void;
}

/** Text that keeps the voice's place on screen: menus, panels and the bars aren't the page. */
const NOT_PAGE = "[data-reader-bar], aside, [role=dialog], [role=menu], [role=listbox]";
/** Keys typed here aren't navigation. */
const TYPING = "input, textarea, select, button, a, [contenteditable=true], [role=slider], [role=dialog], [role=menu]";
/** A press that moves this far is a drag. */
const DRAG_PX = 8;
/** Looking again while another tab writes the text. */
const BUSY_RETRY_MS = 2000;
const BUSY_TRIES = 90;

const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "PageUp", "PageDown", "Home", "End", " "]);

/** The sentences last read aloud, so a reader coming back to the speaking document highlights at once (V24). */
let held: { sha256: string; sentences: Sentence[] } | null = null;

onForget((sha256) => {
  if (held?.sha256 === sha256) held = null;
});

export function useReadAlong({
  doc,
  file,
  stage,
  book,
  viewKey,
  target,
}: {
  doc: ReaderDoc;
  file: File;
  stage: HTMLElement | null;
  /** Book or scroll: which keys turn. */
  book: boolean;
  /** Changes when the view is made again (a switch, a resume, new text): the sentence is painted again. */
  viewKey: string;
  target: ReadAlongTarget;
}): ReadAlong {
  const demo = useAccount().kind !== "owner";
  const sha256 = doc.sha256;
  const active = useSpeech((s) => s.status !== "idle" && s.source?.kind === "doc" && s.source.id === sha256);
  const status = useSpeech((s) => s.status);
  const playing = status === "playing";
  const index = useSpeech((s) => s.sentence);
  const reducedMotion = useReducedMotion();
  const [sentences, setSentences] = React.useState<Sentence[] | null>(() => (held?.sha256 === sha256 ? held.sentences : null));
  const [following, setFollowing] = React.useState(true);
  const [direction, setDirection] = React.useState<Direction | null>(null);
  const [preparing, setPreparing] = React.useState(false);
  const progress = useTextProgress((s) => s[sha256]);

  const live = React.useRef({ target, active, following, index, sentences, reducedMotion });
  React.useLayoutEffect(() => {
    live.current = { target, active, following, index, sentences, reducedMotion };
  });

  // Back on a document that's being read aloud (apps stay alive, V24): its sentences, to follow along.
  React.useEffect(() => {
    if (!active || sentences) return;
    let on = true;
    void readText(sha256, demo).then((t) => {
      if (!on || !t) return;
      held = { sha256, sentences: t.sentences };
      setSentences(t.sentences);
    });
    return () => {
      on = false;
    };
  }, [active, sentences, sha256, demo]);

  // ── Where the sentence is, and its place ──
  const savedFor = React.useRef(-1);
  const raf = React.useRef(0);
  const look = React.useCallback(() => {
    const { active: on, sentences: list, index: i, following: f, target: t } = live.current;
    const s = on ? list?.[i] : undefined;
    if (!s) {
      setDirection(null);
      return;
    }
    const dir = t.where(s);
    if (f) {
      // It shows: the voice's sentence is the reader's place now (V48).
      if (dir === null && savedFor.current !== i && t.save(s)) savedFor.current = i;
      setDirection(null);
    } else setDirection(dir);
  }, []);
  const update = React.useCallback(() => {
    if (raf.current) return;
    raf.current = requestAnimationFrame(() => {
      raf.current = 0;
      look();
    });
  }, [look]);
  React.useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
    },
    [],
  );

  // The spoken sentence: painted, followed, placed.
  React.useEffect(() => {
    const s = active ? sentences?.[index] : undefined;
    const t = live.current.target;
    t.mark(s ?? null);
    if (!s) return;
    if (live.current.following) t.bring(s, !live.current.reducedMotion);
    update();
  }, [active, index, sentences, viewKey, update]);

  // Gone from the reader: nothing stays painted (find's own marks are the reader's).
  React.useEffect(
    () => () => {
      live.current.target.mark(null);
    },
    [],
  );

  // Any scroll on the stage (the view's own, follow's, the owner's) and a resize: look again.
  React.useEffect(() => {
    if (!stage || !active) return;
    const opts = { capture: true, passive: true };
    stage.addEventListener("scroll", update, opts);
    window.addEventListener("resize", update);
    return () => {
      stage.removeEventListener("scroll", update, opts);
      window.removeEventListener("resize", update);
    };
  }, [stage, active, update]);

  const followOff = React.useCallback(() => {
    if (!live.current.active || !live.current.following) return;
    live.current.following = false;
    setFollowing(false);
    update();
  }, [update]);

  // ── Follow off: the owner moves the view (V48) ──
  // Not a press on a bar or a button: only wheel, a drag on the page, and navigation keys. Turns made with
  // the bars' controls come in by turned().
  React.useEffect(() => {
    if (!stage || !active || !following) return;
    const onPage = (e: Event) => !(e.target instanceof Element && e.target.closest(NOT_PAGE));
    let down: { x: number; y: number } | null = null;
    const onWheel = (e: WheelEvent) => {
      if (onPage(e)) followOff();
    };
    const onTouch = (e: TouchEvent) => {
      if (onPage(e)) followOff();
    };
    const onDown = (e: PointerEvent) => {
      // A press on a scrollbar: the owner scrolls (it fires no pointermove).
      const el = e.target;
      if (onPage(e) && el instanceof HTMLElement && el.scrollHeight > el.clientHeight && (e.offsetX >= el.clientWidth || e.offsetY >= el.clientHeight)) {
        down = null;
        followOff();
        return;
      }
      down = onPage(e) && !(e.target instanceof Element && e.target.closest("button, a, input")) ? { x: e.clientX, y: e.clientY } : null;
    };
    const onMove = (e: PointerEvent) => {
      if (!down || e.buttons === 0) {
        down = null;
        return;
      }
      if (Math.hypot(e.clientX - down.x, e.clientY - down.y) >= DRAG_PX) {
        down = null;
        followOff();
      }
    };
    const onUp = () => {
      down = null;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.target instanceof Element && e.target.closest(TYPING)) return;
      const nav = book ? turnFor(e.key, e.shiftKey, true) !== null : SCROLL_KEYS.has(e.key);
      if (nav) followOff();
    };
    const opts = { capture: true, passive: true };
    stage.addEventListener("wheel", onWheel, opts);
    stage.addEventListener("touchmove", onTouch, opts);
    stage.addEventListener("pointerdown", onDown, opts);
    stage.addEventListener("pointermove", onMove, opts);
    window.addEventListener("pointerup", onUp, opts);
    window.addEventListener("keydown", onKey, { capture: true });
    return () => {
      stage.removeEventListener("wheel", onWheel, opts);
      stage.removeEventListener("touchmove", onTouch, opts);
      stage.removeEventListener("pointerdown", onDown, opts);
      stage.removeEventListener("pointermove", onMove, opts);
      window.removeEventListener("pointerup", onUp, opts);
      window.removeEventListener("keydown", onKey, { capture: true });
    };
  }, [stage, active, following, book, followOff]);

  const followOn = React.useCallback(() => {
    const { sentences: list, index: i, active: on, target: t, reducedMotion: r } = live.current;
    if (!on) return;
    live.current.following = true;
    setFollowing(true);
    setDirection(null);
    savedFor.current = -1;
    const s = list?.[i];
    if (s) t.bring(s, !r);
    update();
  }, [update]);

  // The engine's own failures (no voice) say so.
  useSpeechError("doc", sha256);

  // ── Play ──
  const prep = React.useRef(0);
  React.useEffect(
    () => () => {
      prep.current++;
    },
    [],
  );

  const play = () => {
    // In the press's own turn: the audio may start only after the text is ready.
    primeSpeech();
    const speech = useSpeech.getState();
    if (active) {
      speech.toggle();
      return;
    }
    if (preparing) {
      prep.current++;
      setPreparing(false);
      return;
    }
    const gen = ++prep.current;
    setPreparing(true);
    void (async () => {
      let text = null;
      for (let tries = 0; tries < BUSY_TRIES; tries++) {
        // Starts now if the 3 s wait after the open hasn't run yet (V48); shares the job if it has.
        await ensureText(doc, file, demo);
        text = await readText(sha256, demo);
        if (gen !== prep.current) return;
        if (text || textOutcome(sha256) !== "busy") break;
        await new Promise((r) => setTimeout(r, BUSY_RETRY_MS));
        if (gen !== prep.current) return;
      }
      setPreparing(false);
      if (!text) {
        toast({
          title: "Read aloud",
          body: textOutcome(sha256) === "busy" ? "Another tab is still getting this document's text ready." : "This document's text couldn't be read.",
          id: `speech:doc:${sha256}`,
        });
        return;
      }
      const list = text.sentences;
      if (list.length === 0) {
        toast({ id: `speech:doc:${sha256}`, title: "Read aloud", body: "This document has no text to read. A scanned PDF holds only pictures of its pages." });
        return;
      }
      held = { sha256, sentences: list };
      setSentences(list);
      live.current.following = true;
      setFollowing(true);
      savedFor.current = -1;
      const from = live.current.target.startAt(list);
      useSpeech.getState().play(
        { kind: "doc", id: sha256, title: doc.title, href: `/reader?d=${encodeURIComponent(doc.id)}` },
        list.map((s) => s.text),
        from,
      );
      // Found after the voice starts: only the sleep timer's "end of chapter" needs them.
      void Promise.resolve(live.current.target.chapters(list))
        .then((starts) => {
          useSpeech.getState().setChapters(sha256, starts);
        })
        .catch(() => undefined);
    })();
  };

  const stop = () => {
    prep.current++;
    setPreparing(false);
    if (active) useSpeech.getState().stop();
  };

  return {
    active,
    playing,
    following,
    direction: active && !following ? direction : null,
    holding: active && holdsPlace(status, following),
    preparing: preparing ? (progress ?? true) : null,
    play,
    stop,
    followOn,
    turned: followOff,
    update,
  };
}

// ── The controls ─────────────────────────────────────────────────────────

/** The reader bar's read-aloud controls: play from here, then pause or play and stop. */
export function ReadAloudControls({ ra }: { ra: ReadAlong }) {
  if (ra.preparing) {
    const p = ra.preparing;
    const pct = p === true || p.total === 0 ? null : Math.floor((p.done / p.total) * 100);
    return (
      <button
        type="button"
        onClick={ra.play}
        aria-label={`Getting the text ready${pct === null ? "" : `, ${String(pct)}%`}. Cancel`}
        className="flex h-9 shrink-0 items-center gap-1.5 rounded-pill bg-stage-ink/8 px-3 text-stage-ink/80 outline-none transition-colors hover:bg-stage-ink/12 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <LoaderCircle aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
        <span className="hidden text-[12.5px] sm:inline">Getting text</span>
        {pct !== null ? <span className="tabular font-mono text-[11.5px] text-stage-ink/60">{pct}%</span> : null}
      </button>
    );
  }
  if (!ra.active) {
    return (
      <Tip label="Read aloud from here" aria-label="Read aloud from here" onClick={ra.play} className={ICON_BUTTON}>
        <AudioLines aria-hidden />
      </Tip>
    );
  }
  return (
    <span className="flex shrink-0 items-center gap-0.5 rounded-pill bg-signal/14 text-signal-ink dark:text-signal">
      <Tip label={ra.playing ? "Pause reading" : "Resume reading"} aria-label={ra.playing ? "Pause reading" : "Resume reading"} onClick={ra.play} className={cn(ICON_BUTTON, "text-current hover:text-current")}>
        {ra.playing ? <Pause aria-hidden /> : <Play aria-hidden />}
      </Tip>
      <Tip label="Stop reading" aria-label="Stop reading" onClick={ra.stop} className={cn(ICON_BUTTON, "text-current hover:text-current")}>
        <Square aria-hidden />
      </Tip>
      <Tip
        label="Speed, voice and sleep timer"
        aria-label="Read-aloud controls: speed, voice and sleep timer"
        onClick={() => {
          useWindows.getState().openWindow("reader.speech");
        }}
        className={cn(ICON_BUTTON, "text-current hover:text-current")}
      >
        <SlidersHorizontal aria-hidden />
      </Tip>
    </span>
  );
}

const ARROWS = { up: ArrowUp, down: ArrowDown, left: ArrowLeft, right: ArrowRight } as const;

/** Where the pill sits for each direction: at the stage edge the sentence is past. */
const SPOT = {
  up: { top: BAR_H + 12, left: "50%", translate: "-50% 0" },
  down: { bottom: BAR_H + 12, left: "50%", translate: "-50% 0" },
  left: { left: 12, top: "50%", translate: "0 -50%" },
  right: { right: 12, top: "50%", translate: "0 -50%" },
} as const satisfies Record<Direction, object>;

const OFFSET: Record<Direction, { x?: number; y?: number }> = { up: { y: -8 }, down: { y: 8 }, left: { x: -8 }, right: { x: 8 } };

/** The arrow pill (V48): follow is off and the spoken sentence is out of view. Click or Enter: follow on, back to it. */
export function FollowPill({ ra }: { ra: ReadAlong }) {
  const dir = ra.direction;
  return (
    <AnimatePresence>
      {dir ? (
        <motion.button
          key={dir}
          type="button"
          onClick={ra.followOn}
          aria-label="Back to the voice: follow the sentence being read"
          initial={{ opacity: 0, ...OFFSET[dir] }}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={{ opacity: 0 }}
          transition={BANNER_SPRING}
          style={SPOT[dir]}
          className="absolute z-20 flex h-9 items-center gap-1.5 rounded-pill bg-signal pr-3.5 pl-3 text-[12.5px] font-medium text-stage shadow-[0_8px_24px_-10px] shadow-stage outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {React.createElement(ARROWS[dir], { "aria-hidden": true, className: "size-4" })}
          Back to the voice
        </motion.button>
      ) : null}
    </AnimatePresence>
  );
}
