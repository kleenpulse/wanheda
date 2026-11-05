import { Suspense } from "react";
import { HydrationBoundary, QueryClient, dehydrate } from "@tanstack/react-query";
import { NotesApp } from "@/components/notes/notes-app";
import { PageFrame } from "@/components/shell/page-frame";
import { requireOwner } from "@/lib/auth/owner";
import { NOTES_KEY } from "@/lib/notes/notes";
import { notesFor } from "@/lib/notes/server";

// Notes (FR-NOTES-1..3, 7): the list is prefetched here and hydrated into
// TanStack Query (ADR-0008), so the first paint already has every note and
// the client only refetches when it goes stale.
export default async function NotesPage() {
  const owner = await requireOwner();
  const qc = new QueryClient();
  await qc.query({ queryKey: NOTES_KEY, queryFn: () => notesFor(owner) });
  const subtitle =
    owner.kind === "owner" ? "Saved as you type, on every device" : "Demo: sample notes, changes stay in this tab";

  return (
    <PageFrame title="Notes" subtitle={subtitle}>
      <HydrationBoundary state={dehydrate(qc)}>
        {/* useSearchParams reads the request (SPEC V16). */}
        <Suspense fallback={null}>
          <NotesApp />
        </Suspense>
      </HydrationBoundary>
    </PageFrame>
  );
}
