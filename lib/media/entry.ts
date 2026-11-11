import { parseMediaUrl, type ParsedMediaUrl } from "./url";

// The one field on top of Media (user 2026-11-11: one box that knows which is
// which). Whatever is typed or pasted is read as one of four things: a link
// to add, a link that can't play, a file's path or name to look up, or words
// to search the library with. Pure: the field and the grid both read it.

export type MediaLink = Exclude<ParsedMediaUrl, { kind: "invalid" }>;

export type Entry =
  | { kind: "empty" }
  /** Words to find in the library. `from: "file"`: a pasted path, looked up by its file name. */
  | { kind: "search"; words: string[]; from: "words" | "file" }
  /** A link Wanheda can add (an allowlisted embed or a direct http(s) URL, V56). `text` is what was read: trimmed, without quotes. */
  | { kind: "link"; link: MediaLink; text: string }
  /** Written like a link, but not one that can play. */
  | { kind: "bad-link"; reason: string };

/** Lowercase and without accents, as both sides of a search are compared. */
export function foldText(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

/** `C:\Videos\a.mkv`, `\\nas\films\a.mkv`, `/home/me/a.mkv`, `file:///…`: a place on a disk, not a web link. */
const DISK_PATH = /^(?:[a-z]:[\\/]|\\\\|\/(?!\/)|~\/|file:)/i;
/** `https://…`, `ftp://…`: a scheme and two slashes. `Re:Zero` and `C:\…` are not. */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;
/** `youtu.be/abc`, `example.com/a.mp4`: a dotted host, then a path. A bare `night.harbor` or `film.mkv` is a name. */
const BARE_HOST = /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?::\d{1,5})?\//i;
/** `www.example.com`: written as an address, so read as one. */
const WWW_HOST = /^www\.[a-z0-9-]+(?:\.[a-z0-9-]+)+/i;
/** `localhost:8080/a.mkv`, `10.0.0.5/a.mp4`: this computer or the home network, which serve plain http. */
const LAN_HOST = /^(?:localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{1,5})?\//i;

function fileWords(path: string): string[] {
  let name = path.split(/[\\/]/).filter(Boolean).pop() ?? "";
  // A drive on its own ("C:\\") names no file.
  if (/^[a-z]:$/i.test(name)) return [];
  try {
    name = decodeURIComponent(name);
  } catch {
    // keep the raw name
  }
  // The name's own words: a library title has spaces where the file has dots.
  return foldText(name.replace(/\.[a-z0-9]{2,5}$/i, ""))
    .split(/[\s._]+/)
    .filter(Boolean);
}

/** A scheme-less address is a link when it points at something: a file (`/a.mp4`) or a query (`?v=…`). */
function namesMedia(url: string): boolean {
  const u = new URL(url);
  return u.search !== "" || /\.[a-z0-9]{2,5}$/i.test(u.pathname);
}

/** What the text in Media's field is. */
export function readEntry(raw: string): Entry {
  const typed = raw.trim().replace(/^"(.*)"$/, "$1").trim(); // Windows' "Copy as path" adds quotes
  if (!typed) return { kind: "empty" };
  const spaced = /\s/.test(typed);
  // "localhost:8080/…" would read as a scheme named localhost: give a local address its http.
  const text = !spaced && !HAS_SCHEME.test(typed) && LAN_HOST.test(typed) ? `http://${typed}` : typed;

  if (DISK_PATH.test(text)) {
    const words = fileWords(text);
    return words.length > 0 ? { kind: "search", words, from: "file" } : { kind: "empty" };
  }

  // A scheme makes it a link whatever follows (a pasted URL may hold a space).
  const sure = HAS_SCHEME.test(text) || (!spaced && WWW_HOST.test(text));
  if (sure || (!spaced && BARE_HOST.test(text))) {
    const link = parseMediaUrl(text);
    if (link.kind === "invalid") {
      if (sure) return { kind: "bad-link", reason: link.reason };
    } else if (sure || link.kind === "embed" || namesMedia(link.url)) {
      return { kind: "link", link, text };
    }
    // "Night.Harbor/Season": dots and a slash, but no site Wanheda knows and no file. A name.
  }

  return { kind: "search", words: foldText(text).split(/\s+/).filter(Boolean), from: "words" };
}
