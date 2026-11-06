"use client";

import * as React from "react";
import { saveReaderPrefs } from "@/actions/prefs";
import type { PrefsSaveState, PrefsSource } from "@/components/prefs/prefs-provider";
import { READER_DEVICE_PREFS } from "@/components/reader/prefs";
import { READER_PREF_KEYS, type ReaderPrefs } from "@/lib/reader/prefs";

/*
  The reader's prefs in the owner's account (user 2026-11-06: "sync to db").
  This device's copy (localStorage) stays what every control reads, so a
  change shows at once and nothing waits on the server. The account's copy
  rides in with the shell (user_prefs.reader) and is laid over this device's
  on load, so a change made elsewhere lands here. A change made here is saved,
  the whole set at once, after a short pause.

  owner: the account's copy wins on load. load-failed: this device's stands,
  changes are still saved (the whole set is the owner's latest word). demo:
  this device only.
*/

interface ReaderPrefsContext {
  source: PrefsSource;
  saveState: PrefsSaveState;
}

const Ctx = React.createContext<ReaderPrefsContext | null>(null);

/** Long enough that dragging the auto-scroll slider saves once, at the end. */
const SAVE_DELAY = 500;

function devicePrefs(): ReaderPrefs {
  const p = READER_DEVICE_PREFS;
  return {
    coverStyle: p.coverStyle.get(),
    coverFit: p.coverFit.get(),
    bookPages: p.bookPages.get(),
    pageTurn: p.pageTurn.get(),
    textSize: p.textSize.get(),
    paper: p.paper.get(),
    autoSpeed: p.autoSpeed.get(),
  };
}

function apply<K extends keyof ReaderPrefs>(key: K, value: ReaderPrefs[K]): void {
  const pref = READER_DEVICE_PREFS[key];
  if (pref.get() !== value) pref.set(value);
}

export function ReaderPrefsSync({
  initial,
  source,
  children,
}: {
  /** The account's copy, field by field; null when it has never been saved. */
  initial: Partial<ReaderPrefs> | null;
  source: PrefsSource;
  children: React.ReactNode;
}) {
  const [saveState, setSaveState] = React.useState<PrefsSaveState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  // True while the account's copy is laid over this device's: those sets are not changes to save.
  const applying = React.useRef(false);

  const save = React.useCallback(() => {
    clearTimeout(timer.current);
    setSaveState("saving");
    timer.current = setTimeout(() => {
      saveReaderPrefs(devicePrefs())
        .then((r) => {
          setSaveState(r.ok ? "saved" : "failed");
        })
        .catch(() => {
          setSaveState("failed");
        });
    }, SAVE_DELAY);
  }, []);

  // Once per load: the account's copy over this device's. Fields it has never
  // held (a first save, or a pref added later) take this device's value up.
  const loaded = React.useRef(false);
  React.useEffect(() => {
    if (loaded.current || source !== "owner") return;
    loaded.current = true;
    applying.current = true;
    try {
      for (const key of READER_PREF_KEYS) {
        const value = initial?.[key];
        if (value !== undefined) apply(key, value);
      }
    } finally {
      applying.current = false;
    }
    // Quietly, in the background: nothing was changed, so the note stays as it is.
    // If it fails, the next change saves the whole set anyway.
    if (READER_PREF_KEYS.some((key) => initial?.[key] === undefined)) {
      saveReaderPrefs(devicePrefs()).catch(() => undefined);
    }
  }, [initial, source]);

  React.useEffect(() => {
    if (source === "demo") return;
    const stops = READER_PREF_KEYS.map((key) =>
      READER_DEVICE_PREFS[key].watch(() => {
        if (!applying.current) save();
      }),
    );
    return () => {
      for (const stop of stops) stop();
      clearTimeout(timer.current);
    };
  }, [source, save]);

  const value = React.useMemo(() => ({ source, saveState }), [source, saveState]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useReaderPrefsSync(): ReaderPrefsContext {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useReaderPrefsSync needs a ReaderPrefsSync (the shell frame)");
  return ctx;
}
