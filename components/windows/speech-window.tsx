"use client";

import Link from "next/link";
import { SpeechOptions, SpeechTransport, speechProgress, useOpenSpeechSource } from "@/components/speech/speech-controls";
import { useNow } from "@/hooks/use-now";
import { spokenText, useSpeech } from "@/lib/speech/store";

const TICK_MS = 1000;

/**
 * The read-aloud mini window (V49): what is being read, the sentence being
 * spoken, and the shared controls. It reads the same store as the island and
 * the reader, so the three never disagree.
 */
export function SpeechWindow() {
  const now = useNow(TICK_MS);
  const open = useOpenSpeechSource();
  const status = useSpeech((s) => s.status);
  const source = useSpeech((s) => s.source);
  const sentence = useSpeech((s) => s.sentence);
  const total = useSpeech((s) => s.total);
  const idle = status === "idle" || !source;
  const text = idle ? "" : spokenText(sentence);

  return (
    <div className="flex min-h-full flex-col gap-4 p-4 pb-5">
      {idle ? (
        <p className="text-[13px] text-ink-2">
          Nothing is being read. Open a document in the{" "}
          <Link href="/reader" className="text-signal-ink underline-offset-2 hover:underline dark:text-signal">
            Reader
          </Link>{" "}
          and press Read aloud, or read a note from its editor.
        </p>
      ) : (
        <div className="min-w-0">
          <p className="readout">{source.kind === "note" ? "Note" : "Reading"}</p>
          {source.href ? (
            <button
              type="button"
              onClick={() => {
                if (source.href) open(source.href);
              }}
              className="mt-1 block max-w-full truncate text-left text-[15px] font-semibold text-foreground underline-offset-2 outline-none hover:underline focus-visible:underline"
            >
              {source.title}
            </button>
          ) : (
            <p className="mt-1 truncate text-[15px] font-semibold text-foreground">{source.title}</p>
          )}
          <p className="tabular mt-0.5 text-[12px] text-ink-2">{speechProgress(sentence, total)}</p>
          {text ? <p className="mt-3 line-clamp-3 text-[13px] leading-snug text-ink-2">{text}</p> : null}
        </div>
      )}
      <div className="mt-auto flex flex-col gap-3">
        <SpeechTransport tone="surface" wheel={false} />
        <SpeechOptions tone="surface" now={now ?? 0} />
      </div>
    </div>
  );
}
