"use client";

import { Clapperboard } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { IslandButton } from "@/components/island/money-alert-activity";
import { useRemuxStatus } from "@/components/media/remux-status";

// The island's `transfer` activity for a remux that is slow to start (V53):
// the player converts the file as it plays, and this says so, with a cancel.

export const REMUX_ACTIVITY = "transfer:remux";

function RemuxCard() {
  const { collapse } = useIsland();
  const job = useRemuxStatus((s) => s.job);
  if (!job) return null;
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-island-foreground/70">Preparing to play</p>
        <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{job.title}</p>
        <p className="mt-1 text-xs text-island-foreground/70">Converting the file as it plays. Nothing is saved.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <IslandButton
          onClick={() => {
            collapse();
            job.cancel();
          }}
        >
          Cancel
        </IslandButton>
      </div>
    </div>
  );
}

export function remuxActivity(title: string): IslandActivity {
  return {
    id: REMUX_ACTIVITY,
    label: title,
    status: ", preparing to play",
    leading: <Clapperboard aria-hidden className="size-3.5 text-signal" />,
    trailing: <span className="text-sm font-semibold text-signal">Preparing</span>,
    expanded: <RemuxCard />,
  };
}
