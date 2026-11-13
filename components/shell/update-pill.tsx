"use client";

import { RotateCw } from "lucide-react";
import * as React from "react";
import { desktopUpdate, parseUpdateState, type DesktopUpdateState } from "@/lib/platform/desktop";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const NONE: DesktopUpdateState = { kind: "none" };

/** The desktop app's self-update; always "none" on the web and in shells before bridge version 3. */
export function useDesktopUpdate(): DesktopUpdateState {
  const [state, setState] = React.useState<DesktopUpdateState>(NONE);
  React.useEffect(() => {
    const update = desktopUpdate();
    if (!update) return;
    let live = true;
    let pushed = false;
    const off = update.onState((next) => {
      pushed = true;
      if (live) setState(parseUpdateState(next));
    });
    // A push that lands first is newer than this answer.
    update
      .state()
      .then((now) => {
        if (live && !pushed) setState(parseUpdateState(now));
      })
      .catch(() => {});
    return () => {
      live = false;
      off();
    };
  }, []);
  return state;
}

const PILL = "flex h-6 shrink-0 animate-rise-in items-center gap-1.5 rounded-full px-2.5 text-xs font-medium outline-none [app-region:no-drag]";

function ProgressRing({ percent }: { percent: number }) {
  const r = 5;
  const length = 2 * Math.PI * r;
  return (
    <svg aria-hidden viewBox="0 0 14 14" className="size-3.5 -rotate-90">
      <circle cx="7" cy="7" r={r} fill="none" strokeWidth="2" className="stroke-foreground/12" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={length}
        strokeDashoffset={length * (1 - percent / 100)}
        className="stroke-signal transition-[stroke-dashoffset] duration-300"
      />
    </svg>
  );
}

/**
 * The title bar's update pill, desktop app only (T81), the way VS Code shows
 * one: progress while a new version downloads, then "Restart to update".
 */
export function UpdatePill({ className }: { className?: string }) {
  const state = useDesktopUpdate();
  if (state.kind === "none") return null;

  if (state.kind === "downloading") {
    return (
      // A progressbar, not a live region: screen readers read the value when asked instead of at every percent.
      <div
        role="progressbar"
        aria-label={`Downloading Wanheda ${state.version}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={state.percent}
        className={cn(PILL, "bg-foreground/6 text-muted-foreground", className)}
      >
        <ProgressRing percent={state.percent} />
        <span className="tabular">Updating {state.percent}%</span>
      </div>
    );
  }

  return (
    <Tip
      label={`Wanheda ${state.version} is ready`}
      render={
        <button
          type="button"
          onClick={() => desktopUpdate()?.restart()}
          aria-label={`Restart to update to Wanheda ${state.version}`}
          className={cn(
            PILL,
            "group/update bg-signal-soft text-signal-ink transition-[background-color,transform] hover:bg-signal/25 focus-visible:bg-signal/30 active:scale-[0.97]",
            className,
          )}
        />
      }
    >
      <RotateCw aria-hidden className="size-3.5 transition-transform duration-500 group-hover/update:rotate-180" />
      <span>Restart to update</span>
    </Tip>
  );
}
