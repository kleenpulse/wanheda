import { cleanText, segment } from "@/lib/reader/extract";

// Markdown to speakable sentences (SPEC V47), for notes read aloud. Ported
// from companion-tts `transform.ts` (its verbatim-to-speech contract): code
// is announced, tables are named, links keep their text and bare URLs become
// their hostname. Sentences are split the way the reader splits documents
// (`segment`, V44), so a unit never holds two sentences.
//
// Not ported: companion's length cap ("… and more.") and chunk packing. A
// note is read whole, and units are cut from sentences by the speech queue.

export interface TransformOptions {
  /** Announce stripped code fences as the phrase "Code block." */
  announceCode: boolean;
}

export const DEFAULT_TRANSFORM: TransformOptions = { announceCode: true };

/**
 * Targeted Windows-1252 mojibake repairs. These byte sequences never occur
 * in real prose, so applying them unconditionally is safe. A blanket
 * latin1 → utf8 round trip would corrupt correctly encoded text.
 */
const MOJIBAKE: [string, string][] = [
  ["â€”", "—"],
  ["â€“", "–"],
  ["â€œ", '"'],
  ["â€\u009d", '"'],
  ["â€™", "'"],
  ["â€˜", "'"],
  ["â€¦", "…"],
  ["â†’", " to "],
  ["Ã©", "é"],
  ["Ã¨", "è"],
  ["Ã¼", "ü"],
  ["Ã¶", "ö"],
  ["Ã¤", "ä"],
  ["Ã—", "×"],
  ["Â°", "°"],
  ["Â ", " "],
];

export function fixMojibake(text: string): string {
  let out = text;
  for (const [bad, good] of MOJIBAKE) {
    if (out.includes(bad)) out = out.split(bad).join(good);
  }
  return out;
}

function ensureTerminal(s: string): string {
  const t = s.trimEnd();
  if (!t) return t;
  return /[.!?…:;]$/.test(t) ? t : `${t}.`;
}

function stripFences(text: string, announce: boolean): string {
  const replacement = announce ? "\n\nCode block.\n\n" : "\n\n";
  let out = text.replace(/```[^\n]*\n[\s\S]*?```/g, replacement);
  // Unterminated fence: everything after it is code that never closed.
  const stray = out.indexOf("```");
  if (stray >= 0) out = out.slice(0, stray) + replacement;
  // Consecutive fences collapse to one announcement.
  if (announce) out = out.replace(/(Code block\.\s*){2,}/g, "Code block.\n\n");
  return out;
}

function stripTables(text: string): string {
  const out: string[] = [];
  let run: string[] = [];
  const isTableLine = (l: string) => (l.match(/\|/g) ?? []).length >= 2;
  const flush = () => {
    if (run.length >= 2) out.push("Table omitted.", "");
    else out.push(...run);
    run = [];
  };
  for (const line of text.split("\n")) {
    if (isTableLine(line)) {
      run.push(line);
    } else {
      flush();
      out.push(line);
    }
  }
  flush();
  return out.join("\n");
}

function transformLines(text: string): string {
  const lines = text.split("\n");
  return lines
    .map((line, i) => {
      const header = /^\s{0,3}#{1,6}\s+(.*)$/.exec(line);
      if (header) return ensureTerminal(header[1] ?? "");
      const l = line.replace(/^\s*>\s?/, "");
      const bullet = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/.exec(l);
      if (bullet) return ensureTerminal(bullet[1] ?? "");
      // A paragraph's last line ends its sentence even without punctuation
      // (a note's bare title line), or it would run into the next paragraph.
      const next = lines[i + 1];
      return next === undefined || next.trim() === "" ? ensureTerminal(l) : l;
    })
    .join("\n");
}

function lastSegment(p: string): string {
  const cleaned = p.replace(/[\\/]+$/, "");
  const idx = Math.max(cleaned.lastIndexOf("\\"), cleaned.lastIndexOf("/"));
  return idx >= 0 ? cleaned.slice(idx + 1) : cleaned;
}

function stripInline(text: string): string {
  let out = text;
  // images before links
  out = out.replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1");
  out = out.replace(/\[([^\]]*)\]\(([^)]+)\)/g, "$1");
  // bare URLs → hostname (a URL never ends in the punctuation that ends its sentence)
  out = out.replace(/https?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"]/g, (u) => {
    try {
      return new URL(u).hostname.replace(/^www\./, "");
    } catch {
      return "link";
    }
  });
  // inline code keeps its content
  out = out.replace(/`([^`\n]*)`/g, "$1");
  // file paths → basename (Windows drive paths, then posix paths with ≥ 2 separators)
  out = out.replace(/[A-Za-z]:\\[\w.\\ ()@-]+/g, (p) => lastSegment(p));
  out = out.replace(/(?<![\w/])(?:[\w.@()-]+\/){2,}[\w.@()-]+/g, (p) => lastSegment(p));
  // emphasis and strikethrough markers
  out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
  out = out.replace(/\*([^*\n]+)\*/g, "$1");
  out = out.replace(/__([^_]+)__/g, "$1");
  out = out.replace(/~~([^~]+)~~/g, "$1");
  // arrows read as "to"
  out = out.replace(/\s*(?:→|->|⇒|=>)\s*/g, " to ");
  // emoji and variation selectors
  out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu, "");
  return out;
}

/** A note's markdown as the sentences to read aloud, in order ([] = nothing to say). */
export function speakableSentences(markdown: string, opts: TransformOptions = DEFAULT_TRANSFORM): string[] {
  let text = fixMojibake(markdown.replace(/\r\n?/g, "\n"));
  text = stripFences(text, opts.announceCode);
  text = stripTables(text);
  text = transformLines(text);
  text = cleanText(stripInline(text)).trim();
  if (!/[\p{L}\p{N}]/u.test(text)) return [];
  return segment(text)
    .map(([a, b]) => text.slice(a, b))
    .filter((s) => /[\p{L}\p{N}]/u.test(s));
}
