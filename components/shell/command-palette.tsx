"use client";

import * as React from "react";
import { Command } from "cmdk";
import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  AppWindow,
  Monitor,
  Moon,
  PanelLeft,
  Pause,
  Play,
  Search,
  Sun,
  Timer as TimerIcon,
  X,
  type LucideIcon,
} from "lucide-react";
import { usePalette } from "@/components/shell/palette-store";
import { centerOf, revealTheme, type ThemeChoice } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
import { TAB_SPRING } from "@/lib/motion";
import { useActivity } from "@/lib/activity/store";
import { MINUTE, formatDuration, isDone, isRunning, parseTimerQuery } from "@/lib/activity/timer";
import { MODULES, SYSTEM_PAGES, WINDOWS } from "@/lib/modules";
import { cn } from "@/lib/utils";
import { useWindows } from "@/lib/windows/store";

/*
  The command palette (FR-SHELL-3): apps from the module registry, timers on
  the activity bus, mini windows, theme and shell commands. Typing a duration ("25",
  "10 min", "1h30") offers to start that timer. Ctrl/⌘K toggles it anywhere;
  `/` opens it when you're not typing.
*/

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

const PRESETS = [5, 15, 25, 50] as const;

const THEMES: { choice: ThemeChoice; title: string; short: string; icon: LucideIcon }[] = [
  { choice: "light", title: "Light theme (Ember)", short: "Light", icon: Sun },
  { choice: "dark", title: "Dark theme (Nebula)", short: "Dark", icon: Moon },
  { choice: "system", title: "Match the system theme", short: "System", icon: Monitor },
];

export function CommandPalette({ railExpanded, onToggleRail }: { railExpanded: boolean; onToggleRail: () => void }) {
  const { open, setOpen } = usePalette();

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setOpen}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-50 bg-background/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      contentClassName={cn(
        "glass fixed top-[12%] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-card p-3 shadow-lift outline-none",
        "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
      )}
      className="[&_[cmdk-group-heading]]:readout [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5"
    >
      {/* Mounted per open, so the query starts empty every time. */}
      {open && (
        <PaletteBody
          railExpanded={railExpanded}
          onToggleRail={onToggleRail}
          close={() => {
            setOpen(false);
          }}
        />
      )}
    </Command.Dialog>
  );
}

function PaletteBody({
  railExpanded,
  onToggleRail,
  close,
}: {
  railExpanded: boolean;
  onToggleRail: () => void;
  close: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const timers = useActivity((s) => s.timers);
  const { startTimer, toggleTimer, cancelTimer } = useActivity.getState();
  const openWindows = useWindows((s) => s.open);
  const { openWindow, closeWindow } = useWindows.getState();
  // The body mounts per open, so "done" is judged as of opening.
  const [openedAt] = React.useState(Date.now);
  const typedTimer = parseTimerQuery(query);

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-ink-3" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={setQuery}
          placeholder="Search apps and commands, or type 25 for a timer"
          className="h-12 w-full rounded-full bg-sheet pr-5 pl-12 text-[15px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border"
        />
      </div>
      <Command.List className="mt-2 max-h-[min(24rem,60svh)] overflow-y-auto overscroll-contain">
        <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-2">Nothing by that name.</Command.Empty>

        {typedTimer !== null && !PRESETS.some((min) => min * MINUTE === typedTimer) && (
          <Command.Group heading="Start" forceMount>
            <Item
              forceMount
              value={`start-typed-${String(typedTimer)}`}
              icon={TimerIcon}
              title={`Start a ${formatDuration(typedTimer)} timer`}
              onSelect={run(() => startTimer(typedTimer))}
            />
          </Command.Group>
        )}

        <Command.Group heading="Apps">
          {[...MODULES, ...SYSTEM_PAGES].map((m) => (
            <Item
              key={m.id}
              value={`app-${m.id}`}
              keywords={[m.title, m.blurb, "go", "open"]}
              icon={m.icon}
              title={m.title}
              hint={m.blurb}
              onSelect={run(() => {
                router.push(m.route);
              })}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Timers">
          {timers.map((t) => {
            const done = isDone(t, openedAt);
            return (
              <React.Fragment key={t.id}>
                {done ? null : (
                  <Item
                    value={`timer-toggle-${t.id}`}
                    keywords={["timer", t.label, isRunning(t) ? "pause" : "resume"]}
                    icon={isRunning(t) ? Pause : Play}
                    title={`${isRunning(t) ? "Pause" : "Resume"} ${t.label}`}
                    onSelect={run(() => {
                      toggleTimer(t.id);
                    })}
                  />
                )}
                <Item
                  value={`timer-cancel-${t.id}`}
                  keywords={["timer", t.label, "cancel", "stop", "dismiss"]}
                  icon={X}
                  title={`${done ? "Dismiss" : "Cancel"} ${t.label}`}
                  onSelect={run(() => {
                    cancelTimer(t.id);
                  })}
                />
              </React.Fragment>
            );
          })}
          {PRESETS.map((min) => (
            <Item
              key={min}
              value={`timer-start-${String(min)}`}
              keywords={["timer", "start", "focus", "countdown", `${String(min)} min`]}
              icon={TimerIcon}
              title={`Start a ${String(min)} min timer`}
              onSelect={run(() => startTimer(min * MINUTE))}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Windows">
          {WINDOWS.map((w) => {
            const isOpen = openWindows.includes(w.id);
            return (
              <Item
                key={w.id}
                value={`window-${w.id}`}
                keywords={["window", "mini", "float", "pop out", w.title]}
                icon={isOpen ? X : AppWindow}
                title={`${isOpen ? "Close" : "Open"} the ${w.title.toLowerCase()} window`}
                onSelect={run(() => {
                  if (isOpen) closeWindow(w.id);
                  else openWindow(w.id);
                })}
              />
            );
          })}
        </Command.Group>
      </Command.List>
      <PaletteFooter railExpanded={railExpanded} onToggleRail={onToggleRail} />
    </>
  );
}

/*
  Quick toggles pinned under the results, outside the list: they are never
  filtered away, and using them keeps the palette open so the change shows.
*/
function PaletteFooter({ railExpanded, onToggleRail }: { railExpanded: boolean; onToggleRail: () => void }) {
  const { theme, setTheme } = useTheme();
  const indicatorId = React.useId();
  const current = theme ?? "system";

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3 dark:border-glass-border">
      <div
        role="group"
        aria-label="Theme"
        className="flex items-center rounded-pill bg-sheet p-1 ring-1 ring-border dark:bg-background/40 dark:ring-glass-border"
      >
        {THEMES.map((t) => {
          const active = current === t.choice;
          const Icon = t.icon;
          return (
            <button
              key={t.choice}
              type="button"
              aria-pressed={active}
              title={t.title}
              onClick={(e) => {
                revealTheme(t.choice, setTheme, centerOf(e.currentTarget));
              }}
              className={cn(
                "relative isolate inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
                active ? "text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={indicatorId}
                  layoutDependency={current}
                  transition={TAB_SPRING}
                  aria-hidden
                  style={{ borderRadius: 9999 }}
                  className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
                />
              )}
              <Icon strokeWidth={1.75} aria-hidden />
              {t.short}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onToggleRail}
        aria-expanded={railExpanded}
        className="hidden h-8 items-center gap-2 rounded-pill px-3 text-[12px] font-medium text-ink-2 outline-none hover:bg-card-nested hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:inline-flex dark:hover:bg-accent [&_svg]:size-3.5"
      >
        <PanelLeft strokeWidth={1.75} aria-hidden />
        {railExpanded ? "Collapse sidebar" : "Expand sidebar"}
        <Kbd>[</Kbd>
      </button>
    </div>
  );
}

function Item({
  value,
  keywords,
  icon: Icon,
  title,
  hint,
  forceMount,
  onSelect,
}: {
  value: string;
  keywords?: string[];
  icon: LucideIcon;
  title: string;
  hint?: string;
  forceMount?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      keywords={[title, ...(keywords ?? [])]}
      {...(forceMount ? { forceMount: true } : {})}
      onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-[14px] px-2 text-ink-2 outline-none data-[selected=true]:bg-signal-soft data-[selected=true]:text-foreground"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2 ring-1 ring-border dark:ring-glass-border">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="truncate text-[13.5px] font-medium text-foreground">{title}</span>
      {hint ? <span className="ml-auto shrink-0 truncate pl-3 text-[12px] text-ink-3">{hint}</span> : null}
    </Command.Item>
  );
}
