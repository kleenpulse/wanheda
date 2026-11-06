"use client";

import * as React from "react";
import { toast } from "@/components/ui/toaster";
import { useSpeech, type SpeechSource } from "@/lib/speech/store";

/**
 * Says so in a toast when speech for this source fails (no voice, nothing to
 * read). Only a failure that happens while this surface is open: one already
 * in the store when it mounts was shown before.
 */
export function useSpeechError(kind: SpeechSource["kind"], id: string): void {
  const error = useSpeech((s) => (s.source?.kind === kind && s.source.id === id ? s.error : null));
  const seen = React.useRef(error);
  React.useEffect(() => {
    if (!error || error === seen.current) {
      seen.current = error;
      return;
    }
    seen.current = error;
    toast({ id: `speech:${kind}:${id}`, title: "Read aloud", body: error });
  }, [error, kind, id]);
}
