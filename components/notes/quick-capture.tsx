"use client";

import * as React from "react";
import Link from "next/link";
import { Kbd } from "@/components/ui/kbd";
import { desktopBridge } from "@/lib/platform/desktop";

type Status = "idle" | "saving" | "not-ready";

const noSubscribe = () => () => {};
const hasBridge = () => desktopBridge() !== null;

/**
 * Quick capture, in its own small window over any app (V71). Enter saves the
 * text as a new note and hides the window; Shift+Enter is a new line; Esc
 * hides it with the draft kept for next time. A click elsewhere hides it too.
 */
export function QuickCapture() {
  const [text, setText] = React.useState("");
  const [status, setStatus] = React.useState<Status>("idle");
  // Null in the server render: the bridge exists only in the desktop window.
  const desktop = React.useSyncExternalStore(noSubscribe, hasBridge, () => null);
  const field = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    // Shown again by the shortcut: straight back into the text.
    const onFocus = () => field.current?.focus();
    window.addEventListener("focus", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
    };
  }, []);

  const close = () => desktopBridge()?.capture.close();

  const save = async () => {
    const bridge = desktopBridge();
    if (!bridge || text.trim() === "" || status === "saving") return;
    setStatus("saving");
    const ok = await bridge.capture.save(text).catch(() => false);
    if (!ok) {
      setStatus("not-ready");
      return;
    }
    setText("");
    setStatus("idle");
    bridge.capture.close();
  };

  if (desktop === false) {
    return (
      <main className="flex flex-1 items-center justify-center p-6">
        <p className="text-[14px] text-ink-2">
          Quick capture opens from the desktop app&apos;s shortcut.{" "}
          <Link href="/notes" className="text-foreground underline underline-offset-4">
            Open Notes
          </Link>
        </p>
      </main>
    );
  }

  return (
    <main className="flex h-svh flex-col gap-2 bg-sheet px-5 pt-4 pb-3 dark:bg-card">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor="quick-capture" className="readout">
          Quick note
        </label>
        {status === "not-ready" ? (
          <p role="status" className="text-[12px] text-ink-2">
            Wanheda can&apos;t take it yet. Open Wanheda and sign in, then press Enter again.
          </p>
        ) : null}
      </div>
      <textarea
        id="quick-capture"
        ref={field}
        autoFocus
        value={text}
        placeholder="Write it down…"
        onChange={(e) => {
          setText(e.target.value);
          if (status === "not-ready") setStatus("idle");
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            close();
          } else if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void save();
          }
        }}
        className="min-h-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed text-foreground outline-none placeholder:text-ink-3"
      />
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-2">
        <span className="flex items-center gap-1">
          <Kbd>Enter</Kbd> saves to Notes
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Shift</Kbd>
          <Kbd>Enter</Kbd> new line
        </span>
        <span className="flex items-center gap-1">
          <Kbd>Esc</Kbd> closes
        </span>
      </p>
    </main>
  );
}
