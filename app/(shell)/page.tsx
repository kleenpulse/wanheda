import { EmptyState, PageFrame } from "@/components/shell/page-frame";
import { requireOwner } from "@/lib/auth/owner";

// Home. The board (widgets, layout per breakpoint) arrives in SPEC T25.
export default async function Home() {
  const owner = await requireOwner();

  return (
    <PageFrame
      title="Home"
      subtitle={owner.kind === "demo" ? "Seed data, open to anyone." : "Your board"}
    >
      <EmptyState title="Your board is coming" body="Widgets, the palette and the island arrive in the next steps of Phase 1." />
    </PageFrame>
  );
}
