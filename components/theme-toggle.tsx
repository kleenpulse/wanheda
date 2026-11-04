"use client";

import type * as React from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { buttonClass } from "@/components/ui/button";

export type ThemeChoice = "light" | "dark" | "system";

/**
 * Switches skin with a circular reveal grown from `origin` (a viewport point),
 * on the View Transitions API (CSS: "Skin switch" in app/globals.css). Reduced
 * motion, an unchanged skin and browsers without startViewTransition get an
 * instant switch. Exported for the Phase 1 palette and settings. Ported from
 * email-manager's theme toggle.
 */
export function revealTheme(choice: ThemeChoice, setTheme: (theme: string) => void, origin?: { x: number; y: number }) {
  const root = document.documentElement;
  const next =
    choice === "system" ? (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : choice;
  const apply = () => {
    // next-themes applies the class in an effect; the transition's snapshot
    // needs it now.
    root.classList.toggle("dark", next === "dark");
    root.classList.toggle("light", next === "light");
    root.style.colorScheme = next;
    setTheme(choice);
  };

  const reduced = root.dataset.motion === "reduce" || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const unchanged = root.classList.contains("dark") === (next === "dark");
  if (reduced || unchanged || typeof document.startViewTransition !== "function") {
    apply();
    return;
  }
  const w = innerWidth;
  const h = innerHeight;
  const x = origin?.x ?? w / 2;
  const y = origin?.y ?? h / 2;
  const radius = Math.hypot(Math.max(x, w - x), Math.max(y, h - y));
  // Percentages, not px (fix from Motion Garden's lib/theme-transition.ts): the
  // clip runs on ::view-transition-new(root), whose box on Android Chrome is the
  // snapshot containing block, larger than the viewport, so px origins drift
  // toward the top-left. A circle() % radius resolves against hypot(w, h) / √2.
  root.style.setProperty("--reveal-x", `${((x / w) * 100).toFixed(3)}%`);
  root.style.setProperty("--reveal-y", `${((y / h) * 100).toFixed(3)}%`);
  root.style.setProperty("--reveal-r", `${((radius / (Math.hypot(w, h) / Math.SQRT2)) * 100).toFixed(3)}%`);
  document.startViewTransition(apply);
}

/** Center of an element, in viewport coordinates, for the reveal origin. */
export function centerOf(el: Element) {
  const rect = el.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
}

// The icon swaps through the `.dark` class in CSS, so the first render needs
// no mounted check and cannot mismatch on hydration.
export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  function toggle(event: React.MouseEvent<HTMLButtonElement>) {
    revealTheme(resolvedTheme === "dark" ? "light" : "dark", setTheme, centerOf(event.currentTarget));
  }

  return (
    <button
      type="button"
      aria-label="Toggle light and dark theme"
      onClick={toggle}
      className={buttonClass("surface", "circle-sm")}
    >
      <Sun aria-hidden className="dark:hidden" />
      <Moon aria-hidden className="hidden dark:block" />
    </button>
  );
}
