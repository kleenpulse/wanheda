"use client";

import * as React from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import { BookOpen, ChevronLeft, ChevronRight, Keyboard, Palette, PlugZap, Timer, UserRound, Wallet, type LucideIcon } from "lucide-react";
import { AddPasskeyButton, SignOutButton } from "@/components/auth/account-actions";
import { AppearanceSection, PrefsNote, TimersSection } from "@/components/settings/appearance-prefs";
import { ConnectionsSection } from "@/components/settings/connections-section";
import { MoneySection } from "@/components/settings/money-prefs";
import { ReaderSection } from "@/components/settings/reader-prefs";
import { SettingRow, SettingsCard } from "@/components/settings/setting-row";
import { useAccount } from "@/components/shell/account";
import { Kbd } from "@/components/ui/kbd";
import { TAB_SPRING } from "@/lib/motion";
import { cn } from "@/lib/utils";

/*
  Settings, in Raven's layout (email-manager components/settings/settings-board):
  a grouped section rail beside one section's cards on wide sheets, and an
  iOS-style list you drill into on narrow ones. `?s=` holds the section, so
  deep links and Back work and switching never waits on the server.
*/

const GROUPS = ["Preferences", "Data", "You"] as const;

interface Section {
  label: string;
  blurb: string;
  group: (typeof GROUPS)[number];
  icon: LucideIcon;
  /** Shows where prefs are saved, beside the section title. */
  prefs?: boolean;
  /** Saved on this device only (localStorage), not synced: says so beside the title. */
  device?: boolean;
}

const SECTIONS = {
  appearance: {
    label: "Appearance",
    blurb: "The theme, the skin, the accent and Home's wallpaper.",
    group: "Preferences",
    icon: Palette,
    prefs: true,
  },
  timers: {
    label: "Timers",
    blurb: "What starting a timer that's already running does.",
    group: "Preferences",
    icon: Timer,
    prefs: true,
  },
  money: {
    label: "Money",
    blurb: "The base currency, hiding amounts and the export.",
    group: "Preferences",
    icon: Wallet,
  },
  reader: {
    label: "Reader",
    blurb: "Library covers, the book's pages and turn, text size, paper and auto-scroll.",
    group: "Preferences",
    icon: BookOpen,
    device: true,
  },
  keyboard: { label: "Keyboard", blurb: "The shortcuts that work anywhere in Wanheda.", group: "Preferences", icon: Keyboard },
  connections: {
    label: "Connections",
    blurb: "Polar and the products it bills for.",
    group: "Data",
    icon: PlugZap,
  },
  account: { label: "Account", blurb: "Who is signed in, passkeys and signing out.", group: "You", icon: UserRound },
} as const satisfies Record<string, Section>;

type SectionId = keyof typeof SECTIONS;
const SECTION_IDS = Object.keys(SECTIONS) as SectionId[];

function isSectionId(value: string | null): value is SectionId {
  return value !== null && value in SECTIONS;
}

/** The section in `?s=`, set through the History API so Next keeps useSearchParams in step. */
function useSection() {
  const params = useSearchParams();
  const pathname = usePathname();
  const raw = params.get("s");
  const section = isSectionId(raw) ? raw : null;
  const pushed = React.useRef(false);

  const href = (id: SectionId | null) => (id ? `${pathname}?s=${id}` : pathname);
  /** Wide sheets: switching sections replaces the entry. Narrow ones: drilling in pushes, so Back returns to the list. */
  const open = (id: SectionId, drill: boolean) => {
    if (drill) {
      pushed.current = true;
      window.history.pushState(null, "", href(id));
    } else {
      window.history.replaceState(null, "", href(id));
    }
  };
  const close = () => {
    if (pushed.current) {
      pushed.current = false;
      window.history.back();
    } else {
      window.history.replaceState(null, "", href(null));
    }
  };
  return { section, open, close };
}

function Rail({ section, onSelect }: { section: SectionId; onSelect: (id: SectionId, viaKeyboard: boolean) => void }) {
  const indicatorId = React.useId();

  function onKeyDown(e: React.KeyboardEvent) {
    const i = SECTION_IDS.indexOf(section);
    const last = SECTION_IDS.length - 1;
    const keys: Record<string, number> = {
      ArrowDown: i === last ? 0 : i + 1,
      ArrowUp: i === 0 ? last : i - 1,
      Home: 0,
      End: last,
    };
    const next = keys[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = SECTION_IDS[next];
    if (!id) return;
    onSelect(id, true);
    document.getElementById(`settings-tab-${id}`)?.focus();
  }

  return (
    <div role="tablist" aria-orientation="vertical" aria-label="Settings sections" onKeyDown={onKeyDown} className="flex flex-col gap-5">
      {GROUPS.map((group) => (
        <div key={group} role="presentation">
          <p className="readout mb-1.5 px-3.5" role="presentation">
            {group}
          </p>
          <div className="flex flex-col gap-0.5" role="presentation">
            {SECTION_IDS.filter((id) => SECTIONS[id].group === group).map((id) => {
              const selected = id === section;
              const Icon = SECTIONS[id].icon;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  id={`settings-tab-${id}`}
                  aria-selected={selected}
                  aria-controls="settings-panel"
                  tabIndex={selected ? 0 : -1}
                  onClick={() => {
                    onSelect(id, false);
                  }}
                  className={cn(
                    "relative isolate flex h-10 w-full items-center gap-3 rounded-pill px-3.5 text-left text-[13.5px] outline-none transition-[color,transform] duration-150 focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] motion-reduce:active:scale-100",
                    selected ? "font-medium text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
                  )}
                >
                  {selected && (
                    <motion.span
                      layoutId={indicatorId}
                      layoutDependency={section}
                      aria-hidden
                      transition={TAB_SPRING}
                      style={{ borderRadius: 9999 }}
                      className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
                    />
                  )}
                  <Icon aria-hidden className="size-4 shrink-0" strokeWidth={1.75} />
                  <span className="min-w-0 flex-1 truncate">{SECTIONS[id].label}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Narrow sheets: the list you drill into. */
function SectionList({ onOpen }: { onOpen: (id: SectionId) => void }) {
  return (
    <nav aria-label="Settings sections" className="flex flex-col gap-4 @3xl:hidden">
      {GROUPS.map((group) => (
        <section key={group} className="bento overflow-hidden p-0">
          <h2 className="readout px-5 pt-4 pb-1">{group}</h2>
          <ul className="divide-y divide-border/70 dark:divide-glass-border">
            {SECTION_IDS.filter((id) => SECTIONS[id].group === group).map((id) => {
              const Icon = SECTIONS[id].icon;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => {
                      onOpen(id);
                    }}
                    className="flex min-h-14 w-full items-center gap-3.5 px-5 py-3 text-left outline-none transition-colors focus-visible:bg-card-nested active:bg-card-nested"
                  >
                    <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-sheet ring-1 ring-border dark:bg-signal-soft dark:text-signal dark:ring-glass-border">
                      <Icon aria-hidden className="size-4" strokeWidth={1.75} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium text-foreground">{SECTIONS[id].label}</span>
                      <span className="block truncate text-[12.5px] text-ink-2">{SECTIONS[id].blurb}</span>
                    </span>
                    <ChevronRight aria-hidden className="size-4 shrink-0 text-ink-3" />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function SectionHeader({ section, onBack }: { section: SectionId; onBack: () => void }) {
  const s: Section = SECTIONS[section];
  return (
    <div className="mb-5">
      <button
        type="button"
        onClick={onBack}
        className="mb-2 -ml-2 inline-flex h-10 items-center gap-1 rounded-pill pr-3 pl-1.5 text-[13px] text-ink-2 outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring @3xl:hidden"
      >
        <ChevronLeft aria-hidden className="size-4" />
        Settings
      </button>
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="font-display text-[20px] leading-tight tracking-[-0.01em] text-foreground">{s.label}</h2>
          <p className="mt-1 text-[13px] text-ink-2">{s.blurb}</p>
        </div>
        {s.prefs ? (
          <p className="shrink-0 text-right text-[12px] text-ink-2">
            <PrefsNote />
          </p>
        ) : s.device ? (
          <p className="shrink-0 text-right text-[12px] text-ink-2">Saved on this device</p>
        ) : null}
      </div>
    </div>
  );
}

/** What each global shortcut does. Viewing only: rebinding (FR-SHELL-8) comes later. */
const SHORTCUTS: readonly { keys: readonly string[]; label: string; description: string }[] = [
  { keys: ["Ctrl", "K"], label: "Command palette", description: "Open or close it from anywhere. ⌘K on a Mac." },
  { keys: ["/"], label: "Command palette, while not typing", description: "Opens it when no text field has focus." },
  { keys: ["["], label: "Sidebar", description: "Expand or collapse the rail." },
  { keys: ["H"], label: "Privacy mode", description: "Shows every amount as dots on this device, while no text field has focus." },
  { keys: ["←", "→"], label: "Island activities", description: "Step through live activities while the island is open." },
  { keys: ["Esc"], label: "Close", description: "Closes the palette, the island card, a mini window or the notification centre." },
];

function KeyboardSection() {
  return (
    <SettingsCard title="Shortcuts">
      {SHORTCUTS.map((s) => (
        <SettingRow key={s.label} label={s.label} description={s.description}>
          {() => (
            <span className="flex items-center gap-1">
              {s.keys.map((k) => (
                <Kbd key={k} className="h-6 min-w-6 px-1.5 text-[12px]">
                  {k}
                </Kbd>
              ))}
            </span>
          )}
        </SettingRow>
      ))}
    </SettingsCard>
  );
}

function AccountSection() {
  const account = useAccount();
  if (account.kind !== "owner") {
    return (
      <SettingsCard title="Account">
        <SettingRow label="Demo mode" description="No database and no sign-in are set up, so there is no account here. Prefs stay on this device." />
      </SettingsCard>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <SettingsCard title="Signed in">
        <SettingRow label={account.name || account.email} description={<span className="font-mono">{account.email}</span>} />
      </SettingsCard>
      <SettingsCard title="Security">
        <SettingRow label="Passkeys" description="Sign in with your device's lock instead of GitHub." layout="wide">
          {() => <AddPasskeyButton />}
        </SettingRow>
        <SettingRow label="Sign out" description="Ends the session on this device." layout="wide">
          {() => <SignOutButton />}
        </SettingRow>
      </SettingsCard>
    </div>
  );
}

const BODIES: Record<SectionId, () => React.ReactNode> = {
  appearance: AppearanceSection,
  timers: TimersSection,
  money: MoneySection,
  reader: ReaderSection,
  keyboard: KeyboardSection,
  connections: ConnectionsSection,
  account: AccountSection,
};

export function SettingsBoard() {
  const { section: chosen, open, close } = useSection();
  const section: SectionId = chosen ?? "appearance";
  // Keyboard switches skip the entrance, so arrowing through feels instant.
  const [animate, setAnimate] = React.useState(true);
  const listOnly = chosen === null;
  const Body = BODIES[section];

  return (
    <div className="mx-auto flex w-full max-w-[1120px] gap-10">
      {/* layout + layoutRoot: sticky, so the page can scroll under it. The root snaps to
          its new spot and the tab pill animates relative to it; without this the pill
          reads a scroll reset as its own move and flies in (motion-pill-jump). */}
      <motion.aside layout layoutRoot className="sticky top-8 hidden w-52 shrink-0 self-start @3xl:block">
        <Rail
          section={section}
          onSelect={(id, viaKeyboard) => {
            setAnimate(!viaKeyboard);
            open(id, false);
          }}
        />
      </motion.aside>

      <div className="min-w-0 max-w-[680px] flex-1">
        {listOnly && (
          <SectionList
            onOpen={(id) => {
              setAnimate(true);
              open(id, true);
            }}
          />
        )}
        <div
          key={section}
          role="tabpanel"
          id="settings-panel"
          aria-labelledby={`settings-tab-${section}`}
          className={cn(listOnly && "hidden @3xl:block", animate && "entrance")}
        >
          <SectionHeader section={section} onBack={close} />
          <Body />
        </div>
      </div>
    </div>
  );
}
