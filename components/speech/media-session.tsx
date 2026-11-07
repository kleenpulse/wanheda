"use client";

import * as React from "react";
import { useSpeech } from "@/lib/speech/store";

// The Media Session for speech (V49): the OS media keys, headset buttons and
// the lock screen steer the speech store, and show the document's title.
// Previous and next track step a sentence. Mounted once, in the shell.

const ACTIONS: readonly MediaSessionAction[] = ["play", "pause", "stop", "previoustrack", "nexttrack", "seekbackward", "seekforward"];

function handle(action: MediaSessionAction): void {
  const speech = useSpeech.getState();
  if (action === "play") speech.resume();
  else if (action === "pause") speech.pause();
  else if (action === "stop") speech.stop();
  else if (action === "previoustrack" || action === "seekbackward") speech.prev();
  else speech.next();
}

export function SpeechMediaSession() {
  const live = useSpeech((s) => s.status !== "idle");
  const title = useSpeech((s) => s.source?.title ?? null);
  const kind = useSpeech((s) => s.source?.kind ?? null);
  const status = useSpeech((s) => s.status);

  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !live || title === null) return;
    const session = navigator.mediaSession;
    session.metadata = new MediaMetadata({ title, artist: kind === "note" ? "Note, read aloud" : "Read aloud", album: "Wanheda" });
    for (const action of ACTIONS) {
      try {
        session.setActionHandler(action, () => {
          handle(action);
        });
      } catch {
        // This browser doesn't offer the action.
      }
    }
    return () => {
      session.metadata = null;
      session.playbackState = "none";
      for (const action of ACTIONS) {
        try {
          session.setActionHandler(action, null);
        } catch {
          // Not offered: nothing was set.
        }
      }
    };
  }, [live, title, kind]);

  // After the effect above: a new source mid-speech re-runs it, and its
  // cleanup resets the state to "none", so this must run again too.
  React.useEffect(() => {
    if (!("mediaSession" in navigator) || !live || title === null) return;
    navigator.mediaSession.playbackState = status === "playing" ? "playing" : "paused";
  }, [live, status, title, kind]);

  return null;
}
