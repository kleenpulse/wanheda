import "server-only";
import type { Owner } from "@/lib/auth/owner";
import type { MediaPayload } from "./media";
import { seedMedia } from "./seed";
import { loadMedia } from "./store";

export async function mediaFor(owner: Owner, now = Date.now()): Promise<MediaPayload> {
  if (owner.kind === "demo") return { source: "demo", items: seedMedia(now) };
  const loaded = await loadMedia(owner.user.id);
  if (loaded.kind === "failed") return { source: "load-failed", items: [] };
  return { source: "owner", items: loaded.items };
}
