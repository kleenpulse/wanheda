import "server-only";
import type { Owner } from "@/lib/auth/owner";
import { seedLayouts, type BoardPayload } from "./layout";
import { loadLayouts } from "./store";

// What Home prefetches and /api/board serves: the owner's board, or demo's
// seed. One function, so the prefetch and the client's refetch agree on shape.

export async function boardFor(owner: Owner): Promise<BoardPayload> {
  if (owner.kind === "demo") return { source: "demo", layouts: seedLayouts() };
  const loaded = await loadLayouts(owner.user.id);
  return { source: loaded.kind === "loaded" ? "owner" : "load-failed", layouts: loaded.layouts };
}
