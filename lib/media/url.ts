// Media URLs and embeds (V56). A pasted link becomes either an embed from the
// allowlist (YouTube via youtube-nocookie, Vimeo, SoundCloud, Spotify), whose
// iframe src is rebuilt from the provider id and never from the raw URL, or a
// direct http(s) media URL the browser plays itself. Nothing else is framed.

import type { MediaKind } from "./types";

export type EmbedProvider = "youtube" | "vimeo" | "soundcloud" | "spotify";

export type ParsedMediaUrl =
  | {
      kind: "embed";
      provider: EmbedProvider;
      /** The provider id: "dQw4w9WgXcQ", "76979871", "artist/track", "track:4uLU6hMCjMI75M1A2tKUQC". */
      id: string;
      /** Identity key (V54): `<provider>:<id>`. */
      fp: string;
      /** The iframe src, built from the id. */
      embedSrc: string;
      /** A canonical page URL for the item, built from the id. */
      pageUrl: string;
      mediaKind: MediaKind;
      /** Start offset from the link (`t=90`), if any. */
      startS: number | null;
    }
  | {
      kind: "url";
      /** Normalised http(s) URL: also the identity key (V54). */
      url: string;
      fp: string;
      mediaKind: MediaKind;
      /** Last path segment, decoded, for a first title. */
      name: string;
    }
  | { kind: "invalid"; reason: string };

const YT_ID = /^[A-Za-z0-9_-]{11}$/;
const VIMEO_ID = /^\d{1,12}$/;
const VIMEO_HASH = /^[0-9a-f]{6,20}$/;
const SC_PART = /^[A-Za-z0-9_-]{1,100}$/;
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;
const SPOTIFY_TYPES = new Set(["track", "album", "playlist", "episode", "show", "artist"]);

const AUDIO_EXT = new Set(["mp3", "m4a", "aac", "flac", "wav", "ogg", "oga", "opus", "weba"]);

/** `90`, `90s`, `1m30s`, `1h2m3s` → seconds; anything else → null. */
export function parseStart(raw: string | null): number | null {
  if (!raw) return null;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  if (!m) return null;
  const [, h, min, s] = m;
  if (!h && !min && !s) return null;
  return Number(h ?? 0) * 3600 + Number(min ?? 0) * 60 + Number(s ?? 0);
}

function host(u: URL): string {
  return u.hostname.toLowerCase().replace(/^(www|m|music)\./, "");
}

function youtube(u: URL): ParsedMediaUrl | null {
  const h = host(u);
  const parts = u.pathname.split("/").filter(Boolean);
  let id: string | undefined;
  if (h === "youtu.be") id = parts[0];
  else if (h === "youtube.com" || h === "youtube-nocookie.com") {
    if (parts[0] === "watch") id = u.searchParams.get("v") ?? undefined;
    else if (parts[0] === "embed" || parts[0] === "shorts" || parts[0] === "live" || parts[0] === "v") id = parts[1];
    else if (parts[0] === "playlist") return { kind: "invalid", reason: "YouTube playlists aren't supported yet. Paste a single video's link." };
  } else return null;
  if (!id || !YT_ID.test(id)) return { kind: "invalid", reason: "That YouTube link has no video id." };
  const startS = parseStart(u.searchParams.get("t") ?? u.searchParams.get("start"));
  return {
    kind: "embed",
    provider: "youtube",
    id,
    fp: `youtube:${id}`,
    embedSrc: `https://www.youtube-nocookie.com/embed/${id}${startS ? `?start=${startS}` : ""}`,
    pageUrl: `https://www.youtube.com/watch?v=${id}`,
    mediaKind: "video",
    startS,
  };
}

function vimeo(u: URL): ParsedMediaUrl | null {
  const h = host(u);
  if (h !== "vimeo.com" && h !== "player.vimeo.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  // vimeo.com/ID[/HASH], vimeo.com/channels/x/ID, player.vimeo.com/video/ID
  const idAt = parts.findIndex((p) => VIMEO_ID.test(p));
  const id = idAt >= 0 ? parts[idAt] : undefined;
  if (!id) return { kind: "invalid", reason: "That Vimeo link has no video id." };
  const next = parts[idAt + 1];
  const hash = u.searchParams.get("h") ?? (next && VIMEO_HASH.test(next) ? next : null);
  const h2 = hash && VIMEO_HASH.test(hash) ? hash : null;
  return {
    kind: "embed",
    provider: "vimeo",
    id,
    fp: `vimeo:${id}`,
    embedSrc: `https://player.vimeo.com/video/${id}${h2 ? `?h=${h2}` : ""}`,
    pageUrl: `https://vimeo.com/${id}${h2 ? `/${h2}` : ""}`,
    mediaKind: "video",
    startS: null,
  };
}

function soundcloud(u: URL): ParsedMediaUrl | null {
  if (host(u) !== "soundcloud.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  const ok = (parts.length === 2 || (parts.length === 3 && parts[1] === "sets")) && parts.every((p) => SC_PART.test(p));
  if (!ok) return { kind: "invalid", reason: "That SoundCloud link isn't a track or a set." };
  const id = parts.join("/").toLowerCase();
  const pageUrl = `https://soundcloud.com/${id}`;
  return {
    kind: "embed",
    provider: "soundcloud",
    id,
    fp: `soundcloud:${id}`,
    embedSrc: `https://w.soundcloud.com/player/?url=${encodeURIComponent(pageUrl)}&visual=true`,
    pageUrl,
    mediaKind: "audio",
    startS: null,
  };
}

function spotify(u: URL): ParsedMediaUrl | null {
  if (host(u) !== "open.spotify.com") return null;
  const parts = u.pathname.split("/").filter(Boolean);
  if (parts[0]?.startsWith("intl-")) parts.shift();
  if (parts[0] === "embed") parts.shift();
  const [type, raw] = parts;
  if (!type || !raw || !SPOTIFY_TYPES.has(type) || !SPOTIFY_ID.test(raw)) {
    return { kind: "invalid", reason: "That Spotify link isn't a track, album, playlist, episode, show or artist." };
  }
  const id = `${type}:${raw}`;
  return {
    kind: "embed",
    provider: "spotify",
    id,
    fp: `spotify:${id}`,
    embedSrc: `https://open.spotify.com/embed/${type}/${raw}`,
    pageUrl: `https://open.spotify.com/${type}/${raw}`,
    mediaKind: "audio",
    startS: null,
  };
}

/** A normalised direct URL: http(s) only, no credentials, no fragment. */
export function normaliseUrl(raw: string): URL | null {
  let u: URL;
  try {
    u = new URL(raw.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return null;
  if (u.username || u.password) return null;
  u.hash = "";
  return u;
}

export function parseMediaUrl(raw: string): ParsedMediaUrl {
  const text = raw.trim();
  if (!text) return { kind: "invalid", reason: "Paste a link first." };
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`;
  const u = normaliseUrl(withScheme);
  if (!u) return { kind: "invalid", reason: "Only http and https links can be played." };

  for (const provider of [youtube, vimeo, soundcloud, spotify]) {
    const hit = provider(u);
    if (hit) return hit;
  }

  const last = u.pathname.split("/").filter(Boolean).pop() ?? "";
  let name = last;
  try {
    name = decodeURIComponent(last);
  } catch {
    // keep the raw segment
  }
  const ext = /\.([a-z0-9]{2,5})$/i.exec(last)?.[1]?.toLowerCase() ?? "";
  return {
    kind: "url",
    url: u.href,
    fp: u.href,
    mediaKind: AUDIO_EXT.has(ext) ? "audio" : "video",
    name: name || u.hostname,
  };
}

/** The embed iframe origins, for the CSP when it lands (Phase 8). */
export const EMBED_ORIGINS = [
  "https://www.youtube-nocookie.com",
  "https://player.vimeo.com",
  "https://w.soundcloud.com",
  "https://open.spotify.com",
] as const;
