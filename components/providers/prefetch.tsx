import "server-only";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { requireOwner, type Owner } from "@/lib/auth/owner";

/**
 * Streams one server read into the shell's QueryClient. Render it inside its
 * own <Suspense fallback={null}> beside the client view, never around it: the
 * view paints from the client cache at once and this refreshes it when the
 * read lands (ADR-0008, CLAUDE.md: native-app feel). A failed read hydrates
 * nothing, so it never replaces good cached data; the client's own fetch
 * reports the failure (SPEC V17).
 */
export async function Prefetch<T extends { source: string }>({
  queryKey,
  load,
}: {
  queryKey: readonly unknown[];
  load: (owner: Owner) => Promise<T>;
}) {
  const owner = await requireOwner();
  const data = await load(owner);
  if (data.source === "load-failed") return null;
  const qc = new QueryClient();
  qc.setQueryData(queryKey, data);
  return <HydrationBoundary state={dehydrate(qc)} />;
}
