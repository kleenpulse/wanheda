"use client";

import * as React from "react";
import type { Route } from "next";
import { usePathname, useRouter } from "next/navigation";
import { Gauge, LoaderCircle, Moon, Pause, Play, SkipBack, SkipForward, Square, UserRound } from "lucide-react";
import { useVoiceManager } from "@/components/settings/voice-manager";
import { pushUrl } from "@/hooks/use-url-param";
import { SPEEDS } from "@/lib/speech/prefs";
import { nextSleep, sleepLabel } from "@/lib/speech/sleep";
import { useSpeech } from "@/lib/speech/store";
import { catalogVoice } from "@/lib/speech/voices";
import { cn } from "@/lib/utils";

// The speech controls shared by the island's speech card and the read-aloud
// mini window (V49): play|pause, prev|next sentence, stop, and chips for
// speed, voice and the sleep timer. Every control acts on the speech store at
// once; the engine catches up. Chips cycle through their choices with one
// press, so they work inside the island, where a menu would close it.

export type ControlTone = "island" | "surface";

/**
 * Goes back to what is being read. Already on that app, the view follows the
 * param in place (as the palette does), so the page isn't navigated again.
 */
export function useOpenSpeechSource(): (href: string) => void {
  const router = useRouter();
  const pathname = usePathname();
  return React.useCallback(
    (href: string) => {
      // Already showing it: a second, identical history entry would make Back take two presses.
      if (href === window.location.pathname + window.location.search) return;
      if (href.split("?")[0] === pathname) pushUrl(href);
      else router.push(href as Route);
    },
    [router, pathname],
  );
}

const ROUND = "grid shrink-0 place-items-center rounded-full outline-none transition-[background-color,transform] duration-150 active:scale-90 disabled:pointer-events-none disabled:opacity-40";

const TONES = {
  island: {
    plain: "bg-island-foreground/12 text-island-foreground hover:bg-island-foreground/20 focus-visible:ring-2 focus-visible:ring-island-foreground/70",
    main: "bg-signal/20 text-signal hover:bg-signal/30 focus-visible:ring-2 focus-visible:ring-island-foreground/70",
    chip: "bg-island-foreground/10 text-island-foreground/85 hover:bg-island-foreground/18 focus-visible:ring-2 focus-visible:ring-island-foreground/70",
    on: "bg-signal/20 text-signal hover:bg-signal/30 focus-visible:ring-2 focus-visible:ring-island-foreground/70",
  },
  surface: {
    plain: "bg-muted text-foreground hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring",
    main: "bg-signal-soft text-signal-ink hover:bg-signal/20 focus-visible:ring-2 focus-visible:ring-ring",
    chip: "bg-muted text-ink-2 hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring",
    on: "bg-signal-soft text-signal-ink hover:bg-signal/20 focus-visible:ring-2 focus-visible:ring-ring",
  },
} as const;

export function Round({ label, onClick, tone, kind = "plain", big = false, disabled = false, children }: {
  label: string;
  onClick: () => void;
  tone: ControlTone;
  kind?: "plain" | "main";
  big?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(ROUND, TONES[tone][kind], big ? "size-12 [&_svg]:size-5" : "size-10 [&_svg]:size-4")}
    >
      {children}
    </button>
  );
}

/** Prev, play|pause, next and stop. */
export function SpeechTransport({ tone }: { tone: ControlTone }) {
  const status = useSpeech((s) => s.status);
  const waiting = useSpeech((s) => s.waiting);
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const { prev, next, toggle, stop } = useSpeech.getState();
  const idle = status === "idle";
  const playing = status === "playing";

  return (
    <div className="flex items-center gap-2">
      <Round label="Previous sentence" tone={tone} disabled={idle || sentence === 0} onClick={prev}>
        <SkipBack aria-hidden className="fill-current" />
      </Round>
      <Round label={playing ? "Pause reading" : "Resume reading"} tone={tone} kind="main" big disabled={idle} onClick={toggle}>
        {playing && waiting ? (
          <LoaderCircle aria-hidden className="animate-spin motion-reduce:animate-none" />
        ) : playing ? (
          <Pause aria-hidden className="fill-current" />
        ) : (
          <Play aria-hidden className="translate-x-px fill-current" />
        )}
      </Round>
      <Round label="Next sentence" tone={tone} disabled={idle || sentence >= total - 1} onClick={next}>
        <SkipForward aria-hidden className="fill-current" />
      </Round>
      <Round label="Stop reading" tone={tone} disabled={idle} onClick={stop}>
        <Square aria-hidden className="fill-current" />
      </Round>
    </div>
  );
}

export function Chip({ label, onClick, tone, on = false, disabled = false, children }: {
  label: string;
  onClick: () => void;
  tone: ControlTone;
  on?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex h-8 min-w-0 items-center gap-1.5 rounded-full px-3 text-[12px] font-medium outline-none transition-[background-color,transform] duration-150 active:scale-95 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-3.5 [&_svg]:shrink-0",
        TONES[tone][on ? "on" : "chip"],
      )}
    >
      {children}
    </button>
  );
}

const speedLabel = (rate: number) => `${String(rate)}×`;

/** The voices on this device, loaded once a view needs them. */
function useInstalledVoices(): readonly string[] | null {
  const installed = useVoiceManager((s) => s.installed);
  const deleting = useVoiceManager((s) => s.deleting);
  React.useEffect(() => {
    if (useVoiceManager.getState().installed === null) void useVoiceManager.getState().refresh();
  }, []);
  return React.useMemo(() => installed?.filter((id) => !deleting.includes(id)) ?? null, [installed, deleting]);
}

/** Speed, voice and sleep chips. `now` ticks the sleep timer's clock. */
export function SpeechOptions({ tone, now }: { tone: ControlTone; now: number }) {
  const status = useSpeech((s) => s.status);
  const rate = useSpeech((s) => s.rate);
  const voice = useSpeech((s) => s.voice);
  const engine = useSpeech((s) => s.engine);
  const sleep = useSpeech((s) => s.sleep);
  const hasChapters = useSpeech((s) => s.chapters.length > 0);
  const voices = useInstalledVoices();
  const idle = status === "idle";

  const nextRate = SPEEDS.find((s) => s > rate) ?? SPEEDS[0];
  const piper = voices?.filter((id) => catalogVoice(id)) ?? [];
  const voiceName = engine === "webspeech" || piper.length === 0 ? "Browser voice" : (catalogVoice(voice)?.name ?? voice);
  const nextVoice = piper.length > 1 ? piper[(piper.indexOf(voice) + 1) % piper.length] : undefined;
  const sleepNext = nextSleep(sleep, hasChapters);
  const sleepName = sleep ? sleepLabel(sleep, now) : "Sleep";

  return (
    <div className="flex min-w-0 flex-wrap items-center gap-1.5">
      <Chip
        tone={tone}
        disabled={idle}
        label={`Speed ${speedLabel(rate)}, change to ${speedLabel(nextRate)}`}
        onClick={() => {
          useSpeech.getState().setRate(nextRate);
        }}
      >
        <Gauge aria-hidden />
        <span className="tabular">{speedLabel(rate)}</span>
      </Chip>
      <Chip
        tone={tone}
        disabled={idle || nextVoice === undefined}
        label={nextVoice ? `Voice ${voiceName}, change to ${catalogVoice(nextVoice)?.name ?? nextVoice}` : `Voice ${voiceName}`}
        onClick={() => {
          if (nextVoice) useSpeech.getState().setVoice(nextVoice);
        }}
      >
        <UserRound aria-hidden />
        <span className="truncate">{voiceName}</span>
      </Chip>
      <Chip
        tone={tone}
        on={sleep !== null}
        disabled={idle}
        label={`Sleep timer ${sleep ? sleepName : "off"}, change to ${sleepNext === null ? "off" : sleepNext.kind === "chapter" ? "end of chapter" : `${String(sleepNext.minutes)} minutes`}`}
        onClick={() => {
          useSpeech.getState().setSleep(sleepNext);
        }}
      >
        <Moon aria-hidden />
        <span className={cn(sleep?.kind === "minutes" && "tabular")}>{sleepName}</span>
      </Chip>
    </div>
  );
}

/** "Sentence 12 of 340". */
export function speechProgress(sentence: number, total: number): string {
  return `Sentence ${String(Math.min(total, sentence + 1))} of ${String(total)}`;
}
