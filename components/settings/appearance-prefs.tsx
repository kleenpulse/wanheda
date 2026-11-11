"use client";

import * as React from "react";
import { CloudSun, Pipette, Sunrise, Timer } from "lucide-react";
import { useTheme } from "next-themes";
import { usePrefs, type PrefsSaveState, type PrefsSource } from "@/components/prefs/prefs-provider";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { TimerModeSetting } from "@/components/settings/timer-mode";
import { revealTheme, type ThemeChoice } from "@/components/theme-toggle";
import { Segmented } from "@/components/ui/segmented";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useHydrated } from "@/hooks/use-hydrated";
import {
  ACCENT_PRESETS,
  AURORA_EDGES,
  AURORA_EDGE_LABELS,
  PICKER_FALLBACK,
  SKINS,
  SKIN_LABELS,
  WALLPAPERS,
  WALLPAPER_COVERS,
  WALLPAPER_COVER_LABELS,
  WALLPAPER_LABELS,
  WALLPAPER_SCOPES,
  WALLPAPER_SCOPE_LABELS,
  parseAccent,
  seedPages,
  withPageWallpaper,
  type WallpaperPages,
} from "@/lib/prefs/prefs";
import { WALLPAPER_PAGE_LIST } from "@/lib/prefs/wallpaper-pages";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const SKIN_OPTIONS = SKINS.map((value) => ({ value, label: SKIN_LABELS[value] }));
const WALLPAPER_OPTIONS = WALLPAPERS.map((value) => ({ value, label: WALLPAPER_LABELS[value] }));
const SCOPE_OPTIONS = WALLPAPER_SCOPES.map((value) => ({ value, label: WALLPAPER_SCOPE_LABELS[value] }));
const COVER_OPTIONS = WALLPAPER_COVERS.map((value) => ({ value, label: WALLPAPER_COVER_LABELS[value] }));
const AURORA_EDGE_OPTIONS = AURORA_EDGES.map((value) => ({ value, label: AURORA_EDGE_LABELS[value] }));

/** Sample rows that wear the current skin and accent, so a change shows before you leave the page. */
const PREVIEW = [
  { icon: Timer, title: "Timer done", body: "Focus, 25 min. Rang on time.", time: "09:41", unread: true },
  { icon: CloudSun, title: "Weather", body: "Light rain after 4 pm.", time: "08:02", unread: false },
  { icon: Sunrise, title: "Today", body: "Two timers ran, one still going.", time: "Mon", unread: false },
] as const;

function Preview() {
  return (
    <SettingsCard title="Preview">
      <ul aria-label="Preview of the current look" className="flex flex-col gap-1.5 px-3 pt-1 pb-3">
        {PREVIEW.map((row, i) => {
          const selected = i === 0;
          const Icon = row.icon;
          return (
            <li
              key={row.title}
              className={cn(
                "flex items-center gap-3 rounded-[18px] px-3 py-2.5 ring-1",
                selected ? "bg-signal-soft ring-signal/40" : "bg-card-nested ring-border dark:ring-glass-border",
              )}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full ring-1 ring-border dark:ring-glass-border",
                  selected ? "bg-background/40 text-signal-ink" : "bg-sheet text-ink-2",
                )}
              >
                <Icon aria-hidden className="size-4" strokeWidth={1.75} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  {row.unread ? <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-signal" /> : null}
                  {row.unread ? <span className="sr-only">Unread: </span> : null}
                  <span className={cn("truncate text-[13.5px]", row.unread ? "font-semibold text-foreground" : "font-medium text-foreground")}>
                    {row.title}
                  </span>
                </span>
                <span className="block truncate text-[12.5px] text-ink-2">{row.body}</span>
              </span>
              <span className="shrink-0 self-start pt-0.5 font-mono text-[11.5px] tabular text-ink-3">{row.time}</span>
            </li>
          );
        })}
      </ul>
    </SettingsCard>
  );
}

/** Light, dark or the system's, with the circular reveal grown from the press. */
function ThemeControl() {
  const { theme, setTheme } = useTheme();
  const { prefs } = usePrefs();
  const hydrated = useHydrated();
  const press = React.useRef<{ x: number; y: number } | undefined>(undefined);
  const bench = prefs.skin === "bench";
  const options: { value: ThemeChoice; label: string }[] = [
    { value: "system", label: "System" },
    { value: "light", label: bench ? "Light" : "Ember" },
    { value: "dark", label: bench ? "Dark" : "Nebula" },
  ];
  const current = (theme ?? "system") as ThemeChoice;

  return (
    <div
      onPointerDown={(e) => {
        press.current = { x: e.clientX, y: e.clientY };
      }}
    >
      <Segmented
        label="Theme"
        value={hydrated ? current : null}
        options={options}
        onChange={(choice) => {
          revealTheme(choice, setTheme, press.current);
          press.current = undefined;
        }}
      />
    </div>
  );
}

function AccentControl() {
  const { prefs, update } = usePrefs();
  const custom = prefs.accent !== null && !ACCENT_PRESETS.some((p) => p.hex === prefs.accent);
  const swatchClass =
    "relative grid size-8 place-items-center rounded-full ring-1 ring-border outline-none transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border motion-reduce:hover:scale-100";

  return (
    <div role="group" aria-label="Accent colour" className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        aria-pressed={prefs.accent === null}
        onClick={() => {
          update({ accent: null });
        }}
        className={cn(
          "inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium ring-1 ring-border outline-none focus-visible:ring-2 focus-visible:ring-ring dark:ring-glass-border",
          prefs.accent === null ? "bg-inverse text-inverse-foreground dark:bg-signal-soft dark:text-signal" : "text-ink-2 hover:text-foreground",
        )}
      >
        Skin&rsquo;s own
      </button>
      {ACCENT_PRESETS.map((p) => {
        const on = prefs.accent === p.hex;
        return (
          <Tip
            key={p.hex}
            type="button"
            aria-label={p.name}
            aria-pressed={on}
            label={p.name}
            onClick={() => {
              update({ accent: p.hex });
            }}
            className={cn(swatchClass, on && "ring-2 ring-foreground ring-offset-2 ring-offset-background dark:ring-foreground")}
            style={{ backgroundColor: p.hex }}
          />
        );
      })}
      <Tip
        label={custom ? `Custom colour ${prefs.accent ?? ""}` : "Any colour"}
        render={
          <label
            className={cn(
              swatchClass,
              "cursor-pointer bg-card-nested text-ink-2 hover:text-foreground",
              custom && "text-signal-ink ring-2 ring-foreground ring-offset-2 ring-offset-background dark:ring-foreground",
            )}
          />
        }
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
      </Tip>
    </div>
  );
}

/** Settings → Appearance (FR-SHELL-7): a preview, then theme, skin, accent and wallpaper. */
export function AppearanceSection() {
  const { prefs, update } = usePrefs();
  const bench = prefs.skin === "bench";

  return (
    <div className="flex flex-col gap-4">
      <Preview />

      <SettingsCard title="Colors">
        <SettingRow
          label="Theme"
          description={
            bench
              ? "Bench in light or dark graphite. System matches your device."
              : "Ember is light and warm. Nebula is dark teal. System matches your device."
          }
          layout="wide"
        >
          {() => <ThemeControl />}
        </SettingRow>
        <SettingRow label="Skin" description="Ember by day and Nebula by night, or Motion Garden's graphite Bench." layout="wide">
          {() => (
            <Segmented
              label="Skin"
              value={prefs.skin}
              options={SKIN_OPTIONS}
              onChange={(skin) => {
                update({ skin });
              }}
            />
          )}
        </SettingRow>
        <SettingRow label="Accent" description="Any colour. Its lightness is adjusted per theme so text in it stays readable." layout="stack">
          {() => <AccentControl />}
        </SettingRow>
      </SettingsCard>

      <WallpaperCard />
    </div>
  );
}

/** A compact dropdown, labelled by its setting row. */
function PrefSelect<T extends string>({
  labelId,
  value,
  options,
  onChange,
  className,
}: {
  labelId: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <Select
      items={options}
      value={value}
      onValueChange={(v) => {
        if (v) onChange(v);
      }}
    >
      <SelectTrigger aria-labelledby={labelId} className={cn("h-10 w-44 pl-3", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            <span>{o.label}</span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function usesAurora(pages: WallpaperPages): boolean {
  return Object.values(pages).includes("aurora");
}

/** The mini tab under Aurora: its light hangs from the top or rises from the bottom. */
function AuroraEdgeTab() {
  const { prefs, update } = usePrefs();
  return (
    <div className="flex items-center gap-2">
      <span aria-hidden className="text-[12px] text-ink-3">
        From
      </span>
      <Segmented
        size="sm"
        label="Aurora from"
        value={prefs.auroraEdge}
        options={AURORA_EDGE_OPTIONS}
        onChange={(auroraEdge) => {
          update({ auroraEdge });
        }}
      />
    </div>
  );
}

/** Settings → Appearance → Wallpaper (SPEC V64): which pages, which scene, and how far it reaches. */
function WallpaperCard() {
  const { prefs, update } = usePrefs();
  const scope = prefs.wallpaperScope;

  return (
    <SettingsCard title="Wallpaper">
      <SettingRow label="Show on" description="Home only, every page, or a different wallpaper for each page." layout="wide">
        {(labelId) => (
          <PrefSelect
            labelId={labelId}
            value={scope}
            options={SCOPE_OPTIONS}
            onChange={(wallpaperScope) => {
              // Switching to per page starts from what shows now, or keeps the picks already made.
              update(wallpaperScope === "pages" ? { wallpaperScope, wallpaperPages: seedPages(prefs) } : { wallpaperScope });
            }}
          />
        )}
      </SettingRow>

      {scope === "pages" ? (
        WALLPAPER_PAGE_LIST.map((page) => {
          const Icon = page.icon;
          return (
            <SettingRow
              key={page.id}
              label={
                <>
                  <Icon aria-hidden className="size-4 text-ink-2" strokeWidth={1.75} />
                  {page.title}
                </>
              }
            >
              {(labelId) => (
                <PrefSelect
                  labelId={labelId}
                  value={prefs.wallpaperPages[page.id] ?? "none"}
                  options={WALLPAPER_OPTIONS}
                  className="w-36"
                  onChange={(wallpaper) => {
                    update({ wallpaperPages: withPageWallpaper(prefs.wallpaperPages, page.id, wallpaper) });
                  }}
                />
              )}
            </SettingRow>
          );
        })
      ) : (
        <SettingRow
          label="Wallpaper"
          description={
            scope === "all"
              ? "Behind every page. It follows the skin and the accent."
              : "Behind the board on Home. It follows the skin and the accent."
          }
          layout="wide"
        >
          {() => (
            <div className="flex flex-col items-start gap-2 @lg:items-end">
              <Segmented
                label="Wallpaper"
                value={prefs.wallpaper}
                options={WALLPAPER_OPTIONS}
                onChange={(wallpaper) => {
                  update({ wallpaper });
                }}
              />
              {prefs.wallpaper === "aurora" ? <AuroraEdgeTab /> : null}
            </div>
          )}
        </SettingRow>
      )}

      {/* Per page, one edge for every page that shows Aurora: the mini tab gets its own row. */}
      {scope === "pages" && usesAurora(prefs.wallpaperPages) ? (
        <SettingRow label="Aurora" description="Where its light comes from, on every page that shows it.">
          {() => <AuroraEdgeTab />}
        </SettingRow>
      ) : null}

      <SettingRow label="Covers" description="Below the top bar keeps the header plain. Whole page runs the scene behind it too." layout="wide">
        {() => (
          <Segmented
            label="Wallpaper covers"
            value={prefs.wallpaperCover}
            options={COVER_OPTIONS}
            onChange={(wallpaperCover) => {
              update({ wallpaperCover });
            }}
          />
        )}
      </SettingRow>
    </SettingsCard>
  );
}

/** Settings → Timers. */
export function TimersSection() {
  return (
    <SettingsCard title="Repeats">
      <SettingRow
        label="Starting a length that's already running"
        description="One per length brings the running timer forward. Allow repeats starts another, numbered."
        layout="wide"
      >
        {() => <TimerModeSetting />}
      </SettingRow>
    </SettingsCard>
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
