import { NextResponse } from "next/server";
import { z } from "zod";
import { requireOwner } from "@/lib/auth/owner";
import type { RevisionsPayload } from "@/lib/notes/notes";
import { listRevisions } from "@/lib/notes/store";

// A note's history (FR-NOTES-4) for the editor's History panel. requireOwner()
// first (SPEC V7); demo has no history, since its edits never leave the tab.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const owner = await requireOwner();
  const headers = { "Cache-Control": "no-store" };
  const id = z.uuid().safeParse((await params).id);
  if (!id.success) return NextResponse.json({ error: "bad-id" }, { status: 400, headers });
  if (owner.kind === "demo") return NextResponse.json({ revisions: [] } satisfies RevisionsPayload, { headers });
  const revisions = await listRevisions(owner.user.id, id.data);
  if (revisions === null) return NextResponse.json({ error: "history-failed" }, { status: 503, headers });
  return NextResponse.json({ revisions } satisfies RevisionsPayload, { headers });
}
