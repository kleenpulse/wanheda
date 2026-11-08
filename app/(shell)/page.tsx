import { Suspense } from "react";
import { Board } from "@/components/board/board";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { widgetNodes } from "@/components/widgets";
import { BOARD_KEY } from "@/lib/board/layout";
import { boardFor } from "@/lib/board/server";

// Home: the widget board (FR-SHELL-2). The page awaits nothing, so a hop here
// paints at once: the board comes from the client cache, and the owner's
// layout streams in from Neon beside it (CLAUDE.md: native-app feel). Demo
// shows the seed and never saves it.
export default function Home() {
  return (
    <PageFrame
      title="Home"
      subtitle={<ModeText owner="Your board" demo="Seed data, open to anyone." />}
    >
      {/* useSearchParams reads the request (SPEC V16). */}
      <Suspense fallback={null}>
        <Board nodes={widgetNodes()} />
      </Suspense>
      <Suspense fallback={null}>
        <Prefetch queryKey={BOARD_KEY} load={boardFor} />
      </Suspense>
    </PageFrame>
  );
}
