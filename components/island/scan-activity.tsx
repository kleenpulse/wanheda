"use client";

import { useRouter } from "next/navigation";
import { FolderSearch, TriangleAlert } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { IslandButton } from "@/components/island/money-alert-activity";
import { useMusicLibrary } from "@/components/media/music-library";
import { ProgressRing } from "@/components/ui/progress-ring";

// The island's `transfer` activity for a music scan (V58): shown while there
// are new or changed files to read (a quiet check that finds nothing never
// shows), and when a scan fails, with a cancel or a dismiss.

export const SCAN_ACTIVITY = "transfer:music-scan";
const MUSIC_HREF = "/media?tab=music";

function useScan() {
  return useMusicLibrary((s) => s.scan);
}

const share = (s: { parsed: number; toParse: number }) => (s.toParse > 0 ? Math.min(1, s.parsed / s.toParse) : 0);

function Leading() {
  const scan = useScan();
  if (!scan) return null;
  if (scan.phase === "failed") return <TriangleAlert aria-hidden className="size-3.5 text-signal" />;
  return (
    <ProgressRing value={share(scan)}>
      <FolderSearch aria-hidden className="size-3" />
    </ProgressRing>
  );
}

function Trailing() {
  const scan = useScan();
  if (!scan) return null;
  return (
    <span className="tabular text-sm font-semibold text-signal">
      {scan.phase === "failed" ? "Failed" : `${String(Math.floor(share(scan) * 100))}%`}
    </span>
  );
}

function Status() {
  const scan = useScan();
  if (!scan) return null;
  return scan.phase === "failed" ? ", failed" : `, ${String(scan.parsed)} of ${String(scan.toParse)} files read`;
}

function Card() {
  const { collapse } = useIsland();
  const router = useRouter();
  const scan = useScan();
  if (!scan) return null;
  const failed = scan.phase === "failed";
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-island-foreground/70">Music library</p>
        <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{failed ? "Scan stopped" : "Reading new music"}</p>
        <p className="tabular mt-1 text-xs text-island-foreground/70">
          {failed ? scan.message : `${scan.parsed.toLocaleString()} of ${scan.toParse.toLocaleString()} files${scan.bad > 0 ? `, ${scan.bad.toLocaleString()} skipped` : ""}`}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <IslandButton
          onClick={() => {
            collapse();
            router.push(MUSIC_HREF);
          }}
        >
          Music
        </IslandButton>
        <IslandButton
          onClick={() => {
            collapse();
            const lib = useMusicLibrary.getState();
            if (failed) lib.dismissScan();
            else lib.cancel();
          }}
        >
          {failed ? "Dismiss" : "Cancel"}
        </IslandButton>
      </div>
    </div>
  );
}

export function scanActivity(): IslandActivity {
  return {
    id: SCAN_ACTIVITY,
    label: "Music scan",
    status: <Status />,
    leading: <Leading />,
    trailing: <Trailing />,
    expanded: <Card />,
  };
}
