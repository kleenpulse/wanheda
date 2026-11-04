"use client";

import { usePrefs } from "@/components/prefs/prefs-provider";

/** Home's wallpaper (FR-SHELL-7): a token-only layer from globals.css, or nothing. */
export function Wallpaper() {
  const { prefs } = usePrefs();
  if (prefs.wallpaper === "none") return null;
  return <div data-wallpaper={prefs.wallpaper} className={`absolute inset-0 wallpaper-${prefs.wallpaper}`} />;
}
