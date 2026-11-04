"use client";

import * as React from "react";
import { savePrefs } from "@/actions/prefs";
import { useActivity } from "@/lib/activity/store";
import { applyPrefs, prefsCookie, type Prefs } from "@/lib/prefs/prefs";

/**
 * owner: the saved prefs, saved on change. demo: this device's cookie only.
 * load-failed: the cookie standing in for prefs that could not be read; a
 * change is still saved, since it is the whole row and the owner's latest word.
 */
export type PrefsSource = "owner" | "demo" | "load-failed";
export type PrefsSaveState = "idle" | "saving" | "saved" | "failed";

interface PrefsContext {
  prefs: Prefs;
  source: PrefsSource;
  saveState: PrefsSaveState;
  update: (patch: Partial<Prefs>) => void;
}

const Ctx = React.createContext<PrefsContext | null>(null);

/** Long enough that dragging through the colour picker saves once, at the end. */
const SAVE_DELAY = 500;

/**
 * Holds the prefs for the shell (FR-SHELL-7) and keeps three things in step
 * with them: <html> (skin and accent), the cookie the boot script reads on
 * the next load, and the timer mode on the activity bus. Running on mount too
 * is what carries a change made on another device into this one's cookie.
 */
export function PrefsProvider({
  initial,
  source,
  children,
}: {
  initial: Prefs;
  source: PrefsSource;
  children: React.ReactNode;
}) {
  const [prefs, setPrefs] = React.useState(initial);
  const [saveState, setSaveState] = React.useState<PrefsSaveState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  React.useEffect(() => {
    applyPrefs(document.documentElement, prefs);
    document.cookie = prefsCookie(prefs);
    useActivity.setState({ timerMode: prefs.timerMode });
  }, [prefs]);

  React.useEffect(
    () => () => {
      clearTimeout(timer.current);
    },
    [],
  );

  // The latest prefs for the handler, so the state updater stays pure.
  const latest = React.useRef(initial);

  const update = React.useCallback(
    (patch: Partial<Prefs>) => {
      const next = { ...latest.current, ...patch };
      latest.current = next;
      setPrefs(next);
      if (source === "demo") return;
      clearTimeout(timer.current);
      setSaveState("saving");
      timer.current = setTimeout(() => {
        savePrefs(next)
          .then((r) => {
            setSaveState(r.ok ? "saved" : "failed");
          })
          .catch(() => {
            setSaveState("failed");
          });
      }, SAVE_DELAY);
    },
    [source],
  );

  const value = React.useMemo(() => ({ prefs, source, saveState, update }), [prefs, source, saveState, update]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function usePrefs(): PrefsContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("usePrefs needs a PrefsProvider (the shell frame)");
  return ctx;
}
