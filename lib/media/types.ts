// Shared media types: the client, the server and the seed agree on these.

export type MediaKind = "video" | "audio";

/** Where the bytes live. `local` never leaves the device (V54, V38). */
export type MediaSourceKind = "local" | "url" | "embed" | "r2";

export const MEDIA_KINDS: readonly MediaKind[] = ["video", "audio"];
export const MEDIA_SOURCES: readonly MediaSourceKind[] = ["local", "url", "embed", "r2"];

export type MediaMeta = {
  /** Local file: size in bytes and container name, for "not on this device". */
  size?: number;
  format?: string;
  /** Embed provider ("youtube", …). The iframe src is never stored: it is rebuilt from `uri` (V56). */
  provider?: string;
  /** Folder adds: the folder it came from, under the picked folder's name ("Hometown/Season 1"), at most 200 chars. Names a series when the file says only "Episode 11" (T72). */
  folder?: string;
};

/** One item in the media library. `fp` is the identity key for every source (V54). */
export type MediaItem = {
  id: string;
  kind: MediaKind;
  source: MediaSourceKind;
  fp: string;
  /** Local: the file name. URL: the URL. Embed: the provider's page URL. */
  uri: string;
  title: string;
  durationS: number | null;
  meta: MediaMeta;
  /** On the watch-later queue since then, or null. */
  watchLaterAt: string | null;
  /** Where it was left, on any device (V55): the server's copy; this device's newer one is laid over it. */
  progress: MediaProgress | null;
  createdAt: string;
  updatedAt: string;
};

export type MediaProgress = {
  positionS: number;
  watched: boolean;
  /** ISO time it was last played. */
  lastPlayedAt: string;
};

/** What the client sends to add an item; the server fills id and times. */
export type MediaItemInput = Pick<MediaItem, "kind" | "source" | "fp" | "uri" | "title" | "durationS" | "meta">;
