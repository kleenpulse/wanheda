/*
 * The bundled ffmpeg (SPEC V74, ADR-0014): BtbN's LGPL static build for
 * Windows x64, a month-end release (dailies are deleted after about two
 * weeks). Only `bin/ffmpeg.exe` and the licence text ship. Both are checked
 * against these hashes when they are fetched and again when they are staged.
 */

export type PinnedFile = {
  /** Path inside the zip, under its one top folder. */
  path: string;
  /** Name it's kept and shipped under. */
  as: string;
  size: number;
  sha256: string;
};

export const FFMPEG_PIN = {
  version: "n9.0.2-39-g7adfbe40dc",
  release: "autobuild-2026-10-31-12-59",
  zip: {
    name: "ffmpeg-n9.0.2-39-g7adfbe40dc-win64-lgpl-9.0.zip",
    size: 168_715_328,
    sha256: "9d37c564e0d01c18cde184a079fa6ef04d7d2783ada41da81d04165cc8f1a650",
  },
  files: [
    { path: "bin/ffmpeg.exe", as: "ffmpeg.exe", size: 132_190_720, sha256: "d03c858a130cae1382902925d9f46eb15d7de42e025d34cc29b7ddca6cfb4c62" },
    { path: "LICENSE.txt", as: "FFMPEG-LICENSE.txt", size: 7651, sha256: "da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768" },
  ],
} as const satisfies { version: string; release: string; zip: { name: string; size: number; sha256: string }; files: readonly PinnedFile[] };

export function ffmpegZipUrl(): string {
  return `https://github.com/BtbN/FFmpeg-Builds/releases/download/${FFMPEG_PIN.release}/${FFMPEG_PIN.zip.name}`;
}

/** A pinned file's full name inside the zip. */
export function zipPathOf(file: PinnedFile): string {
  return `${FFMPEG_PIN.zip.name.replace(/\.zip$/, "")}/${file.path}`;
}
