import { Suspense } from "react";
import { NotesApp } from "@/components/notes/notes-app";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { NOTES_KEY } from "@/lib/notes/notes";
import { notesFor } from "@/lib/notes/server";

// Notes (FR-NOTES-1..3, 7). The page awaits nothing, so a hop here paints at
// once from the client cache (or this device's copy); the list streams in
// beside it and refreshes the cache (ADR-0008, CLAUDE.md: native-app feel).
export default function NotesPage() {
  return (
    <PageFrame
      title="Notes"
      subtitle={<ModeText owner="Saved as you type, on every device" demo="Demo: sample notes, changes stay in this tab" />}
    >
      {/* useSearchParams reads the request (SPEC V16). */}
      <Suspense fallback={null}>
        <NotesApp />
      </Suspense>
      <Suspense fallback={null}>
        <Prefetch queryKey={NOTES_KEY} load={notesFor} />
      </Suspense>
    </PageFrame>
  );
}
