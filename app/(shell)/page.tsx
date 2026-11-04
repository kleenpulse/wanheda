import { Board, type BoardSource } from "@/components/board/board";
import { PageFrame } from "@/components/shell/page-frame";
import { widgetNodes } from "@/components/widgets";
import { requireOwner } from "@/lib/auth/owner";
import { seedLayouts, type BoardLayouts } from "@/lib/board/layout";
import { loadLayouts } from "@/lib/board/store";

// Home: the widget board (FR-SHELL-2). The owner's layout comes from Neon;
// demo mode shows the seed and never saves it.
export default async function Home() {
  const owner = await requireOwner();
  const mode = owner.kind === "owner" ? "owner" : "demo";

  let layouts: BoardLayouts = seedLayouts();
  let source: BoardSource = "demo";
  if (owner.kind === "owner") {
    const loaded = await loadLayouts(owner.user.id);
    layouts = loaded.layouts;
    source = loaded.kind === "loaded" ? "owner" : "load-failed";
  }

  return (
    <PageFrame title="Home" subtitle={mode === "demo" ? "Seed data, open to anyone." : "Your board"}>
      <Board initial={layouts} source={source} nodes={widgetNodes(mode)} />
    </PageFrame>
  );
}
