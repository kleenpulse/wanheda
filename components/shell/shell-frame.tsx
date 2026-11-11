"use client";

import * as React from "react";
import { AccountProvider } from "@/components/shell/account";
import { Island } from "@/components/island/island";
import { SpeechMediaSession } from "@/components/speech/media-session";
import { MoneyProvider } from "@/components/money/money-provider";
import { NotesProvider } from "@/components/notes/notes-provider";
import { ReaderProvider } from "@/components/reader/reader-provider";
import { ReaderPrefsSync } from "@/components/reader/reader-prefs-sync";
import { QueryProvider } from "@/components/providers/query-provider";
import { NotificationCentre } from "@/components/notifications/notification-centre";
import { NotificationsProvider, type NoticesSource } from "@/components/notifications/notifications-provider";
import { PrefsProvider, type PrefsSource } from "@/components/prefs/prefs-provider";
import { WallpaperMain } from "@/components/prefs/wallpaper";
import { CommandPalette } from "@/components/shell/command-palette";
import { IslandMirror } from "@/components/island/island-mirror";
import { DesktopNative } from "@/components/shell/desktop-native";
import { DesktopOpen } from "@/components/shell/desktop-open";
import { Dock } from "@/components/shell/dock";
import { MobileTabBar } from "@/components/shell/mobile-tab-bar";
import { NavRail } from "@/components/shell/nav-rail";
import { useRailLock } from "@/components/shell/rail-lock";
import { AnchoredNotes, anchoredNote, notePoint } from "@/components/ui/anchored-note";
import { Toaster } from "@/components/ui/toaster";
import { VoiceOffer } from "@/components/speech/voice-offer";
import { WindowLayer } from "@/components/windows/window-layer";
import type { Notice } from "@/lib/notifications/notifications";
import type { Prefs } from "@/lib/prefs/prefs";
import type { ReaderPrefs } from "@/lib/reader/prefs";
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
 * column (the page frame's max width, the dock, the island and the window layer).
 */
export function ShellFrame({
  account,
  initialExpanded,
  prefs,
  notices,
  children,
}: {
  account: ShellAccount;
  /** From the cookie, so the server paints the right width: no first-frame jump. */
  initialExpanded: boolean;
  prefs: { initial: Prefs; source: PrefsSource; reader: Partial<ReaderPrefs> | null };
  notices: { initial: Notice[]; source: NoticesSource };
  children: React.ReactNode;
}) {
  // `expanded` is the owner's choice (the cookie); `shown` is what the rail
  // does, which a view that needs the width can hold shut (rail-lock.ts).
  const [expanded, setExpanded] = React.useState(initialExpanded);
  const lock = useRailLock((s) => s.reason);
  const shown = expanded && !lock;

  /** A click passes its event, so a locked note lands at the pointer; a key lands it on the Expand row. */
  const toggle = React.useCallback((event?: React.MouseEvent) => {
    const reason = useRailLock.getState().reason;
    if (!reason) {
      setExpanded((was) => !was);
      return;
    }
    // Enter on a button reports detail 0: treat it as a key.
    const anchor =
      event && event.detail > 0
        ? notePoint(event.clientX, event.clientY)
        : document.querySelector<HTMLElement>("[data-rail-toggle]");
    // A fixed id: repeat presses move and refresh the one note instead of stacking.
    anchoredNote.add({
      id: "rail-locked",
      title: "The sidebar stays collapsed here",
      description: reason,
      positionerProps: { anchor, side: "right" },
    });
  }, []);

  // Persist the choice after a change, never on mount: the server and the
  // <head> boot script already agree with the cookie.
  const mounted = React.useRef(false);
  React.useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return;
    }
    document.cookie = railCookie(expanded);
  }, [expanded]);

  // html[data-rail] follows what is shown, so a later Suspense fallback is drawn at the current width.
  React.useEffect(() => {
    if (shown) document.documentElement.setAttribute(RAIL_ATTR, "open");
    else document.documentElement.removeAttribute(RAIL_ATTR);
  }, [shown]);

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

  const railW = shown ? RAIL_WIDTH.expanded : RAIL_WIDTH.collapsed;

  return (
    <AccountProvider account={account}>
      <QueryProvider>
      <NotesProvider>
      <MoneyProvider>
      <ReaderProvider>
      <PrefsProvider initial={prefs.initial} source={prefs.source}>
      <ReaderPrefsSync initial={prefs.reader} source={prefs.source}>
      <NotificationsProvider initial={notices.initial} source={notices.source}>
      <div
        // shrink-0: body is a flex column and min-h-(--app-h) replaces min-height:auto,
        // so without it the frame shrinks to the viewport and the sticky rail
        // scrolls away on any page taller than the screen.
        className="relative flex min-h-(--app-h) w-full shrink-0 [--rail-w:0px] md:[--rail-w:var(--rail-w-md)]"
        style={{ ["--rail-w-md" as string]: `${railW}px` }}
      >
        <NavRail expanded={shown} onToggle={toggle} className="hidden md:block" />
        {/* No bottom padding here: PageFrame clears the floating dock and tab bar inside the sheet. */}
        <WallpaperMain>{children}</WallpaperMain>
        <MobileTabBar />
        <WindowLayer />
        <Dock />
        <Island />
        <SpeechMediaSession />
        <VoiceOffer />
        <CommandPalette railExpanded={shown} onToggleRail={toggle} />
        <NotificationCentre />
        <Toaster />
        <AnchoredNotes />
        <DesktopOpen />
        <DesktopNative />
        <IslandMirror />
      </div>
      </NotificationsProvider>
      </ReaderPrefsSync>
      </PrefsProvider>
      </ReaderProvider>
      </MoneyProvider>
      </NotesProvider>
      </QueryProvider>
    </AccountProvider>
  );
}
