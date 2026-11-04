"use client";

import * as React from "react";
import { NotebookPen } from "lucide-react";
import { WidgetCard } from "./widget-card";

const STORAGE_KEY = "wanheda-quick-note";
const MAX_LENGTH = 4000;

/**
 * A scratchpad kept in this browser's localStorage. A placeholder for the
 * Notes app's pinned notes, which sync through the database.
 */
export function NoteWidget() {
  const [text, setText] = React.useState("");
  const [loaded, setLoaded] = React.useState(false);
  const id = React.useId();

  React.useEffect(() => {
    setText(localStorage.getItem(STORAGE_KEY) ?? "");
    setLoaded(true);
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setText(e.newValue ?? "");
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  React.useEffect(() => {
    if (!loaded) return;
    const timer = setTimeout(() => {
      if (text) localStorage.setItem(STORAGE_KEY, text);
      else localStorage.removeItem(STORAGE_KEY);
    }, 300);
    return () => {
      clearTimeout(timer);
    };
  }, [text, loaded]);

  return (
    <WidgetCard title="Quick note" icon={NotebookPen} note="This device">
      <label htmlFor={id} className="sr-only">
        Quick note, saved on this device
      </label>
      <textarea
        id={id}
        value={text}
        maxLength={MAX_LENGTH}
        disabled={!loaded}
        onChange={(e) => {
          setText(e.target.value);
        }}
        placeholder="Jot something down…"
        className="min-h-0 flex-1 resize-none rounded-[14px] bg-transparent text-[14px] leading-relaxed text-foreground outline-none placeholder:text-ink-3 focus-visible:ring-1 focus-visible:ring-ring focus-visible:ring-offset-4 focus-visible:ring-offset-card"
      />
    </WidgetCard>
  );
}
