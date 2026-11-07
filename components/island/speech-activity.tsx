"use client";

import { AudioLines, Pause } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { IslandButton } from "@/components/island/money-alert-activity";
import { SpeechOptions, SpeechTransport, speechProgress, useOpenSpeechSource } from "@/components/speech/speech-controls";
import { ProgressRing } from "@/components/ui/progress-ring";
import { spokenText, useSpeech } from "@/lib/speech/store";
import { cn } from "@/lib/utils";

// The island's `speech` activity (V49): what is being read and how far, with
// the shared controls. Live while the speech store isn't idle; every view
// reads the store, so the pill, the card and the reader never disagree.

export const SPEECH_ACTIVITY = "speech";

const share = (sentence: number, total: number) => (total > 0 ? Math.min(1, (sentence + 1) / total) : 0);

function SpeechLeading() {
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const paused = useSpeech((s) => s.status === "paused");
  return (
    <ProgressRing value={share(sentence, total)}>
      {paused ? <Pause aria-hidden className="size-3 fill-current" /> : <AudioLines aria-hidden className="size-3" />}
    </ProgressRing>
  );
}

function SpeechTrailing() {
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const paused = useSpeech((s) => s.status === "paused");
  return <span className={cn("tabular text-sm font-semibold", paused ? "text-island-foreground/60" : "text-signal")}>{`${String(Math.round(share(sentence, total) * 100))}%`}</span>;
}

function SpeechStatusText() {
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const paused = useSpeech((s) => s.status === "paused");
  return `, ${paused ? "paused" : "reading"}, ${speechProgress(sentence, total).toLowerCase()}`;
}

function SpeechCard() {
  const { now, collapse } = useIsland();
  const open = useOpenSpeechSource();
  const source = useSpeech((s) => s.source);
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  if (!source) return null;
  const text = spokenText(sentence);

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-island-foreground/70">{source.kind === "note" ? "Reading a note" : "Reading aloud"}</p>
        <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{source.title}</p>
        <p className="tabular mt-1 text-xs text-island-foreground/70">{speechProgress(sentence, total)}</p>
        {text ? <p className="mt-2 line-clamp-2 text-[13px] leading-snug text-island-foreground/85">{text}</p> : null}
      </div>
      <SpeechTransport tone="island" />
      <SpeechOptions tone="island" now={now} />
      {source.href ? (
        <div className="flex">
          <IslandButton
            onClick={() => {
              collapse();
              if (source.href) open(source.href);
            }}
          >
            Open
          </IslandButton>
        </div>
      ) : null}
    </div>
  );
}

/** The activity for the current speech. */
export function speechActivity(title: string): IslandActivity {
  return {
    id: SPEECH_ACTIVITY,
    label: title,
    status: <SpeechStatusText />,
    leading: <SpeechLeading />,
    trailing: <SpeechTrailing />,
    expanded: <SpeechCard />,
  };
}
