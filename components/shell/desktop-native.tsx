"use client";

import * as React from "react";
import { useFloatingIsland } from "@/components/island/floating-store";
import { useMusicPlayer } from "@/components/media/music-player";
import { useNotesApi } from "@/components/notes/notes-provider";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { usePalette } from "@/components/shell/palette-store";
import { mediaSession } from "@/lib/media/session-owner";
import { desktopBridge, desktopNotice, isDesktopCommand, type DesktopCommand } from "@/lib/platform/desktop";
import { useSpeech } from "@/lib/speech/store";

/**
 * The desktop shell's native side (T76), in the main window only; on the web
 * it does nothing.
 * - New notification-centre rows (a timer done, a money or income alert)
 *   become system notifications; the shell shows them only while the window
 *   is out of sight or unfocused. Rows the shell loaded with are history.
 * - The shell holds the media keys while something can play (V71), and sends
 *   them here for the audible owner (V60).
 * - Its global shortcuts open the palette, and quick capture's text is saved
 *   here through the notes outbox (V23), like any note.
 * - The floating island's buttons (V70) land here, and while it floats the
 *   page's own island steps aside.
 */
export function DesktopNative() {
  const { notices, markRead } = useNotifications();
  const read = React.useRef(markRead);
  React.useEffect(() => {
    read.current = markRead;
  }, [markRead]);
  const notesApi = useNotesApi();
  const notes = React.useRef(notesApi);
  React.useEffect(() => {
    notes.current = notesApi;
  }, [notesApi]);
  const seen = React.useRef<Set<string> | null>(null);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    if (seen.current === null) {
      seen.current = new Set(notices.map((n) => n.id));
      return;
    }
    for (const n of notices) {
      if (seen.current.has(n.id)) continue;
      seen.current.add(n.id);
      if (n.readAt !== null) continue;
      const notice = desktopNotice(n);
      if (notice) bridge.notify(notice);
    }
  }, [notices]);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let held = false;
    const sync = () => {
      const audible = mediaSession.owner !== null;
      if (audible === held) return;
      held = audible;
      bridge.setMediaActive(audible);
    };
    sync();
    const off = mediaSession.subscribe(sync);
    return () => {
      off();
      if (held) bridge.setMediaActive(false);
    };
  }, []);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    const off = bridge.onCommand((command: unknown) => {
      if (!isDesktopCommand(command)) return;
      if (command.kind === "palette") usePalette.getState().setOpen(true);
      else if (command.kind === "media") mediaSession.command(command.action);
      else if (command.kind === "capture") notes.current.capture(command.text);
      else runIslandCommand(command.command, (id) => {
        read.current([id]);
      });
    });
    const offFloating = bridge.island.onFloating((floating) => {
      useFloatingIsland.setState({ floating });
    });
    // Only now may the shell send commands here: a quick note sent to a page without this listener would be lost.
    bridge.setCommandsReady(true);
    return () => {
      bridge.setCommandsReady(false);
      off();
      offFloating();
      useFloatingIsland.setState({ floating: false });
    };
  }, []);

  return null;
}

/** A floating-island button: the music, the reading, or an alert to dismiss (marked read, as in the centre). */
function runIslandCommand(command: Extract<DesktopCommand, { kind: "island" }>["command"], dismiss: (noticeId: string) => void): void {
  if (command.kind === "music") {
    const player = useMusicPlayer.getState();
    if (command.action === "toggle") player.toggle();
    else if (command.action === "next") player.next();
    else player.prev();
  } else if (command.kind === "speech") {
    const speech = useSpeech.getState();
    if (command.action === "toggle") speech.toggle();
    else speech.stop();
  } else {
    dismiss(command.noticeId);
  }
}
