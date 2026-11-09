"use client";

import * as React from "react";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { buttonClass } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { acceleratorFromKey, acceleratorKeys, desktopBridge, type DesktopShortcutId, type DesktopState } from "@/lib/platform/desktop";

/** The defaults in desktop/shortcuts.ts, for "Reset". */
const DEFAULTS: Record<DesktopShortcutId, string> = { capture: "Ctrl+Shift+Space", palette: "Alt+Space" };

const SHORTCUT_TEXT: Record<DesktopShortcutId, { label: string; description: string }> = {
  capture: { label: "Quick note", description: "A small window over any app. Enter saves it to Notes." },
  palette: { label: "Command palette", description: "Brings Wanheda forward with the palette open." },
};

/** Settings → Desktop (T76), shown only in the desktop app: the shell's own settings, read and changed through its bridge. */
export function DesktopSection() {
  const [state, setState] = React.useState<DesktopState | null>(null);
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let live = true;
    bridge.settings.get().then(
      (s) => {
        if (live) setState(s);
      },
      () => {
        if (live) setFailed(true);
      },
    );
    const off = bridge.settings.onChange(setState);
    return () => {
      live = false;
      off();
    };
  }, []);

  if (failed) {
    return (
      <SettingsCard title="Desktop">
        <SettingRow label="Couldn't read the desktop settings" description="Reload the window (Ctrl+R) and try again." />
      </SettingsCard>
    );
  }
  if (!state) return null;

  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Window">
        <SettingRow
          label="Keep running when the window is closed"
          description="Closing the window hides it in the tray, and music, timers and read-aloud go on. Quit from the tray or File → Quit Wanheda."
        >
          {(labelId) => (
            <Switch
              labelId={labelId}
              on={state.keepRunning}
              onChange={(on) => {
                void desktopBridge()
                  ?.settings.set({ keepRunning: on })
                  .then((r) => {
                    setState(r.state);
                  })
                  .catch(ignore);
              }}
            />
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Island">
        <SettingRow
          label="Float the island over other apps"
          description="While Wanheda is in the background, what's playing, your timers and alerts stay at the top of the screen. Clicks pass through everywhere but the island itself."
        >
          {(labelId) => (
            <Switch
              labelId={labelId}
              on={state.island}
              onChange={(on) => {
                void desktopBridge()
                  ?.settings.set({ island: on })
                  .then((r) => {
                    setState(r.state);
                  })
                  .catch(ignore);
              }}
            />
          )}
        </SettingRow>
      </SettingsCard>

      <SettingsCard title="Shortcuts that work in any app">
        {state.shortcuts.map((s) => (
          <ShortcutRow key={s.id} shortcut={s} onState={setState} />
        ))}
        <SettingRow
          label="Media keys"
          description="Play/pause, next and previous reach what's playing in Wanheda, even when another app had the keys last. When nothing in Wanheda can play, they're left for other apps."
        />
      </SettingsCard>

      <SettingsCard title="Notifications">
        <SettingRow
          label="Timers and alerts"
          description="A finished timer and new money or income alerts show as Windows notifications while Wanheda is in the background. Clicking one opens its page. Windows Settings → Notifications can turn them off."
        />
      </SettingsCard>

      <SettingsCard title="Your keys">
        <SettingRow
          label={state.secrets.mode === "own" ? "Imported from your .env file" : "Demo mode"}
          description={
            state.secrets.mode === "own"
              ? `${String(state.secrets.names)} ${state.secrets.names === 1 ? "setting" : "settings"}, sealed with Windows' keychain. Importing again replaces them; demo mode forgets them. Either restarts Wanheda's server.`
              : "Sample data, with nothing imported. Import your .env file to use your own data; Wanheda takes only the settings it knows and seals them with Windows' keychain."
          }
          layout="wide"
        >
          {() => (
            <span className="flex flex-wrap gap-2">
              <button type="button" className={buttonClass("surface", "pill-sm")} onClick={() => void desktopBridge()?.settings.secrets("import").then(setState).catch(ignore)}>
                {state.secrets.mode === "own" ? "Import again…" : "Import .env file…"}
              </button>
              {state.secrets.mode === "own" ? (
                <button type="button" className={buttonClass("ghost", "pill-sm")} onClick={() => void desktopBridge()?.settings.secrets("demo").then(setState).catch(ignore)}>
                  Use demo mode…
                </button>
              ) : null}
            </span>
          )}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

function ShortcutRow({ shortcut, onState }: { shortcut: DesktopState["shortcuts"][number]; onState: (s: DesktopState) => void }) {
  const [recording, setRecording] = React.useState(false);
  const [clash, setClash] = React.useState(false);
  const text = SHORTCUT_TEXT[shortcut.id];

  const set = React.useCallback(
    (accelerator: string | null) => {
      void desktopBridge()
        ?.settings.set({ shortcut: shortcut.id, accelerator })
        .then((r) => {
          setClash(!r.ok);
          onState(r.state);
        })
        .catch(ignore);
    },
    [shortcut.id, onState],
  );

  React.useEffect(() => {
    if (!recording) return;
    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape" && !e.ctrlKey && !e.altKey && !e.metaKey) {
        setRecording(false);
        return;
      }
      const accelerator = acceleratorFromKey(e);
      if (!accelerator) return;
      setRecording(false);
      set(accelerator);
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
    };
  }, [recording, set]);

  const status =
    clash ? `${otherLabel(shortcut.id)} already uses those keys.`
    : shortcut.status === "taken" ? "Another app holds these keys, so this shortcut is off. Pick other keys."
    : shortcut.status === "off" ? "Turned off."
    : null;

  return (
    <SettingRow
      label={text.label}
      description={
        <>
          {text.description}
          {status ? <span className="mt-1 block text-foreground">{status}</span> : null}
        </>
      }
      layout="wide"
    >
      {() => (
        <span className="flex flex-wrap items-center justify-end gap-2">
          {recording ? (
            <span role="status" className="text-[13px] text-ink-2">
              Press the keys… (Esc cancels; keys Wanheda already uses do their own thing)
            </span>
          ) : shortcut.accelerator ? (
            <span className="flex items-center gap-1" aria-label={shortcut.accelerator}>
              {acceleratorKeys(shortcut.accelerator).map((k) => (
                <Kbd key={k} className="h-6 min-w-6 px-1.5 text-[12px]">
                  {k}
                </Kbd>
              ))}
            </span>
          ) : null}
          <button
            type="button"
            className={buttonClass("surface", "pill-sm")}
            onClick={() => {
              setClash(false);
              setRecording((r) => !r);
            }}
          >
            {recording ? "Cancel" : "Change"}
          </button>
          {shortcut.accelerator === null ? (
            <button type="button" className={buttonClass("ghost", "pill-sm")} onClick={() => { set(DEFAULTS[shortcut.id]); }}>
              Turn on
            </button>
          ) : (
            <button type="button" className={buttonClass("ghost", "pill-sm")} onClick={() => { set(null); }}>
              Turn off
            </button>
          )}
          {shortcut.accelerator !== null && shortcut.accelerator !== DEFAULTS[shortcut.id] ? (
            <button type="button" className={buttonClass("ghost", "pill-sm")} onClick={() => { set(DEFAULTS[shortcut.id]); }}>
              Reset
            </button>
          ) : null}
        </span>
      )}
    </SettingRow>
  );
}

/**
 * A refused change (the shell was restarting its server) or an import that
 * reloaded this page mid-call: the next state push or the reload shows the truth.
 */
function ignore(): void {
  // Nothing to undo.
}

function otherLabel(id: DesktopShortcutId): string {
  return SHORTCUT_TEXT[id === "capture" ? "palette" : "capture"].label;
}

function Switch({ labelId, on, onChange }: { labelId: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-labelledby={labelId}
      onClick={() => {
        onChange(!on);
      }}
      className="group relative inline-flex h-7 w-12 shrink-0 items-center rounded-full bg-signal-soft p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring aria-checked:bg-signal"
    >
      <span
        aria-hidden
        className="size-6 rounded-full bg-card shadow-sm transition-transform duration-200 ease-out-quint motion-reduce:transition-none group-aria-checked:translate-x-5"
      />
    </button>
  );
}
