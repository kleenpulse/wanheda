"use client";

import { useAccount } from "@/components/shell/account";

/** The demo-mode status chip (vxrcel-ui-design status chip, "paused" tone). Nothing for the owner. */
export function ModeChip() {
  const account = useAccount();
  if (account.kind !== "demo") return null;
  return (
    <span className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-foreground/8 px-2.5 font-mono text-[10.5px] tracking-wide text-ink-2 uppercase">
      <span aria-hidden className="size-1.5 rounded-full bg-ink-3" />
      Demo mode
    </span>
  );
}
