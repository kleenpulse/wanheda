"use client";

import { useRouter } from "next/navigation";
import { Download, TriangleAlert } from "lucide-react";
import { useIsland, type IslandActivity } from "@/components/island/live-activity";
import { IslandButton } from "@/components/island/money-alert-activity";
import { formatBytes, useVoiceManager, type VoiceDownload } from "@/components/settings/voice-manager";
import { ProgressRing } from "@/components/ui/progress-ring";
import { catalogVoice } from "@/lib/speech/voices";
import { cn } from "@/lib/utils";

// The island's `transfer` activity (FRD 4.3, T55): a voice download in this
// tab, with its progress and a cancel. It reads the download from the voice
// manager by id, so the pill and the card never disagree. Gone when the
// download finishes or is cancelled; a failure stays until it's dismissed.

export const VOICES_HREF = "/settings?s=voices";

function useDownload(id: string): VoiceDownload | undefined {
  return useVoiceManager((s) => s.downloads[id]);
}

const share = (d: VoiceDownload) => (d.total > 0 ? Math.min(1, d.received / d.total) : 0);
const percent = (d: VoiceDownload) => `${String(Math.floor(share(d) * 100))}%`;

function TransferLeading({ id }: { id: string }) {
  const d = useDownload(id);
  if (!d) return null;
  if (d.phase === "failed") return <TriangleAlert aria-hidden className="size-3.5 text-signal" />;
  return (
    <ProgressRing value={share(d)}>
      <Download aria-hidden className="size-3" />
    </ProgressRing>
  );
}

function TransferTrailing({ id }: { id: string }) {
  const d = useDownload(id);
  if (!d) return null;
  return (
    <span className={cn("tabular text-sm font-semibold", d.phase === "downloading" ? "text-signal" : "text-island-foreground/60")}>
      {d.phase === "failed" ? "Failed" : d.phase === "queued" ? "Next" : percent(d)}
    </span>
  );
}

function TransferStatus({ id }: { id: string }) {
  const d = useDownload(id);
  if (!d) return null;
  if (d.phase === "failed") return ", failed";
  if (d.phase === "queued") return ", waiting for the download ahead";
  return `, downloading, ${percent(d)}`;
}

function TransferCard({ id }: { id: string }) {
  const { collapse } = useIsland();
  const router = useRouter();
  const d = useDownload(id);
  const download = useVoiceManager((s) => s.download);
  const cancel = useVoiceManager((s) => s.cancel);
  if (!d) return null;
  const voice = catalogVoice(id);
  const failed = d.phase === "failed";

  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-medium text-island-foreground/70">Voice download</p>
          <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{voice?.name ?? id}</p>
          <p className={cn("mt-1 text-xs text-island-foreground/70", !failed && "tabular")}>
            {failed ? d.error : d.phase === "queued" ? `Waiting · ${formatBytes(d.total)}` : `${formatBytes(d.received)} of ${formatBytes(d.total)}`}
          </p>
        </div>
        {failed ? null : (
          <p className={cn("tabular shrink-0 text-[1.75rem] leading-none font-light", d.phase === "downloading" ? "text-signal" : "text-island-foreground/60")}>
            {percent(d)}
          </p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {failed ? (
          <IslandButton
            tone="signal"
            onClick={() => {
              download(id);
            }}
          >
            Retry
          </IslandButton>
        ) : null}
        <IslandButton
          onClick={() => {
            collapse();
            router.push(VOICES_HREF);
          }}
        >
          Voices
        </IslandButton>
        <IslandButton
          onClick={() => {
            collapse();
            cancel(id);
          }}
        >
          {failed ? "Dismiss" : "Cancel"}
        </IslandButton>
      </div>
    </div>
  );
}

/** The activity for the voice download `id` (a voice id). */
export function transferActivity(id: string): IslandActivity {
  return {
    id: `transfer:${id}`,
    label: `${catalogVoice(id)?.name ?? id} voice`,
    status: <TransferStatus id={id} />,
    leading: <TransferLeading id={id} />,
    trailing: <TransferTrailing id={id} />,
    expanded: <TransferCard id={id} />,
  };
}
