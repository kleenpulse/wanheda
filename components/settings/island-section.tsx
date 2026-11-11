"use client";

import * as React from "react";
import { setIslandShown, useIslandShown } from "@/components/island/island-shown";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { Switch } from "@/components/settings/switch";
import { desktopBridge, type DesktopState } from "@/lib/platform/desktop";

/**
 * Settings → Island (owner 2026-11-11): whether the island shows at all on
 * this device, and, in the desktop app, whether it floats over other apps
 * while Wanheda is in the background (the shell's own setting, V70).
 */
export function IslandSection() {
  const shown = useIslandShown();
  const [desktop, setDesktop] = React.useState<DesktopState | null>(null);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let live = true;
    bridge.settings.get().then(
      (s) => {
        if (live) setDesktop(s);
      },
      () => {
        // Unreadable: the row stays out, the rest of the section works.
      },
    );
    const off = bridge.settings.onChange(setDesktop);
    return () => {
      live = false;
      off();
    };
  }, []);

  return (
    <SettingsCard title="Island">
      <SettingRow
        label="Show the island"
        description="The pill at the top of Wanheda with what's live: what's playing, your timers, read-aloud and alerts. Off hides it everywhere on this device. Timers and music carry on, and alerts still reach your notifications."
      >
        {(labelId) => <Switch labelId={labelId} on={shown} onChange={setIslandShown} />}
      </SettingRow>
      {desktop ? (
        <SettingRow
          label="Float it over other apps"
          description={
            shown
              ? "While Wanheda is in the background, the island stays at the top of the screen. Clicks pass through everywhere but the island itself, and you can drag it left or right."
              : "The island is off, so there's nothing to float. Turn on Show the island first."
          }
        >
          {(labelId) => (
            <Switch
              labelId={labelId}
              on={desktop.island}
              disabled={!shown}
              onChange={(on) => {
                void desktopBridge()
                  ?.settings.set({ island: on })
                  .then((r) => {
                    setDesktop(r.state);
                  })
                  .catch(() => {
                    // Nothing to undo: the switch keeps what the shell last said.
                  });
              }}
            />
          )}
        </SettingRow>
      ) : null}
    </SettingsCard>
  );
}
