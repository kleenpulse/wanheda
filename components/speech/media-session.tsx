"use client";

import * as React from "react";
import { mediaSession, type SessionClaim } from "@/lib/media/session-owner";
import { useSpeech } from "@/lib/speech/store";

// The Media Session for speech (V49, V60): the OS media keys, headset buttons
// and the lock screen steer the speech store, and show the document's title.
// Previous and next track step a sentence. Speech claims the session through
// the tab's arbiter, so it never fights video or music for it: the last to
// start owns the keys, and starting pauses the others. Mounted once, in the shell.

function speechClaim(title: string, kind: string | null): SessionClaim {
  const speech = () => useSpeech.getState();
  return {
    id: "speech",
    metadata: { title, artist: kind === "note" ? "Note, read aloud" : "Read aloud", album: "Wanheda" },
    handlers: {
      play: () => {
        speech().resume();
      },
      pause: () => {
        speech().pause();
      },
      stop: () => {
        speech().stop();
      },
      previoustrack: () => {
        speech().prev();
      },
      seekbackward: () => {
        speech().prev();
      },
      nexttrack: () => {
        speech().next();
      },
      seekforward: () => {
        speech().next();
      },
    },
    pause: () => {
      if (speech().status === "playing") speech().pause();
    },
  };
}

export function SpeechMediaSession() {
  const live = useSpeech((s) => s.status !== "idle");
  const title = useSpeech((s) => s.source?.title ?? null);
  const kind = useSpeech((s) => s.source?.kind ?? null);
  const status = useSpeech((s) => s.status);
  const was = React.useRef(status);

  // Held while speech is live, not per title: a release plays again what speech
  // paused (V60), so a new document mid-speech must not let go in between.
  React.useEffect(() => {
    if (!live) return;
    return () => {
      mediaSession.release("speech");
    };
  }, [live]);

  // A new title refreshes the claim in place.
  React.useEffect(() => {
    if (!live || title === null) return;
    mediaSession.claim(speechClaim(title, kind), false);
  }, [live, title, kind]);

  // After the claim above. Starting to speak takes the keys and pauses the
  // others (V60); a pause keeps the claim so the keys can resume it.
  React.useEffect(() => {
    if (!live || title === null) return;
    if (status === "playing" && was.current !== "playing") mediaSession.claim(speechClaim(title, kind), true);
    was.current = status;
    mediaSession.setState("speech", status === "playing" ? "playing" : "paused");
  }, [live, status, title, kind]);

  return null;
}
