"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { buttonClass } from "@/components/ui/button";
import { Tip } from "@/components/ui/tooltip";
import { maskMoney, PRIVACY_ATTR, PRIVACY_KEY, PRIVACY_SHORTCUT } from "@/lib/money/privacy";

// Privacy mode's client side: one source of truth, the attribute on <html>
// (set before first paint by the boot script), mirrored into React through
// useSyncExternalStore. Toggling writes the attribute and localStorage;
// other tabs follow through the storage event.

const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== PRIVACY_KEY) return;
    apply(e.newValue === "1", false);
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const read = () => document.documentElement.hasAttribute(PRIVACY_ATTR);

function apply(on: boolean, persist: boolean) {
  if (on) document.documentElement.setAttribute(PRIVACY_ATTR, "");
  else document.documentElement.removeAttribute(PRIVACY_ATTR);
  if (persist) {
    try {
      localStorage.setItem(PRIVACY_KEY, on ? "1" : "0");
    } catch {
      // Private mode: it still applies to this tab.
    }
  }
  notify();
}

export function setPrivacy(on: boolean) {
  apply(on, true);
}

export function togglePrivacy() {
  apply(!read(), true);
}

/** Whether figures are hidden. The server render (and the hydration pass) says no. */
export function usePrivacy(): boolean {
  return React.useSyncExternalStore(subscribe, read, () => false);
}

const shown = (text: string) => text;

/** For anything that prints a figure itself (chart axes): whether to mask, and how. */
export function useMask(): { hidden: boolean; show: (text: string) => string } {
  const hidden = usePrivacy();
  return hidden ? { hidden, show: maskMoney } : { hidden, show: shown };
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

/** The `h` shortcut, from any page of the shell. */
export function usePrivacyShortcut() {
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey || e.repeat || isTyping(e.target)) return;
      if (e.key.toLowerCase() !== PRIVACY_SHORTCUT) return;
      e.preventDefault();
      togglePrivacy();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, []);
}

/** The eye beside the money tabs. */
export function PrivacyButton({ className }: { className?: string }) {
  const on = usePrivacy();
  const label = on ? "Show amounts" : "Hide amounts";
  return (
    <Tip
      label={`${label} (${PRIVACY_SHORTCUT.toUpperCase()})`}
      render={
        <button type="button" aria-pressed={on} onClick={togglePrivacy} className={buttonClass("surface", "circle-sm", className ?? "size-10 shrink-0")}>
          {on ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
          <span className="sr-only">{label}</span>
        </button>
      }
    />
  );
}
