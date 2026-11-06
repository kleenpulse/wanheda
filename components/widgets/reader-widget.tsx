"use client";

import Link from "next/link";
import { BookOpenText } from "lucide-react";
import { Cover } from "@/components/reader/cover";
import { useReader } from "@/components/reader/use-reader";
import { useAccount } from "@/components/shell/account";
import { buttonClass } from "@/components/ui/button";
import { useNow } from "@/hooks/use-now";
import { relativeTime } from "@/lib/notifications/notifications";
import { continueReading } from "@/lib/reader/reader";
import { SampleChip, WidgetCard } from "./widget-card";

// Home's "Continue reading" (T46): the documents opened most recently and not
// finished, from the reader cache /reader shares (V24), so it paints at once
// after a hop and from the device's copy on a cold start. A tap opens the
// document where it was left.

export function ContinueReadingWidget() {
  const { data } = useReader();
  const demo = useAccount().kind !== "owner";
  const now = useNow(60_000);
  const docs = data ? continueReading(data.documents, 3) : null;
  return (
    <WidgetCard title="Continue reading" icon={BookOpenText} note={demo ? <SampleChip /> : undefined}>
      {docs === null ? (
        <div aria-busy aria-label="Loading" className="h-full min-h-12 rounded-[14px] bg-card-nested" />
      ) : docs.length === 0 ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-[13px] text-ink-2">Nothing in progress. Open something from your library.</p>
          <Link href="/reader" className={buttonClass("surface", "pill-sm")}>
            Open library
          </Link>
        </div>
      ) : (
        <ul className="-mx-2 flex min-h-0 flex-col gap-0.5 overflow-y-auto scroll-fade">
          {docs.map((d) => {
            const percent = d.progress?.percent ?? 0;
            return (
              <li key={d.id}>
                <Link
                  href={`/reader?d=${encodeURIComponent(d.id)}`}
                  className="flex items-center gap-3 rounded-[12px] px-2 py-1.5 outline-none hover:bg-card-nested focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Cover doc={d} size="sm" className="w-8 shrink-0" />
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate text-[13px] font-medium text-foreground">{d.title}</span>
                    <span className="flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-pill bg-foreground/8 dark:bg-card-nested" aria-hidden>
                        <span className="block h-full rounded-pill bg-signal" style={{ width: `${String(percent)}%` }} />
                      </span>
                      <span className="tabular shrink-0 font-mono text-[10.5px] text-ink-2">{percent}%</span>
                    </span>
                    {now !== null && d.lastOpenedAt !== null ? <span className="tabular truncate text-[11px] text-ink-3">{relativeTime(d.lastOpenedAt, now)}</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </WidgetCard>
  );
}
