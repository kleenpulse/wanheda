"use client";

import * as React from "react";
import { Camera, Captions, CaptionsOff, FilePlus2, Gauge, Keyboard, Settings2, Type } from "lucide-react";
import {
  Menu,
  MenuCheckboxItem,
  MenuContent,
  MenuItem,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSubmenu,
  MenuSubmenuTrigger,
  MenuTrigger,
} from "@/components/ui/menu";
import { Tip } from "@/components/ui/tooltip";
import { autoplayPref, CAPTION_SIZE_LABELS, CAPTION_SIZES, captionSizePref, type CaptionSize } from "@/lib/media/cinema";
import { cn } from "@/lib/utils";
import { PLAYER_SPEEDS, setElementRate, usePlayer } from "./player-store";

// The player's two menus (T72): subtitles and settings. Both render inside
// the player's frame (`container`), so they still show while it fills the
// screen; the chrome counts them open so it never hides under one.

export const CHROME_BUTTON =
  "grid size-9 shrink-0 place-items-center rounded-full text-island-foreground/85 outline-none transition-[background-color,color,transform] duration-150 hover:bg-island-foreground/12 hover:text-island-foreground focus-visible:ring-2 focus-visible:ring-island-foreground/70 active:scale-90 disabled:pointer-events-none disabled:opacity-40 data-popup-open:bg-island-foreground/15 data-popup-open:text-island-foreground [&_svg]:size-5";

const speedLabel = (s: number) => (s === 1 ? "Normal" : `${String(s)}×`);

/** The subtitle tracks a viewer can pick: the file's own and any added. */
function subtitleTracks(el: HTMLVideoElement): TextTrack[] {
  return Array.from(el.textTracks).filter((t) => t.kind === "subtitles" || t.kind === "captions");
}

function trackName(t: TextTrack, i: number): string {
  return t.label || (t.language ? t.language.toUpperCase() : `Track ${String(i + 1)}`);
}

export function SubtitlesMenu({
  el,
  container,
  onOpenChange,
  onAddFile,
}: {
  el: HTMLVideoElement;
  container: HTMLElement | null;
  onOpenChange: (open: boolean) => void;
  onAddFile: () => void;
}) {
  const track = usePlayer((s) => s.track);
  const tracks = subtitleTracks(el);
  const value = track ? String(tracks.indexOf(track)) : "off";
  return (
    <Menu onOpenChange={onOpenChange}>
      <Tip
        label={track ? "Subtitles (on)" : "Subtitles"}
        render={<MenuTrigger aria-label="Subtitles" aria-keyshortcuts="c" className={cn(CHROME_BUTTON, track && "text-island-foreground")} />}
      >
        {track ? <Captions aria-hidden className="fill-island-foreground/20" /> : <CaptionsOff aria-hidden />}
      </Tip>
      <MenuContent side="top" align="end" container={container} className="min-w-60">
        <MenuRadioGroup
          value={value}
          onValueChange={(v: string) => {
            usePlayer.getState().setTrack(v === "off" ? null : (tracks[Number(v)] ?? null));
          }}
        >
          <MenuRadioItem value="off">Off</MenuRadioItem>
          {tracks.map((t, i) => (
            <MenuRadioItem key={`${String(i)}:${t.label}`} value={String(i)}>
              <span className="truncate">{trackName(t, i)}</span>
            </MenuRadioItem>
          ))}
        </MenuRadioGroup>
        <MenuSeparator />
        <MenuItem onClick={onAddFile}>
          <FilePlus2 aria-hidden />
          Add a subtitle file…
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}

export function SettingsMenu({
  el,
  rate,
  container,
  canSaveFrame,
  onOpenChange,
  onSaveFrame,
  onShortcuts,
}: {
  el: HTMLVideoElement;
  rate: number;
  container: HTMLElement | null;
  /** False for a link from another site: its frames can't be read (a tainted canvas). */
  canSaveFrame: boolean;
  onOpenChange: (open: boolean) => void;
  onSaveFrame: () => void;
  onShortcuts: () => void;
}) {
  const size = captionSizePref.use();
  const autoplay = autoplayPref.use();
  return (
    <Menu onOpenChange={onOpenChange}>
      <Tip label="Settings" render={<MenuTrigger aria-label="Settings" className={CHROME_BUTTON} />}>
        <Settings2 aria-hidden />
      </Tip>
      <MenuContent side="top" align="end" container={container} className="min-w-64">
        <MenuSubmenu>
          <MenuSubmenuTrigger>
            <Gauge aria-hidden />
            Speed
            <span className="tabular ml-auto text-ink-2">{speedLabel(rate)}</span>
          </MenuSubmenuTrigger>
          <MenuContent side="left" align="end" sideOffset={6} container={container} className="min-w-40">
            <MenuRadioGroup
              value={String(rate)}
              onValueChange={(v: string) => {
                setElementRate(el, Number(v));
              }}
            >
              {PLAYER_SPEEDS.map((s) => (
                <MenuRadioItem key={s} value={String(s)}>
                  <span className="tabular">{speedLabel(s)}</span>
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </MenuSubmenu>
        <MenuSubmenu>
          <MenuSubmenuTrigger>
            <Type aria-hidden />
            Subtitle size
            <span className="ml-auto text-ink-2">{CAPTION_SIZE_LABELS[size]}</span>
          </MenuSubmenuTrigger>
          <MenuContent side="left" align="end" sideOffset={6} container={container} className="min-w-40">
            <MenuRadioGroup
              value={size}
              onValueChange={(v: string) => {
                if ((CAPTION_SIZES as readonly string[]).includes(v)) captionSizePref.set(v as CaptionSize);
              }}
            >
              {CAPTION_SIZES.map((s) => (
                <MenuRadioItem key={s} value={s}>
                  {CAPTION_SIZE_LABELS[s]}
                </MenuRadioItem>
              ))}
            </MenuRadioGroup>
          </MenuContent>
        </MenuSubmenu>
        <MenuCheckboxItem
          checked={autoplay}
          onCheckedChange={(on: boolean) => {
            autoplayPref.set(on);
          }}
        >
          Play the next video automatically
        </MenuCheckboxItem>
        <MenuSeparator />
        <MenuItem disabled={!canSaveFrame} onClick={onSaveFrame}>
          <Camera aria-hidden />
          {canSaveFrame ? "Save this frame" : "Can't save frames from links"}
        </MenuItem>
        <MenuItem onClick={onShortcuts}>
          <Keyboard aria-hidden />
          Keyboard shortcuts
          <span className="ml-auto font-mono text-[11px] text-ink-3">?</span>
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
