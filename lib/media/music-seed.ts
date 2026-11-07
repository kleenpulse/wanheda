// Demo music library (zero env): generated test tones, never copyrighted
// audio. The rows are index entries only; T64's player synthesises the tone
// for a `tone:` path instead of reading a file.

import { trackFrom, type Track } from "./library";

type Seed = { artist: string; album: string; genre: string; year: number; titles: readonly [title: string, seconds: number][] };

const SEEDS: readonly Seed[] = [
  {
    artist: "Wanheda Test Tones",
    album: "Sine Studies",
    genre: "Test signal",
    year: 2026,
    titles: [
      ["A 440", 62],
      ["Middle C", 75],
      ["Low E", 58],
      ["High G", 47],
    ],
  },
  {
    artist: "Wanheda Test Tones",
    album: "Gapless Run",
    genre: "Test signal",
    year: 2026,
    titles: [
      ["Chirp, part 1", 10],
      ["Chirp, part 2", 10],
      ["Chirp, part 3", 10],
    ],
  },
  {
    artist: "Square Wave Club",
    album: "Pulse Width",
    genre: "Electronic",
    year: 2025,
    titles: [
      ["Fifty Percent", 120],
      ["Twelve and a Half", 96],
      ["Duty Cycle", 133],
    ],
  },
];

export function seedTracks(): Track[] {
  return SEEDS.flatMap((s) =>
    s.titles.map(([title, seconds], i) => {
      const path = `tone:${s.album}/${String(i + 1).padStart(2, "0")} ${title}`;
      return trackFrom(path, { size: 0, lastModified: 0 }, { title, artist: s.artist, album: s.album, genre: [s.genre], year: s.year, track: { no: i + 1 }, duration: seconds }, null);
    }),
  );
}
