// Demo library (zero env): links only, so nothing copyrighted ships and no
// file is needed. Local files the visitor opens stay in the tab.

import type { MediaItem } from "./types";
import { parseMediaUrl } from "./url";

type Seed = { id: string; uri: string; title: string; durationS: number | null; ageDays: number };

// Open-licence films (Blender Foundation, CC BY), served by their own hosts.
const SEEDS: readonly Seed[] = [
  {
    id: "00000000-0000-4000-8000-00000000a001",
    uri: "https://upload.wikimedia.org/wikipedia/commons/transcoded/c/c0/Big_Buck_Bunny_4K.webm/Big_Buck_Bunny_4K.webm.480p.vp9.webm",
    title: "Big Buck Bunny",
    durationS: 634.6,
    ageDays: 1,
  },
  {
    id: "00000000-0000-4000-8000-00000000a002",
    uri: "https://download.blender.org/durian/trailer/sintel_trailer-480p.mp4",
    title: "Sintel (trailer)",
    durationS: 52.2,
    ageDays: 3,
  },
  {
    id: "00000000-0000-4000-8000-00000000a003",
    uri: "https://www.youtube.com/watch?v=aqz-KE-bpKQ",
    title: "Big Buck Bunny (YouTube)",
    durationS: 635,
    ageDays: 6,
  },
];

export function seedMedia(now: number): MediaItem[] {
  return SEEDS.flatMap((s) => {
    const p = parseMediaUrl(s.uri);
    if (p.kind === "invalid") return [];
    const at = new Date(now - s.ageDays * 86_400_000).toISOString();
    return [
      {
        id: s.id,
        kind: p.mediaKind,
        source: p.kind,
        fp: p.fp,
        uri: p.kind === "embed" ? p.pageUrl : p.url,
        title: s.title,
        durationS: s.durationS,
        meta: p.kind === "embed" ? { provider: p.provider } : {},
        createdAt: at,
        updatedAt: at,
      },
    ];
  });
}
