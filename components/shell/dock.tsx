"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "motion/react";
import { Search } from "lucide-react";
import { useMusicPlayer } from "@/components/media/music-player";
import { usePalette } from "@/components/shell/palette-store";
import { Kbd } from "@/components/ui/kbd";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { useActivity } from "@/lib/activity/store";
import { useSpeech } from "@/lib/speech/store";
import { MODULES, TOOLS, isActive, type ActivityKind } from "@/lib/modules";
import { DOCK_SPRING } from "@/lib/motion";
import { dockEntries, type DockEntry } from "@/lib/shell/dock";
import { AppIcon } from "@/components/shell/app-icon";
import { cn } from "@/lib/utils";
import { useWindows } from "@/lib/windows/store";

/*
  The dock (FR-SHELL-4), ported from Shadow Garden's magnetic-dock: one
  motion value holds the pointer's x, and each item sizes itself from its
  distance to it, so the row swells as one surface with no re-render while
  the pointer moves. Focus writes the same value, so the keyboard magnifies
  identically. Pinned apps, then tools; a dot marks what's running. The
  palette's search pill sits at the end. Desktop only: phones have the tab bar.
*/

const BASE = 40;
const MAGNIFY = 1.5;
const FALLOFF = 120;
/** Nothing under the pointer: every item rests. */
const AWAY = Number.POSITIVE_INFINITY;

const MotionLink = motion.create(Link);

function useMod() {
  return React.useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl"),
    () => "Ctrl",
  );
}

export function Dock() {
  const pathname = usePathname();
  const hasTimers = useActivity((s) => s.timers.length > 0);
  const speaking = useSpeech((s) => s.status !== "idle");
  const music = useMusicPlayer((s) => s.status !== "idle");
  const open = useWindows((s) => s.open);
  const openWindow = useWindows((s) => s.openWindow);
  const setPalette = usePalette((s) => s.setOpen);
  const reduced = useReducedMotion();
  const mod = useMod();
  const cursor = useMotionValue(AWAY);

  // Timers from the bus, speech from the speech store, music from the player.
  const { apps, tools } = React.useMemo(() => {
    const live = new Set<ActivityKind>([...(hasTimers ? (["timer"] as const) : []), ...(speaking ? (["speech"] as const) : []), ...(music ? (["media"] as const) : [])]);
    return dockEntries(MODULES, TOOLS, { live, open: new Set(open) });
  }, [hasTimers, speaking, music, open]);

  return (
    <nav
      aria-label="Dock"
      onPointerMove={(e) => {
        if (e.pointerType === "mouse") cursor.set(e.clientX);
      }}
      onPointerLeave={() => {
        cursor.set(AWAY);
      }}
      onBlur={(e) => {
        // Only when focus leaves the dock: tabbing between items blurs one before focusing the next.
        if (!e.currentTarget.contains(e.relatedTarget)) cursor.set(AWAY);
      }}
      className="glass fixed bottom-5 left-[calc(50%+var(--rail-w)/2)] z-30 hidden h-14 -translate-x-1/2 items-end gap-2 rounded-[22px] px-2 pb-2 shadow-dock md:flex dark:border-rail-border"
    >
      {apps.map((e) => (
        <DockItem
          key={e.id}
          entry={e}
          cursor={cursor}
          reduced={reduced}
          current={e.target.kind === "route" && isActive(pathname, e.target.route)}
        />
      ))}
      {tools.length > 0 && <Divider />}
      {tools.map((e) => (
        <DockItem
          key={e.id}
          entry={e}
          cursor={cursor}
          reduced={reduced}
          current={false}
          onSelect={() => {
            if (e.target.kind === "window") openWindow(e.target.window);
          }}
        />
      ))}
      <Divider />
      <button
        type="button"
        title="Search or start a timer"
        onClick={() => {
          setPalette(true);
        }}
        className="inline-flex h-10 items-center gap-2 rounded-full px-3.5 text-sm text-foreground outline-none hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring dark:hover:bg-accent"
      >
        <Search className="size-4 text-signal-ink dark:text-signal" strokeWidth={2} aria-hidden />
        Search
        <Kbd>{mod}+K</Kbd>
      </button>
    </nav>
  );
}

function Divider() {
  return <span aria-hidden className="mb-1 h-8 w-px shrink-0 self-end bg-border" />;
}

function DockItem({
  entry,
  cursor,
  reduced,
  current,
  onSelect,
}: {
  entry: DockEntry;
  cursor: MotionValue<number>;
  reduced: boolean;
  current: boolean;
  onSelect?: () => void;
}) {
  const ref = React.useRef<HTMLElement>(null);

  // Read the rect live: the items are resizing, so a cached centre is stale
  // the moment the swell starts. Before layout there is no rect: rest.
  const offset = useTransform(cursor, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    return rect ? value - (rect.x + rect.width / 2) : AWAY;
  });
  const target = useTransform(offset, [-FALLOFF, 0, FALLOFF], [BASE, BASE * MAGNIFY, BASE], { clamp: true });
  const springed = useSpring(target, DOCK_SPRING);
  // Reduced motion keeps the swell (it says which item you're on) and drops the travel.
  const size = reduced ? target : springed;
  const glyph = useTransform(size, (v) => v * 0.45);
  const label = useTransform(offset, [-FALLOFF * 0.4, 0, FALLOFF * 0.4], [0, 1, 0], { clamp: true });

  const onFocus = () => {
    const rect = ref.current?.getBoundingClientRect();
    if (rect) cursor.set(rect.x + rect.width / 2);
  };

  const name = entry.running ? `${entry.title}, running` : entry.title;
  const className = cn(
    "flex shrink-0 items-center justify-center rounded-[14px] bg-card-nested ring-1 ring-border outline-none transition-colors dark:ring-glass-border",
    "focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[1em]",
    current ? "text-signal-ink ring-signal/40 dark:text-signal dark:ring-signal/40" : "text-ink-2 hover:text-foreground",
  );
  const style = { width: size, height: size, fontSize: glyph };

  return (
    <div className="relative flex flex-col items-center">
      <motion.span
        aria-hidden
        style={{ opacity: label }}
        className="glass pointer-events-none absolute bottom-full mb-3 rounded-pill px-2.5 py-1 font-label text-micro tracking-[0.06em] whitespace-nowrap text-foreground uppercase"
      >
        {entry.title}
      </motion.span>
      {entry.target.kind === "route" ? (
        <MotionLink
          ref={ref as React.Ref<HTMLAnchorElement>}
          href={entry.target.route}
          aria-label={name}
          aria-current={current ? "page" : undefined}
          onFocus={onFocus}
          style={style}
          className={className}
        >
          <AppIcon id={entry.id} icon={entry.icon} strokeWidth={1.75} aria-hidden />
        </MotionLink>
      ) : (
        <motion.button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          aria-label={`Open ${name}`}
          data-dock-window={entry.target.window}
          onFocus={onFocus}
          onClick={onSelect}
          style={style}
          className={className}
        >
          <AppIcon id={entry.id} icon={entry.icon} strokeWidth={1.75} aria-hidden />
        </motion.button>
      )}
      <span
        aria-hidden
        className={cn("absolute -bottom-1.5 size-1 rounded-full bg-signal transition-opacity", entry.running ? "opacity-100" : "opacity-0")}
      />
    </div>
  );
}
