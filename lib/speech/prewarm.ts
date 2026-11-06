import type { DocKind } from "@/lib/reader/reader";
import { piper } from "./piper";
import { useSpeech } from "./store";
import { isInstalled } from "./voices";

// Pre-warm (SPEC V45, owner 2026-11-06): loading a voice takes ≈ 2–3 s, so
// a reader open on a document speech can read loads it ahead, at idle, once
// the document's text has settled. The press → first audio exit (V50) is
// measured that way. The voice doesn't depend on the document, so a new
// document's first open warms it too. EPUB has no read-along yet (T59).

const SPEAKABLE: ReadonlySet<DocKind> = new Set<DocKind>(["pdf", "md", "txt"]);

/** A reader is open on `kind`: keeps the engine from its idle release. Returns the release. */
export function holdVoiceForReader(kind: DocKind): () => void {
  return SPEAKABLE.has(kind) ? piper.hold() : () => undefined;
}

/** Loads the chosen Piper voice at idle, if it's on this device. Quiet on failure: play reports it. */
export function prewarmVoice(kind: DocKind): void {
  if (!SPEAKABLE.has(kind) || typeof window === "undefined") return;
  const run = () => {
    const { voice } = useSpeech.getState();
    void isInstalled(voice)
      .then((here) => (here ? piper.warm(voice) : undefined))
      .catch(() => undefined);
  };
  if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 5000 });
  else window.setTimeout(run, 0);
}
