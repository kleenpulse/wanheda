// SRT → WebVTT (V57), so a sidecar .srt plays through a native `<track>`.
// Cue text stays text: the `<track>` element renders VTT cue text, never HTML,
// and anything that looks like markup other than b|i|u is escaped. A malformed
// cue is skipped; the conversion never throws.

const TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;
const ARROW = new RegExp(`^\\s*${TIME.source}\\s*-->\\s*${TIME.source}`);

function vttTime(h: string, m: string, s: string, ms: string): string {
  return `${h.padStart(2, "0")}:${m}:${s}.${ms.padEnd(3, "0")}`;
}

function escapeCue(line: string): string {
  return line
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/&lt;(\/?)([biu])&gt;/gi, (_m, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`);
}

export function srtToVtt(srt: string): string {
  const text = srt.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const blocks = text.split(/\n{2,}/);
  const cues: string[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").filter((l, i, all) => !(l.trim() === "" && (i === 0 || i === all.length - 1)));
    const at = lines.findIndex((l) => ARROW.test(l));
    // A timing line must be the first or second line (after the cue number).
    if (at < 0 || at > 1) continue;
    const m = ARROW.exec(lines[at] ?? "");
    if (!m) continue;
    const [, h1, m1, s1, ms1, h2, m2, s2, ms2] = m as unknown as [string, string, string, string, string, string, string, string, string];
    const body = lines.slice(at + 1).filter((l) => l.trim() !== "");
    if (body.length === 0) continue;
    cues.push(`${vttTime(h1, m1, s1, ms1)} --> ${vttTime(h2, m2, s2, ms2)}\n${body.map(escapeCue).join("\n")}`);
  }
  return `WEBVTT\n\n${cues.join("\n\n")}${cues.length ? "\n" : ""}`;
}
