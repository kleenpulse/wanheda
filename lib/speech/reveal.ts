// Ported from companion-tts `revealEdge` (shared/format.ts). How much of a
// unit's text to show, from the fraction of its audio played: it leads
// playback by one unit (so a word lights as it starts), shows nothing before
// playback starts, and latches full once the audio has ended. Pair it with
// Array.from(text) so a surrogate pair is never split. Word-level highlight
// is T59; sentence highlight (V48) needs none of this.

export function revealEdge(frac: number, total: number, ended: boolean): number {
  if (ended) return total;
  return frac > 0 ? Math.min(Math.floor(frac * total) + 1, total) : 0;
}
