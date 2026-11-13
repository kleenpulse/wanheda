"use client";

import * as React from "react";
import Link from "next/link";
import { LogOut, Settings, UserRound } from "lucide-react";
import { useAccount } from "@/components/shell/account";
import { circle } from "@/components/shell/styles";
import { Menu, MenuContent, MenuHeader, MenuItem, MenuLinkItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { leaveAfterSignOut, signOutOk } from "@/components/auth/account-actions";
import { accountMode, initials } from "@/lib/shell/account";
import { cn } from "@/lib/utils";

/**
 * The owner's disc (Raven's AccountMenu): who is signed in, which mode is
 * live, settings and sign-out. In the rail it carries the name beside it,
 * faded out while the rail is collapsed.
 */
export function AccountMenu({
  withLabel = false,
  labelClass,
  side = "right",
  className,
}: {
  withLabel?: boolean;
  labelClass?: string;
  side?: "right" | "top";
  className?: string;
}) {
  const account = useAccount();
  const [signOutState, setSignOutState] = React.useState<"idle" | "pending" | "failed">("idle");

  async function signOut() {
    setSignOutState("pending");
    if (await signOutOk()) {
      leaveAfterSignOut();
    } else {
      setSignOutState("failed");
    }
  }

  return (
    <Menu>
      <MenuTrigger
        aria-label="Account menu"
        className="group flex min-w-0 items-center gap-3 rounded-full text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span
          className={cn(
            circle,
            "relative overflow-hidden bg-sheet font-display text-sm font-semibold text-foreground ring-1 ring-border group-hover:bg-card",
            "dark:bg-signal-soft dark:text-signal dark:ring-glass-border",
            className,
          )}
        >
          {account.kind === "owner" ? initials(account.name) : <UserRound strokeWidth={1.75} />}
          {account.kind === "owner" && account.image ? <Avatar key={account.image} src={account.image} /> : null}
        </span>
        {withLabel && (
          <span className={cn("min-w-0 flex-1 leading-tight transition-opacity duration-200", labelClass)}>
            <span className="block truncate text-[13px] font-medium text-foreground">{account.name}</span>
            <span className="block truncate text-[11px] text-ink-3">{accountMode(account)}</span>
          </span>
        )}
      </MenuTrigger>
      <MenuContent side={side} align="end" sideOffset={10} className="w-64">
        <MenuHeader>
          <div className="truncate text-sm font-medium text-foreground">{account.name}</div>
          {account.email && <div className="truncate text-xs text-ink-2">{account.email}</div>}
          <div className="readout mt-1.5">{accountMode(account)}</div>
        </MenuHeader>
        <MenuSeparator />
        <MenuLinkItem render={<Link href="/settings" />}>
          <Settings strokeWidth={1.75} />
          Settings
        </MenuLinkItem>
        {account.kind === "owner" && (
          <MenuItem
            closeOnClick={false}
            disabled={signOutState === "pending"}
            onClick={() => void signOut()}
            className="text-critical data-[highlighted]:text-critical [&_svg]:text-critical"
          >
            <LogOut strokeWidth={1.75} />
            {{ idle: "Sign out", pending: "Signing out", failed: "Sign-out failed, try again" }[signOutState]}
          </MenuItem>
        )}
      </MenuContent>
    </Menu>
  );
}

/**
 * The social profile photo, laid over the initials: they show while it loads
 * and come back if it fails. No referrer, as Google's photo host refuses some.
 */
function Avatar({ src }: { src: string }) {
  const [state, setState] = React.useState<"loading" | "shown" | "failed">("loading");
  if (state === "failed") return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      draggable={false}
      referrerPolicy="no-referrer"
      // A cached photo can finish before hydration, so onLoad never fires.
      ref={(img) => {
        if (img?.complete && state === "loading") setState(img.naturalWidth > 0 ? "shown" : "failed");
      }}
      onLoad={() => setState("shown")}
      onError={() => setState("failed")}
      className={cn(
        "absolute inset-0 size-full object-cover transition-opacity duration-200 motion-reduce:transition-none",
        state === "shown" ? "opacity-100" : "opacity-0",
      )}
    />
  );
}
