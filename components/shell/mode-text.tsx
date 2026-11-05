"use client";

import { useAccount } from "@/components/shell/account";

/**
 * Text that differs between the owner and demo, read from the shell's account
 * on the client. Pages use it instead of awaiting requireOwner(), so they
 * render at once on a navigation (CLAUDE.md: native-app feel).
 */
export function ModeText({ owner, demo }: { owner: string; demo: string }) {
  return useAccount().kind === "owner" ? owner : demo;
}
