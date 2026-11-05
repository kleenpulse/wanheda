import { NextResponse, type NextRequest } from "next/server";
import { requireOwner } from "@/lib/auth/owner";
import { checkImport, loadImportSetup } from "@/lib/money/import-store";
import { importCheckSchema, type ImportCheck, type ImportSetup } from "@/lib/money/import/write";

// The import page's reads (SPEC V32). requireOwner() first (V7). GET: saved
// mappings and the latest imports. POST: whether a file is in already and
// which of its row keys are (a read, sent as POST because a statement's keys
// don't fit in a URL). Demo has neither.

const NO_STORE = { "Cache-Control": "no-store" };

export async function GET() {
  const owner = await requireOwner();
  if (owner.kind === "demo") return NextResponse.json({ mappings: [], batches: [] } satisfies ImportSetup, { headers: NO_STORE });
  try {
    const setup = await loadImportSetup(owner.user.id);
    if (!setup) return NextResponse.json({ error: "Load failed" }, { status: 503, headers: NO_STORE });
    return NextResponse.json(setup, { headers: NO_STORE });
  } catch (error) {
    console.error("loadImportSetup failed", error);
    return NextResponse.json({ error: "Load failed" }, { status: 503, headers: NO_STORE });
  }
}

export async function POST(request: NextRequest) {
  const owner = await requireOwner();
  const parsed = importCheckSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  if (owner.kind === "demo") return NextResponse.json({ importedOn: null, present: [] } satisfies ImportCheck, { headers: NO_STORE });
  const { accountId, fileKey, keys } = parsed.data;
  try {
    const check = await checkImport(owner.user.id, accountId, fileKey, keys);
    if (!check) return NextResponse.json({ error: "Load failed" }, { status: 503, headers: NO_STORE });
    return NextResponse.json(check, { headers: NO_STORE });
  } catch (error) {
    console.error("checkImport failed", error);
    return NextResponse.json({ error: "Load failed" }, { status: 503, headers: NO_STORE });
  }
}
