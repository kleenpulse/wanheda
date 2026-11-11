"use client";

import * as React from "react";
import { seedFromDevice, useAccountVoices } from "@/components/settings/account-voices";
import { formatBytes, useVoiceManager } from "@/components/settings/voice-manager";
import { toast } from "@/components/ui/toaster";
import { deviceScope } from "@/lib/device/scope";
import { bytesOf, missingVoices, offerKey, voiceNames } from "@/lib/speech/account-voices";
import type { CatalogVoice } from "@/lib/speech/voices";

// "Get your voices" (SPEC V83): on a device that lacks some of the voices the
// owner keeps, one toast a session offers to fetch them, with their size (the
// owner's link is metered: nothing downloads unless asked). "Not now" (the ×)
// keeps it away on this device until the set changes. Settings → Voices shows
// the same offer for as long as anything is missing (VoiceOfferRow).

/** Waits this long after the shell mounts: the offer never competes with first paint. */
const OFFER_DELAY_MS = 2_500;
const DISMISSED_KEY = "wanheda-voice-offer-dismissed";
const TOAST_ID = "voice-offer";

export function opfsAvailable(): boolean {
  return typeof navigator !== "undefined" && typeof navigator.storage?.getDirectory === "function";
}

/** The account's voices this device doesn't hold and isn't fetching; null until both lists are known. */
export function useMissingVoices(): CatalogVoice[] | null {
  const account = useAccountVoices((s) => s.voices);
  const installed = useVoiceManager((s) => s.installed);
  const downloads = useVoiceManager((s) => s.downloads);
  return React.useMemo(() => {
    if (!account || !installed) return null;
    // A failed download stays offered: its row shows Retry, the offer can fetch it again.
    const fetching = Object.values(downloads).filter((d) => d.phase !== "failed").map((d) => d.id);
    return missingVoices(account, installed, fetching);
  }, [account, installed, downloads]);
}

export function getVoices(voices: readonly CatalogVoice[]): void {
  const { download } = useVoiceManager.getState();
  for (const v of voices) download(v.id);
}

function dismissedKeys(): Record<string, string> {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "{}");
    return raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, string>) : {};
  } catch {
    return {};
  }
}

function dismiss(user: string, key: string): void {
  try {
    localStorage.setItem(DISMISSED_KEY, JSON.stringify({ ...dismissedKeys(), [user]: key }));
  } catch {
    // Private window: the offer comes back next session, which is fine.
  }
}

/** Mounted once in the shell. Renders nothing; reads after paint, offers once a tab. */
export function VoiceOffer() {
  const [ready, setReady] = React.useState(false);
  const installed = useVoiceManager((s) => s.installed);
  const account = useAccountVoices((s) => s.voices);
  const missing = useMissingVoices();
  const offered = React.useRef(false);

  React.useEffect(() => {
    if (!deviceScope()?.userId || !opfsAvailable()) return;
    const timer = setTimeout(() => {
      void useAccountVoices.getState().load();
      if (useVoiceManager.getState().installed === null) void useVoiceManager.getState().refresh();
      setReady(true);
    }, OFFER_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, []);

  React.useEffect(() => {
    if (ready && account && installed) seedFromDevice(installed);
  }, [ready, account, installed]);

  React.useEffect(() => {
    const user = deviceScope()?.userId;
    if (!ready || offered.current || !user || !missing || missing.length === 0) return;
    const key = offerKey(missing);
    if (dismissedKeys()[user] === key) return;
    offered.current = true;
    const voices = missing;
    toast({
      id: TOAST_ID,
      title: voices.length === 1 ? "Get your voice on this device?" : `Get your ${String(voices.length)} voices on this device?`,
      body: `${voiceNames(voices)} · ${formatBytes(bytesOf(voices))}. Read aloud uses them offline.`,
      action: {
        label: voices.length === 1 ? "Get it" : "Get them",
        onClick: () => {
          getVoices(voices);
        },
      },
      closeLabel: "Not now",
      onClose: () => {
        dismiss(user, key);
      },
    });
  }, [ready, missing]);

  return null;
}
