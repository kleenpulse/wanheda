"use client";

import { useMoneySync } from "@/components/money/money-provider";
import { useNotesSync } from "@/components/notes/notes-provider";
import { useAccount } from "@/components/shell/account";
import { Tip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * The sync status chip (vxrcel-ui-design status chip): "Offline" while the
 * device has no connection, with the writes waiting in the outboxes (notes
 * and money), and "Syncing" while some are still on their way. Nothing when
 * all is sent, and nothing in demo, whose edits never leave the tab.
 */
export function SyncChip() {
  const account = useAccount();
  const notes = useNotesSync();
  const money = useMoneySync();
  const online = notes.online;
  const pending = notes.pending + money;
  if (account.kind !== "owner" || (online && pending === 0)) return null;
  const label = online ? `Syncing ${String(pending)}` : pending > 0 ? `Offline · ${String(pending)} waiting` : "Offline";
  return (
    <Tip
      label={online ? "Changes saved on this device are being sent" : "Changes are kept on this device and sent when the connection is back"}
      render={
        <span
          role="status"
          className="inline-flex h-6 shrink-0 items-center gap-1.5 rounded-pill bg-foreground/8 px-2.5 font-mono text-[10.5px] tracking-wide text-ink-2 uppercase tabular"
        />
      }
    >
      <span aria-hidden className={cn("size-1.5 rounded-full", online ? "bg-signal" : "bg-ink-3")} />
      {label}
    </Tip>
  );
}
