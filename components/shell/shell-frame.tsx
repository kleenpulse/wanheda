"use client";

import * as React from "react";
import { AccountProvider } from "@/components/shell/account";
import { Island } from "@/components/island/island";
import { CommandPalette } from "@/components/shell/command-palette";
import { FloatingPill } from "@/components/shell/floating-pill";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { NavRail } from "@/components/shell/nav-rail";
import type { ShellAccount } from "@/lib/shell/account";
import { RAIL_ATTR, RAIL_WIDTH, railCookie } from "@/lib/shell/rail";

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

/**
 * Raven's WorkspaceFrame: the rail, the page, and what floats over both. The
 * page keeps document scroll (the rail is sticky), so sticky elements inside
 * pages behave normally.
 *
 * `--rail-w` is set here and read by anything that centres on the content
 * column (the page frame's max width, later the floating pill and island).
 */
export function ShellFrame({
  account,
  initialExpanded,
  children,
}: {
  account: ShellAccount;
  /** From the cookie, so the server paints the right width: no first-frame jump. */
  initialExpanded: boolean;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = React.useState(initialExpanded);
  const toggle = React.useCallback(() => {
    setExpanded((was) => !was);
  }, []);

  // Persist after a change, never on mount: the server and the <head> boot
  // script already agree with the cookie. html[data-rail] follows too, so a
  // later Suspense fallback is drawn at the current width.
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.cookie = railCookie(expanded);
    if (expanded) document.documentElement.setAttribute(RAIL_ATTR, "open");
    else document.documentElement.removeAttribute(RAIL_ATTR);
  }, [expanded]);

  // `[` toggles the rail, the way editors bind their sidebars. AltGr (reported
  // as Ctrl+Alt on Windows) is how many non-US layouts type `[`, so it passes.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const chord = e.metaKey || ((e.ctrlKey || e.altKey) && !e.getModifierState("AltGraph"));
      if (chord || e.repeat || isTyping(e.target)) return;
      if (e.key === "[") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [toggle]);

  const railW = expanded ? RAIL_WIDTH.expanded : RAIL_WIDTH.collapsed;

  return (
    <AccountProvider account={account}>
      <div
        className="relative flex min-h-svh w-full [--rail-w:0px] md:[--rail-w:var(--rail-w-md)]"
        style={{ ["--rail-w-md" as string]: `${railW}px` }}
      >
        <NavRail expanded={expanded} onToggle={toggle} className="hidden md:flex" />
        <main className="relative min-w-0 flex-1 pb-[88px] md:pb-0">{children}</main>
        <MobileTabBar />
        <FloatingPill />
        <Island />
        <CommandPalette railExpanded={expanded} onToggleRail={toggle} />
      </div>
    </AccountProvider>
  );
}
