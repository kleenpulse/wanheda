import { createDevicePref } from "@/hooks/device-pref";

// What opening a video with a saved place does (Settings → Sound, per device
// like the rest of the media prefs): ask (the default: it opens paused there,
// with Resume and Start over), resume at once, or always start over.

export const RESUME_MODES = ["ask", "resume", "start"] as const;
export type ResumeMode = (typeof RESUME_MODES)[number];
export const DEFAULT_RESUME_MODE: ResumeMode = "ask";

export const RESUME_MODE_LABELS: Record<ResumeMode, string> = { ask: "Ask", resume: "Resume", start: "Start over" };

export function parseResumeMode(raw: string | null): ResumeMode {
  const v = raw?.trim();
  return (RESUME_MODES as readonly string[]).includes(v ?? "") ? (v as ResumeMode) : DEFAULT_RESUME_MODE;
}

export function serializeResumeMode(v: ResumeMode): string | null {
  return v === DEFAULT_RESUME_MODE ? null : v;
}

export const resumeModePref = createDevicePref<ResumeMode>("wanheda-video-resume", parseResumeMode, serializeResumeMode);
