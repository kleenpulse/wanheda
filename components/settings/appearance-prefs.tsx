"use client";

import * as React from "react";
import { Pipette } from "lucide-react";
import { usePrefs, type PrefsSaveState, type PrefsSource } from "@/components/prefs/prefs-provider";
import { Segmented } from "@/components/ui/segmented";
import { ACCENT_PRESETS, PICKER_FALLBACK, SKINS, SKIN_LABELS, WALLPAPERS, WALLPAPER_LABELS, parseAccent } from "@/lib/prefs/prefs";
import { cn } from "@/lib/utils";

const SKIN_OPTIONS = SKINS.map((value) => ({ value, label: SKIN_LABELS[value] }));
const WALLPAPER_OPTIONS = WALLPAPERS.map((value) => ({ value, label: WALLPAPER_LABELS[value] }));

function Row({ title, body, children }: { title: string; body: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 p-5 @lg:flex-row @lg:items-center @lg:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-[13px] text-pretty text-ink-2">{body}</p>
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

/** Skin, accent colour and home wallpaper (FR-SHELL-7). */
export function AppearancePrefs() {
  const { prefs, update } = usePrefs();
  const custom = prefs.accent !== null && !ACCENT_PRESETS.some((p) => p.hex === prefs.accent);
  const swatchClass =
    "relative grid size-8 place-items-center rounded-full ring-1 ring-border outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border motion-reduce:hover:scale-100";

  return (
    <>
      <Row title="Skin" body="Ember by day and Nebula by night, or Motion Garden's graphite Bench.">
        <Segmented
          label="Skin"
          value={prefs.skin}
          options={SKIN_OPTIONS}
          onChange={(skin) => {
            update({ skin });
          }}
        />
      </Row>

      <div className="mx-5 h-px bg-border dark:bg-glass-border" />

      <Row title="Accent" body="Any colour. Its lightness is adjusted per theme so text in it stays readable.">
        <div role="group" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-pressed={prefs.accent === null}
            onClick={() => {
              update({ accent: null });
            }}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border",
              prefs.accent === null ? "bg-inverse text-inverse-foreground" : "text-ink-2 hover:text-foreground",
            )}
          >
            Skin&rsquo;s own
          </button>
          {ACCENT_PRESETS.map((p) => {
            const on = prefs.accent === p.hex;
            return (
              <button
                key={p.hex}
                type="button"
                aria-label={p.name}
                aria-pressed={on}
                title={p.name}
                onClick={() => {
                  update({ accent: p.hex });
                }}
                className={cn(swatchClass, on && "ring-2 ring-foreground ring-offset-2 ring-offset-background dark:ring-foreground")}
                style={{ backgroundColor: p.hex }}
              />
            );
          })}
          <label
            className={cn(
              swatchClass,
              "cursor-pointer bg-card-nested text-ink-2 hover:text-foreground",
              custom && "text-signal-ink ring-2 ring-foreground ring-offset-2 ring-offset-background dark:ring-foreground",
            )}
            title={custom ? `Custom colour ${prefs.accent ?? ""}` : "Any colour"}
          >
            <span className="sr-only">{custom ? `Pick any colour, custom colour ${prefs.accent ?? ""} in use` : "Pick any colour"}</span>
            <Pipette aria-hidden className="size-4" />
            <input
              type="color"
              value={prefs.accent ?? PICKER_FALLBACK}
              onChange={(e) => {
                const accent = parseAccent(e.target.value);
                if (accent) update({ accent });
              }}
              className="absolute inset-0 size-full cursor-pointer opacity-0"
            />
          </label>
        </div>
      </Row>

      <div className="mx-5 h-px bg-border dark:bg-glass-border" />

      <Row title="Home wallpaper" body="Behind the board on Home. It follows the skin and the accent.">
        <Segmented
          label="Home wallpaper"
          value={prefs.wallpaper}
          options={WALLPAPER_OPTIONS}
          onChange={(wallpaper) => {
            update({ wallpaper });
          }}
        />
      </Row>
    </>
  );
}

/** One quiet line under the section heading: where prefs live and whether the last change saved. */
export function prefsNote(source: PrefsSource, state: PrefsSaveState): string {
  if (source === "demo") return "Demo: saved on this device only";
  if (state === "saving") return "Saving…";
  if (state === "failed") return "Couldn't save. Kept on this device";
  if (state === "saved") return "Saved";
  return source === "load-failed" ? "Couldn't load your saved prefs. Using this device's" : "Saved to your account";
}

export function PrefsNote() {
  const { source, saveState } = usePrefs();
  return <span aria-live="polite">{prefsNote(source, saveState)}</span>;
}
