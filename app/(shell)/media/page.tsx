import { Suspense } from "react";
import { MediaApp, MediaTabs } from "@/components/media/media-app";
import { Prefetch } from "@/components/providers/prefetch";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { MEDIA_KEY } from "@/lib/media/media";
import { mediaFor } from "@/lib/media/server";

// Media (FRD 6.5, T61). The page awaits nothing, so a hop here paints at once
// from the client cache; the server read streams in beside it and refreshes
// the cache (SPEC V24). Local files never reach the server (V54).
export default function MediaPage() {
  return (
    <PageFrame
      title="Media"
      actions={<MediaTabs />}
      subtitle={<ModeText owner="Your videos and links on every device; files stay on the device you open them on" demo="Demo: sample links, files you open stay in this tab" />}
    >
      <MediaApp />
      <Suspense fallback={null}>
        <Prefetch queryKey={MEDIA_KEY} load={mediaFor} />
      </Suspense>
    </PageFrame>
  );
}
