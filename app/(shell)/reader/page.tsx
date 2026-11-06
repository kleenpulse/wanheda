import { Suspense } from "react";
import { Prefetch } from "@/components/providers/prefetch";
import { ReaderApp } from "@/components/reader/reader-app";
import { ModeText } from "@/components/shell/mode-text";
import { PageFrame } from "@/components/shell/page-frame";
import { READER_KEY } from "@/lib/reader/reader";
import { readerFor } from "@/lib/reader/server";

// Reader (FRD 6.5, T46). The page awaits nothing, so a hop here paints at once
// from the client cache or this device's copy of the library; the server read
// streams in beside it and refreshes the cache (SPEC V24). File bytes never
// come from the server: they live in this device's storage (V38).
export default function ReaderPage() {
  return (
    <PageFrame
      title="Reader"
      subtitle={<ModeText owner="Your library on every device; files stay on the device you open them on" demo="Demo: sample library, files you add stay in this tab" />}
    >
      <ReaderApp />
      <Suspense fallback={null}>
        <Prefetch queryKey={READER_KEY} load={readerFor} />
      </Suspense>
    </PageFrame>
  );
}
