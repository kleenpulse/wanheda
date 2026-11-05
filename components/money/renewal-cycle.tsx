"use client";

import * as React from "react";
import { Pin } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAnimationLoop, type Metrics } from "@/hooks/use-animation-loop";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { CategoryColor } from "@/lib/money/categories";
import type { Currency } from "@/lib/money/currency";
import { addDays, daysBetween, shortDayLabel, type Day } from "@/lib/money/dates";
import { byMonthlyCost, cycleLabel, dueLabel, renewalsAround, type Subscription } from "@/lib/money/subscriptions";
import { paint, resolveColors, type Rgb } from "@/lib/prefs/wallpaper-palette";
import { cn } from "@/lib/utils";
import { categoryBg, MoneyText } from "./money-text";

// Where each active subscription is in its billing cycle, today. One
// subscription: the card is a liquid tank (ported from deep-ellum LiquidProgress)
// that rises to the cycle share on arrival, its surface rolling on two sine
// waves, the share in the middle, the words split black and white along it. The
// loop halts off screen and in a hidden tab (V17). Several: one ring each, the
// most expensive outside, filling in once on arrival and then still. Colours
// come from the skin's tokens at runtime (tank: the signal hue as a duo-tone;
// rings: the data palette by rank), never a colour in the source. Amounts stay
// in <MoneyText> (V25). Reduced motion draws everything in place.

const MAX_RINGS = 8;
const RING_COLORS: readonly CategoryColor[] = ["blue", "aqua", "yellow", "magenta", "green", "violet", "red", "cyan"];
const TOKENS = [...RING_COLORS.map((c) => `var(--cat-${c})`), "var(--foreground)", "var(--signal)", "var(--sheet)"];
const INTRO_S = 1.1;
const STAGGER_S = 0.08;

interface Cycle {
  sub: Subscription;
  /** The renewal that opened the current cycle, and the one that closes it. */
  from: Day;
  next: Day;
  /** 0..1 through the cycle today: a display ratio, never money (V25). */
  progress: number;
}

/** The cycle that ends on the next renewal: on renewal day it is full and due "Today", like the rest of the page. */
function cycleOf(sub: Subscription, today: Day): Cycle {
  const yesterday = addDays(today, -1);
  const [from = today, next = today] = renewalsAround(sub, yesterday, yesterday);
  const length = Math.max(1, daysBetween(from, next));
  return { sub, from, next, progress: Math.min(1, Math.max(0, daysBetween(from, today) / length)) };
}

/** The card: the liquid tank for one active subscription, rings for several, nothing for none. */
export function RenewalCycle({ subscriptions, today, base }: { subscriptions: readonly Subscription[]; today: Day; base: Currency }) {
  const cycles = React.useMemo(
    () =>
      byMonthlyCost(subscriptions, base)
        .slice(0, MAX_RINGS)
        .map((s) => cycleOf(s, today)),
    [subscriptions, base, today],
  );
  const [only] = cycles;
  if (!only) return null;
  if (cycles.length === 1) return <LiquidCard cycle={only} today={today} />;
  return (
    <section aria-labelledby="subs-cycle" className="bento flex min-w-0 flex-col gap-4 p-5">
      <header className="flex items-center justify-between gap-3">
        <h2 id="subs-cycle" className="font-display text-[17px] leading-tight text-foreground">
          Billing cycle
        </h2>
        <span className="readout tabular">{cycles.length} active</span>
      </header>
      <Rings cycles={cycles} today={today} />
    </section>
  );
}

const PIN_KEY = "wanheda-home-cycle";
const pinListeners = new Set<() => void>();

function readPin(): string | null {
  try {
    return localStorage.getItem(PIN_KEY);
  } catch {
    return null;
  }
}

function subscribePin(listener: () => void) {
  pinListeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === PIN_KEY) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    pinListeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

function writePin(id: string) {
  try {
    localStorage.setItem(PIN_KEY, id);
  } catch {
    // Private mode: the pick lasts until the page reloads.
  }
  for (const l of pinListeners) l();
}

/**
 * Home's billing cycle (user 2026-11-05): the liquid card for one active
 * subscription. With several, the owner pins the one to show (this device;
 * the most expensive first until they pick), from a picker on the card.
 * Null when nothing is active.
 */
export function PinnedCycle({ subscriptions, today, base }: { subscriptions: readonly Subscription[]; today: Day; base: Currency }) {
  const active = React.useMemo(() => byMonthlyCost(subscriptions, base), [subscriptions, base]);
  const pinned = React.useSyncExternalStore(subscribePin, readPin, () => null);
  const headingId = React.useId();
  const sub = active.find((s) => s.id === pinned) ?? active[0];
  if (!sub) return null;
  const controls =
    active.length > 1 ? (
      <Select
        items={active.map((s) => ({ value: s.id, label: s.name }))}
        value={sub.id}
        onValueChange={(v) => {
          if (v) writePin(v);
        }}
      >
        <SelectTrigger aria-label="Subscription shown on Home" className="h-7 max-w-36 rounded-pill bg-inverse pr-2 pl-3 text-[12px] text-inverse-foreground shadow-sm ring-0 hover:bg-inverse dark:bg-inverse dark:hover:bg-inverse">
          <Pin aria-hidden className="size-3 shrink-0 text-signal" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent align="end">
          {active.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    ) : undefined;
  return <LiquidCard cycle={cycleOf(sub, today)} today={today} headingId={headingId} fill controls={controls} />;
}

/** Linear mix of two colours, t of the way from a to b. */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/** Whether the element is on screen: the waves only roll while it is. */
function useOnScreen(ref: React.RefObject<HTMLElement | null>): boolean {
  const [on, setOn] = React.useState(true);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry) setOn(entry.isIntersecting);
    });
    io.observe(el);
    return () => {
      io.disconnect();
    };
  }, [ref]);
  return on;
}

/**
 * The card's words, uncoloured: each copy takes its colour from its wrapper.
 * Only the first copy carries the heading id and is read out.
 */
function LiquidFace({
  cycle,
  today,
  className,
  copy,
  headingId,
  fill,
  hideCycle,
}: {
  cycle: Cycle;
  today: Day;
  className: string;
  copy: boolean;
  headingId: string;
  fill: boolean;
  /** Controls sit where the cycle label would (Home's pin picker). */
  hideCycle: boolean;
}) {
  const { sub, from, next, progress } = cycle;
  const used = daysBetween(from, today);
  const length = daysBetween(from, next);
  return (
    <div aria-hidden={copy || undefined} className={cn("flex flex-col gap-3 p-5", fill && "h-full", className)}>
      <header className="flex min-h-7 items-center justify-between gap-3">
        <h2 id={copy ? undefined : headingId} className="font-display text-[17px] leading-tight">
          Billing cycle
        </h2>
        {hideCycle ? null : <span className="tabular [font-family:var(--font-label)] text-[11px] tracking-[0.06em] uppercase">{cycleLabel(sub)}</span>}
      </header>
      <div className="flex items-center justify-between gap-3">
        <span className="min-w-0 truncate text-[14px] font-medium">{sub.name}</span>
        <span className="tabular shrink-0 text-[13px] font-semibold">
          <span className="font-figure">
            {used} / {length}
          </span>{" "}
          days
        </span>
      </div>
      <div className={cn("grid place-items-center py-5", fill && "flex-1")}>
        {/* Home's widget has the room: the figure goes bigger there (user 2026-11-05). */}
        <span className={cn("tabular font-figure leading-none font-extrabold tracking-[-0.04em]", fill ? "text-[112px]" : "text-[76px]")}>
          {Math.round(progress * 100)}
          <span className={fill ? "text-[52px]" : "text-[36px]"}>%</span>
        </span>
      </div>
      <div className="flex items-baseline justify-between gap-3 text-[12.5px]">
        <span className="tabular">Renewed {shortDayLabel(from)}</span>
        <span className="tabular flex items-baseline gap-1.5">
          <span className={cn(daysBetween(today, next) <= sub.remindDays && "font-semibold")}>{dueLabel(next, today)}</span>
          <span aria-hidden>·</span>
          <MoneyText value={{ minor: sub.amountMinor, currency: sub.currency }} className="font-medium" />
        </span>
      </div>
    </div>
  );
}

/**
 * One subscription: the card is the tank (ported from deep-ellum's
 * LiquidProgress). The liquid rises from the card's foot to the cycle's share
 * on arrival and its surface rolls on two sine waves. The words split black
 * and white along the moving surface, per pixel, as in caishen_landing's
 * hero: one solid copy in ink, and one in the ink that reads on the liquid,
 * clipped every frame to the same wave path the canvas fills. (Caishen's six
 * blend layers fringe small text blue at the anti-aliased edges; the clip
 * gives the same split in pure colours at any size.) A duo-tone: the signal
 * hue over its soft tint.
 */
function LiquidCard({
  cycle,
  today,
  headingId = "subs-cycle",
  fill = false,
  controls,
}: {
  cycle: Cycle;
  today: Day;
  headingId?: string;
  /** Fill the parent's height (a Home widget). */
  fill?: boolean;
  /** Drawn above both copies of the words, at the header's right. */
  controls?: React.ReactNode;
}) {
  const reduced = useReducedMotion();
  const colors = useCanvasColors();
  const { sub, from, next, progress } = cycle;
  const used = daysBetween(from, today);
  const length = daysBetween(from, next);

  const containerRef = React.useRef<HTMLElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const metrics = React.useRef<Metrics | null>(null);
  /** The copy of the words in the on-liquid colour, clipped to the liquid each frame. */
  const wetRef = React.useRef<HTMLDivElement>(null);
  const onScreen = useOnScreen(containerRef);
  const state = React.useRef({ level: 0, phase: 0 });
  const live = React.useRef({ progress, colors, reduced });
  React.useLayoutEffect(() => {
    live.current = { progress, colors, reduced };
  });

  const draw = (dt: number) => {
    const ctx = canvasRef.current?.getContext("2d");
    const m = metrics.current;
    const { progress: target, colors: c, reduced: still } = live.current;
    if (!ctx || !m || !c) return;
    const st = state.current;
    // Rises toward the share (about 0.08 a frame at 60 fps), and the surface rolls.
    st.level = still ? target : st.level + (target - st.level) * (1 - Math.exp(-dt * 4.8));
    if (!still) st.phase += dt * 1.8;

    const { width: w, height: h, dpr } = m;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const wave = Math.min(12, Math.max(6, h * 0.05));
    const fillY = h * (1 - Math.max(0, Math.min(1, st.level)));
    // The signal as a duo-tone, lighter at the top-left, deeper at the bottom-right.
    // Light themes deepen it so white words on it reach 4.5:1; dark themes
    // lighten it so the dark inverse ink does.
    const light = c.dark ? mix(c.signal, c.ink, 0.3) : mix(c.signal, c.ink, 0.2);
    const deep = c.dark ? c.signal : mix(c.signal, c.ink, 0.4);
    const body = ctx.createLinearGradient(0, 0, w, h);
    body.addColorStop(0, paint(light));
    body.addColorStop(1, paint(deep));
    ctx.fillStyle = body;
    const surface = (x: number) => fillY + Math.sin(x * 0.02 + st.phase) * wave * 0.35 + Math.sin(x * 0.035 + st.phase * 1.3) * wave * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, surface(0));
    for (let x = 4; x <= w + 4; x += 4) ctx.lineTo(x, surface(x));
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();

    // The same surface clips the on-liquid copy of the words (CSS px, same box as the canvas).
    const wet = wetRef.current;
    if (wet) {
      let d = `M0 ${surface(0).toFixed(1)}`;
      for (let x = 4; x <= w + 4; x += 4) d += ` L${String(x)} ${surface(x).toFixed(1)}`;
      wet.style.clipPath = `path("${d} L${String(w)} ${String(h)} L0 ${String(h)} Z")`;
    }

    const shine = c.dark ? c.ink : c.sheet;
    const gloss = ctx.createLinearGradient(0, 0, 0, h);
    gloss.addColorStop(0, paint(shine, 0.12));
    gloss.addColorStop(0.35, paint(shine, 0.06));
    gloss.addColorStop(1, paint(shine, 0));
    ctx.fillStyle = gloss;
    ctx.fillRect(0, 0, w, h);
  };
  const drawRef = React.useRef(draw);
  React.useLayoutEffect(() => {
    drawRef.current = draw;
  });

  const loop = useAnimationLoop({
    target: containerRef,
    // Rolls only on screen and with motion allowed; otherwise one frame per change.
    halted: reduced || !onScreen,
    onResize: (m) => {
      metrics.current = m;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = m.bufferWidth;
      canvas.height = m.bufferHeight;
    },
    onFrame: ({ dt }) => {
      drawRef.current(dt);
    },
  });

  React.useEffect(() => {
    loop.paint();
  }, [progress, colors, reduced, loop]);

  return (
    <section
      ref={containerRef}
      aria-labelledby={headingId}
      className={cn("relative isolate min-w-0 overflow-hidden rounded-card bg-signal-soft shadow-(--shadow-card)", fill && "h-full")}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 -z-10 size-full" />
      <div
        role="progressbar"
        aria-label={`${sub.name}: day ${String(used)} of ${String(length)} in this cycle`}
        aria-valuemin={0}
        aria-valuemax={length}
        aria-valuenow={used}
        className="sr-only"
      />
      {/* The box fills the card (no padding on the section), so the clip's px match the canvas's. */}
      <div className={cn("relative", fill && "h-full")}>
        <LiquidFace cycle={cycle} today={today} copy={false} className="text-foreground" headingId={headingId} fill={fill} hideCycle={controls !== undefined} />
        <div ref={wetRef} aria-hidden className="absolute inset-0 text-inverse-foreground" style={{ clipPath: "inset(100% 0 0 0)" }}>
          <LiquidFace cycle={cycle} today={today} copy className="" headingId={headingId} fill={fill} hideCycle={controls !== undefined} />
        </div>
      </div>
      {controls ? <div className="absolute top-4 right-4 z-10">{controls}</div> : null}
    </section>
  );
}

interface Colors {
  rings: Rgb[];
  ink: Rgb;
  signal: Rgb;
  sheet: Rgb;
  dark: boolean;
}

/** The skin's colours for the canvas, re-read when the skin, theme or accent changes on <html>. */
function useCanvasColors(): Colors | null {
  const [colors, setColors] = React.useState<Colors | null>(null);
  React.useEffect(() => {
    const root = document.documentElement;
    const read = () => {
      const all = resolveColors(TOKENS);
      const n = RING_COLORS.length;
      const grey: Rgb = [128, 128, 128];
      setColors({
        rings: all.slice(0, n),
        ink: all[n] ?? grey,
        signal: all[n + 1] ?? grey,
        sheet: all[n + 2] ?? grey,
        dark: root.classList.contains("dark"),
      });
    };
    read();
    const observer = new MutationObserver(read);
    observer.observe(root, { attributes: true, attributeFilter: ["class", "style", "data-skin", "data-accent"] });
    return () => {
      observer.disconnect();
    };
  }, []);
  return colors;
}

const easeOut = (x: number) => 1 - (1 - x) ** 5;

function Rings({ cycles, today }: { cycles: readonly Cycle[]; today: Day }) {
  const reduced = useReducedMotion();
  const colors = useCanvasColors();
  const containerRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const metrics = React.useRef<Metrics | null>(null);
  /** When the fill-in started; null until the first frame with colours. */
  const introAt = React.useRef<number | null>(null);
  const live = React.useRef({ cycles, colors, reduced });
  React.useLayoutEffect(() => {
    live.current = { cycles, colors, reduced };
  });

  /** Draws one frame; true while the fill-in is still running. */
  const draw = (now: number): boolean => {
    const ctx = canvasRef.current?.getContext("2d");
    const m = metrics.current;
    const { cycles: cs, colors: c, reduced: still } = live.current;
    if (!ctx || !m || !c) return false;
    introAt.current ??= now;
    const t = still ? Infinity : (now - introAt.current) / 1000;

    const { width: w, height: h, dpr } = m;
    const cx = w / 2;
    const cy = h / 2;
    const outer = Math.min(w, h) / 2 - 6;
    const inner = outer * 0.5;
    const step = (outer - inner) / cs.length;
    const thick = Math.max(3, Math.min(10, step * 0.58));
    const top = -Math.PI / 2;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    cs.forEach((cycle, i) => {
      const r = outer - step * i - step / 2;
      const col = c.rings[i % RING_COLORS.length] ?? c.ink;
      const p = cycle.progress * easeOut(Math.min(1, Math.max(0, (t - i * STAGGER_S) / INTRO_S)));
      const head = top + p * Math.PI * 2;

      ctx.lineCap = "round";
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = paint(c.ink, c.dark ? 0.07 : 0.06);
      ctx.stroke();

      if (p > 0.002) {
        // A comet: faint where the cycle began, full at today.
        const conic = typeof ctx.createConicGradient === "function" ? ctx.createConicGradient(top, cx, cy) : null;
        conic?.addColorStop(0, paint(col, 0.15));
        conic?.addColorStop(Math.max(0.0001, p), paint(col, 1));
        ctx.beginPath();
        ctx.arc(cx, cy, r, top, head);
        ctx.strokeStyle = conic ?? paint(col, 0.9);
        ctx.stroke();
      }

      ctx.save();
      ctx.shadowColor = paint(col, 0.8);
      ctx.shadowBlur = still ? 0 : 10;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(head) * r, cy + Math.sin(head) * r, thick * 0.72, 0, Math.PI * 2);
      ctx.fillStyle = paint(col, 1);
      ctx.fill();
      ctx.restore();
    });

    return t < INTRO_S + cs.length * STAGGER_S;
  };
  const drawRef = React.useRef(draw);
  React.useLayoutEffect(() => {
    drawRef.current = draw;
  });

  const loop = useAnimationLoop({
    target: containerRef,
    onResize: (m) => {
      metrics.current = m;
      const canvas = canvasRef.current;
      if (!canvas) return;
      canvas.width = m.bufferWidth;
      canvas.height = m.bufferHeight;
    },
    // Runs only through the fill-in; after that a change repaints one frame.
    onFrame: ({ now }) => (drawRef.current(now) ? undefined : false),
  });

  React.useEffect(() => {
    loop.paint();
  }, [cycles, colors, reduced, loop]);

  const soonest = [...cycles].sort((a, b) => (a.next < b.next ? -1 : a.next > b.next ? 1 : 0))[0];

  return (
    <>
      <div ref={containerRef} className="relative mx-auto aspect-square w-full max-w-[300px]">
        <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" />
        {soonest ? (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <div className="flex max-w-[44%] flex-col items-center gap-0.5 text-center">
              <span className="readout">Next</span>
              <span className="w-full truncate font-display text-[17px] leading-tight font-semibold text-foreground">{soonest.sub.name}</span>
              <span className="tabular text-[12px] text-ink-2">{dueLabel(soonest.next, today)}</span>
            </div>
          </div>
        ) : null}
      </div>
      <ul className="flex flex-col gap-1.5" aria-label="Rings, outside in">
        {cycles.map((c, i) => (
          <li key={c.sub.id} className="flex items-center gap-2.5 text-[12.5px]">
            <span aria-hidden className={cn("size-2 shrink-0 rounded-full", categoryBg(RING_COLORS[i % RING_COLORS.length] ?? "blue"))} />
            <span className="min-w-0 flex-1 truncate text-foreground">{c.sub.name}</span>
            <span className="tabular shrink-0 text-ink-2">
              <span className="sr-only">{Math.round(c.progress * 100)}% through its cycle, renews </span>
              {dueLabel(c.next, today)}
            </span>
            <MoneyText value={{ minor: c.sub.amountMinor, currency: c.sub.currency }} className="w-16 shrink-0 text-right text-ink-2" />
          </li>
        ))}
      </ul>
    </>
  );
}
