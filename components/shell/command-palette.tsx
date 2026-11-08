"use client";

import * as React from "react";
import { Command } from "cmdk";
import { motion } from "motion/react";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  BookOpenText,
  Clapperboard,
  FastForward,
  Gauge,
  Maximize,
  Music,
  PictureInPicture2,
  RectangleHorizontal,
  Rewind,
  AppWindow,
  Bell,
  CalendarClock,
  CheckCheck,
  LayoutDashboard,
  LogOut,
  Monitor,
  Moon,
  NotebookPen,
  Paintbrush,
  Palette,
  PanelLeft,
  Pause,
  Pencil,
  Play,
  Repeat,
  Repeat1,
  Search,
  Shuffle,
  SkipBack,
  SkipForward,
  Square,
  Volume1,
  Volume2,
  VolumeX,
  SquarePen,
  Sun,
  Timer as TimerIcon,
  DollarSign,
  Download,
  PlugZap,
  RefreshCcw,
  Eye,
  EyeOff,
  Target,
  TrendingUp,
  Wallpaper,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { signOutOk } from "@/components/auth/account-actions";
import { rebuildIncome } from "@/actions/connectors";
import { useIncome } from "@/components/income/use-income";
import { togglePrivacy, usePrivacy } from "@/components/money/privacy";
import { pushUrl, replaceUrlParams } from "@/hooks/use-url-param";
import { formatDuration as formatMediaDuration, mediaHref } from "@/lib/media/media";
import { albumOrder, searchTracks } from "@/lib/media/library";
import { SOUND_MODES, SOUND_MODE_LABELS, soundMixPref } from "@/lib/media/sound-mix";
import { VOLUME_STEP, volumePref } from "@/lib/media/volume";
import { continueList } from "@/lib/media/playback";
import { lastAccountId, newTxn, useMoney, useMoneyApi, useNewSubscription } from "@/components/money/use-money";
import { useNoteSearch, useNotesApi } from "@/components/notes/notes-provider";
import { playerActions, usePlayer } from "@/components/media/player-store";
import { useMusicLibrary } from "@/components/media/music-library";
import { useMusicPlayer } from "@/components/media/music-player";
import { useMedia } from "@/components/media/use-media";
import { openWatch } from "@/components/media/watch-nav";
import { useReader } from "@/components/reader/use-reader";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { usePrefs } from "@/components/prefs/prefs-provider";
import { useAccount } from "@/components/shell/account";
import { usePalette } from "@/components/shell/palette-store";
import { centerOf, revealTheme, type ThemeChoice } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
import { toast } from "@/components/ui/toaster";
import { TAB_SPRING } from "@/lib/motion";
import { useActivity } from "@/lib/activity/store";
import { MINUTE, formatDuration, isDone, isRunning, parseTimerQuery } from "@/lib/activity/timer";
import { BOARD_EDIT_HREF } from "@/lib/board/edit";
import { MODULES, SYSTEM_PAGES, WINDOWS } from "@/lib/modules";
import { continueReading } from "@/lib/reader/reader";
import { formatMoney } from "@/lib/money/currency";
import { todayIn } from "@/lib/money/dates";
import { byId, categoryPath, type Category, type Txn } from "@/lib/money/money";
import { looksLikeQuickAdd, parseQuickAdd } from "@/lib/money/quick-add";
import { parseCapture } from "@/lib/notes/notes";
import { ACCENT_PRESETS, AURORA_EDGES, AURORA_EDGE_LABELS, SKINS, SKIN_LABELS, TIMER_MODE_LABELS, WALLPAPERS, WALLPAPER_COVERS, WALLPAPER_COVER_LABELS, WALLPAPER_LABELS, wallpaperFor, withPageWallpaper } from "@/lib/prefs/prefs";
import { wallpaperPageFor } from "@/lib/prefs/wallpaper-pages";
import { TIMER_MODES } from "@/lib/activity/timer";
import { cn } from "@/lib/utils";
import { useWindows } from "@/lib/windows/store";

/*
  The command palette (FR-SHELL-3): apps from the module registry, timers on
  the activity bus, mini windows, the board, every appearance pref, theme and
  shell commands. Typing a duration ("25",
  "10 min", "1h30") offers to start that timer; "note buy SSD" saves a note
  on Enter (FR-NOTES-3); "4500 food jollof" logs spending (FR-MONEY-3); any
  other words also search note bodies (FR-NOTES-7). Ctrl/⌘K toggles it anywhere;
  `/` opens it when you're not typing.
*/

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
}

const PRESETS = [5, 15, 25, 50] as const;

/** Keys that move cmdk's highlight. */
const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"]);

const THEMES: { choice: ThemeChoice; title: string; short: string; icon: LucideIcon }[] = [
  { choice: "light", title: "Light theme (Ember)", short: "Light", icon: Sun },
  { choice: "dark", title: "Dark theme (Nebula)", short: "Dark", icon: Moon },
  { choice: "system", title: "Match the system theme", short: "System", icon: Monitor },
];

export function CommandPalette({ railExpanded, onToggleRail }: { railExpanded: boolean; onToggleRail: () => void }) {
  const { open, setOpen } = usePalette();
  // The highlighted item, controlled so a quick capture or the best note hit
  // can take it over cmdk's own fuzzy ranking (which loosely matches anything).
  const [selected, setSelected] = React.useState("");

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!usePalette.getState().open);
      } else if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey && !isTyping(e.target)) {
        e.preventDefault();
        setOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
    };
  }, [setOpen]);

  return (
    <Command.Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setSelected("");
        setOpen(next);
      }}
      value={selected}
      onValueChange={setSelected}
      label="Command palette"
      loop
      overlayClassName="fixed inset-0 z-50 bg-background/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0"
      contentClassName={cn(
        "glass fixed top-[12%] left-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl -translate-x-1/2 rounded-card p-3 shadow-lift outline-none",
        "duration-150 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
      )}
      className="[&_[cmdk-group-heading]]:readout [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:pb-1.5"
    >
      {/* Mounted per open, so the query starts empty every time. */}
      {open && (
        <PaletteBody
          select={setSelected}
          railExpanded={railExpanded}
          onToggleRail={onToggleRail}
          close={() => {
            setOpen(false);
          }}
        />
      )}
    </Command.Dialog>
  );
}

function PaletteBody({
  select,
  railExpanded,
  onToggleRail,
  close,
}: {
  select: (value: string) => void;
  railExpanded: boolean;
  onToggleRail: () => void;
  close: () => void;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const timers = useActivity((s) => s.timers);
  const { startTimer, toggleTimer, cancelTimer } = useActivity.getState();
  const openWindows = useWindows((s) => s.open);
  const { openWindow, closeWindow } = useWindows.getState();
  const notifications = useNotifications();
  const { prefs, update } = usePrefs();
  const account = useAccount();
  const pathname = usePathname();
  // The page the wallpaper commands act on; a route no page owns falls back to Home.
  const wallpaperPage = wallpaperPageFor(pathname) ?? "home";
  // What this page wears now: on Money under the Home scope that is none, so no scene reads as in use.
  const currentWallpaper = wallpaperFor(prefs, wallpaperPage);
  const [signOutState, setSignOutState] = React.useState<"idle" | "pending" | "failed">("idle");
  // The body mounts per open, so "done" is judged as of opening.
  const [openedAt] = React.useState(Date.now);
  const typedTimer = parseTimerQuery(query);
  const notesApi = useNotesApi();
  const askNewSubscription = useNewSubscription((s) => s.ask);
  const captured = parseCapture(query);
  // A duration wins ("25" starts a timer); anything else that starts with an amount is money.
  const moneyQuery = typedTimer === null && captured === null && looksLikeQuickAdd(query) ? query : null;
  const money = useMoney({ enabled: moneyQuery !== null });
  const moneyApi = useMoneyApi();
  const privacy = usePrivacy();
  // Cache only: per-product income commands show once Income (or its widget) has loaded.
  const incomeProducts = useIncome({ enabled: false }).data?.products.filter((p) => !p.archived) ?? [];
  // Cache only, like income: what Reader (or its widget) last loaded.
  const reading = continueReading(useReader({ enabled: false }).data?.documents ?? [], 5);
  // Cache only: what /media last loaded.
  const mediaItems = useMedia({ enabled: false }).data?.items ?? [];
  const going = continueList(mediaItems, 3);
  // Music (T63): the index this device already holds; matches only once something is typed.
  const musicTracks = useMusicLibrary((s) => s.tracks);
  const musicHits = React.useMemo(
    () => (query.trim().length >= 2 && musicTracks ? searchTracks(musicTracks, query).slice(0, 6) : []),
    [musicTracks, query],
  );
  const media = mediaItems.filter((m) => !going.some((g) => g.id === m.id)).slice(0, 5);
  // The music player (T64): its controls while it holds a song.
  const musicTrack = useMusicPlayer((s) => (s.status === "idle" ? null : s.track));
  const musicPlaying = useMusicPlayer((s) => s.status === "playing");
  const musicShuffle = useMusicPlayer((s) => s.shuffle);
  const musicRepeat = useMusicPlayer((s) => s.repeat);
  const soundMix = soundMixPref.use();
  const musicVolume = volumePref.use();
  // A video playing on /media: its controls, with the skin's own keys as hints (T62).
  const playerEl = usePlayer((s) => s.el);
  const playerTitle = usePlayer((s) => s.title);
  const playerControls = usePlayer((s) => s.controls);
  const playerTheatre = usePlayer((s) => s.theatre);
  const player = playerEl ? { el: playerEl, title: playerTitle ?? "Video", controls: playerControls, theatre: playerTheatre } : null;
  const quick =
    moneyQuery !== null && money.data
      ? parseQuickAdd(moneyQuery, {
          accounts: money.data.accounts,
          categories: money.data.categories,
          defaultAccountId: lastAccountId(),
          today: todayIn(money.data.timeZone),
        })
      : null;
  const noteSearch = useNoteSearch(query, typedTimer === null && captured === null && moneyQuery === null);
  const firstHit = noteSearch.kind === "hits" ? noteSearch.hits[0]?.id : undefined;
  const preferred = captured !== null ? "note-capture" : moneyQuery !== null ? "money-add" : firstHit ? `note-hit-${firstHit}` : null;
  // The best note row takes the highlight, on every new query and when late
  // hits arrive, until the owner moves it (keys or pointer) for this query.
  const [movedAt, setMovedAt] = React.useState<string | null>(null);
  const moved = movedAt === query;
  React.useEffect(() => {
    if (preferred && !moved) select(preferred);
  }, [preferred, moved, query, select]);
  const noteMove = () => {
    setMovedAt(query);
  };
  // The highlight shows only while it's being driven: by the pointer over the
  // list, or by typing and arrow keys. Opened untouched, or once the pointer
  // leaves, it fades, and Enter on a faded row only brings it back, so nothing
  // you can't see ever runs (user 2026-11-05).
  const [cursor, setCursor] = React.useState<"idle" | "keys" | "pointer">("idle");
  const faded = cursor === "idle";
  // cmdk's empty state ignores force-mounted rows, so it is ours to hide when they show.
  const forcedRows =
    captured !== null || moneyQuery !== null || noteSearch.kind === "failed" || (noteSearch.kind === "hits" && noteSearch.hits.length > 0);

  const run = (fn: () => void) => () => {
    close();
    fn();
  };

  return (
    <>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-5 size-4 -translate-y-1/2 text-ink-3" />
        <Command.Input
          autoFocus
          value={query}
          onValueChange={(q) => {
            setQuery(q);
            setCursor("keys");
          }}
          onKeyDown={(e) => {
            if (MOVE_KEYS.has(e.key)) {
              noteMove();
              setCursor("keys");
            } else if (e.key === "Enter" && faded) {
              e.preventDefault();
              setCursor("keys");
            }
          }}
          placeholder="Search apps, commands and notes. 25 starts a timer, note … saves one, 4500 food logs spending"
          className="h-12 w-full rounded-full bg-sheet pr-5 pl-12 text-[15px] text-foreground ring-1 ring-border outline-none placeholder:text-ink-3 focus-visible:ring-2 focus-visible:ring-ring dark:bg-card-nested dark:ring-glass-border"
        />
      </div>
      <Command.List
        data-faded={faded || undefined}
        onPointerMove={() => {
          noteMove();
          setCursor("pointer");
        }}
        onPointerLeave={() => {
          setCursor((c) => (c === "pointer" ? "idle" : c));
        }}
        className="group/list mt-2 max-h-[min(24rem,60svh)] overflow-y-auto scroll-fade overscroll-contain"
      >
        {!forcedRows && (
          <Command.Empty className="px-3 py-6 text-center text-[13px] text-ink-2">
            {noteSearch.kind === "loading" ? "Searching notes" : "Nothing by that name."}
          </Command.Empty>
        )}

        {typedTimer !== null && !PRESETS.some((min) => min * MINUTE === typedTimer) && (
          <Command.Group heading="Start" forceMount>
            <Item
              forceMount
              value={`start-typed-${String(typedTimer)}`}
              icon={TimerIcon}
              title={`Start a ${formatDuration(typedTimer)} timer`}
              onSelect={run(() => startTimer(typedTimer))}
            />
          </Command.Group>
        )}

        {captured !== null && (
          <Command.Group heading="Capture" forceMount>
            <Item
              forceMount
              value="note-capture"
              icon={NotebookPen}
              title={`Save note: ${captured.length > 60 ? `${captured.slice(0, 59)}…` : captured}`}
              hint="Enter"
              onSelect={run(() => {
                notesApi.capture(captured);
              })}
            />
          </Command.Group>
        )}

        {moneyQuery !== null && (
          <Command.Group heading="Money" forceMount>
            {quick?.ok ? (
              <Item
                forceMount
                value="money-add"
                icon={DollarSign}
                title={quickTitle(quick.draft, money.data)}
                hint="Enter"
                onSelect={run(() => {
                  const d = quick.draft;
                  moneyApi.save(newTxn(d), { isNew: true });
                  toast({
                    title: `Added ${quickTitle(d, money.data, false)}`,
                    ...(pathname === "/money" ? {} : { action: { label: "Open Money", href: "/money" } }),
                  });
                })}
              />
            ) : (
              <Item
                forceMount
                disabled
                value="money-add"
                icon={DollarSign}
                title={
                  quick === null
                    ? money.failed
                      ? "Money could not load"
                      : "Loading money"
                    : quick.reason === "no-account"
                      ? quick.currency
                        ? `No open ${quick.currency} account`
                        : "No open account yet"
                      : "Not an amount"
                }
                onSelect={() => undefined}
              />
            )}
          </Command.Group>
        )}

        {noteSearch.kind === "failed" && (
          <Command.Group heading="Notes" forceMount>
            <Item forceMount disabled value="note-search-failed" icon={NotebookPen} title="Note search failed" hint="Try again" onSelect={() => undefined} />
          </Command.Group>
        )}
        {noteSearch.kind === "hits" && noteSearch.hits.length > 0 && (
          <Command.Group heading="Notes" forceMount>
            {noteSearch.hits.map((hit) => (
              <Item
                key={hit.id}
                forceMount
                value={`note-hit-${hit.id}`}
                icon={NotebookPen}
                title={hit.title}
                {...(hit.snippet ? { hint: hit.snippet } : {})}
                onSelect={run(() => {
                  router.push(`/notes?n=${hit.id}`);
                })}
              />
            ))}
          </Command.Group>
        )}

        <Command.Group heading="Apps">
          {[...MODULES, ...SYSTEM_PAGES].map((m) => (
            <Item
              key={m.id}
              value={`app-${m.id}`}
              keywords={[m.title, m.blurb, "go", "open"]}
              icon={m.icon}
              title={m.title}
              hint={m.blurb}
              onSelect={run(() => {
                router.push(m.route);
              })}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Timers">
          {timers.map((t) => {
            const done = isDone(t, openedAt);
            return (
              <React.Fragment key={t.id}>
                {done ? null : (
                  <Item
                    value={`timer-toggle-${t.id}`}
                    keywords={["timer", t.label, isRunning(t) ? "pause" : "resume"]}
                    icon={isRunning(t) ? Pause : Play}
                    title={`${isRunning(t) ? "Pause" : "Resume"} ${t.label}`}
                    onSelect={run(() => {
                      toggleTimer(t.id);
                    })}
                  />
                )}
                <Item
                  value={`timer-cancel-${t.id}`}
                  keywords={["timer", t.label, "cancel", "stop", "dismiss"]}
                  icon={X}
                  title={`${done ? "Dismiss" : "Cancel"} ${t.label}`}
                  onSelect={run(() => {
                    cancelTimer(t.id);
                  })}
                />
              </React.Fragment>
            );
          })}
          {PRESETS.map((min) => (
            <Item
              key={min}
              value={`timer-start-${String(min)}`}
              keywords={["timer", "start", "focus", "countdown", `${String(min)} min`]}
              icon={TimerIcon}
              title={`Start a ${String(min)} min timer`}
              onSelect={run(() => startTimer(min * MINUTE))}
            />
          ))}
        </Command.Group>

        <Command.Group heading="Money">
          <Item
            value="money-subscription-new"
            keywords={["subscription", "new", "add", "recurring", "renewal", "trial", "netflix", "sub"]}
            icon={Repeat}
            title="New subscription"
            onSelect={run(() => {
              askNewSubscription();
              router.push("/money/subscriptions");
            })}
          />
          <Item
            value="money-subscriptions"
            keywords={["subscriptions", "renewals", "upcoming", "recurring", "cut", "monthly", "yearly"]}
            icon={CalendarClock}
            title="Open subscriptions"
            onSelect={run(() => {
              router.push("/money/subscriptions");
            })}
          />
          <Item
            value="money-privacy"
            keywords={["privacy", "hide", "show", "amounts", "blur", "figures", "screen", "share"]}
            icon={privacy ? Eye : EyeOff}
            title={privacy ? "Show amounts" : "Hide amounts (privacy mode)"}
            hint="H"
            onSelect={run(togglePrivacy)}
          />
          <Item
            value="money-budgets"
            keywords={["budget", "budgets", "limit", "spending", "month", "envelope"]}
            icon={Target}
            title="Open budgets"
            onSelect={run(() => {
              router.push("/money/budgets");
            })}
          />
          <Item
            value="money-rules"
            keywords={["rules", "rule", "auto", "categorise", "categorize", "payee", "tag"]}
            icon={Wand2}
            title="Open rules"
            onSelect={run(() => {
              router.push("/money/rules");
            })}
          />
          <Item
            value="money-export"
            keywords={["export", "download", "csv", "json", "backup", "money"]}
            icon={Download}
            title="Export money (CSV, JSON)"
            onSelect={run(() => {
              router.push("/settings?s=money");
            })}
          />
          <Item
            value="connections"
            keywords={["polar", "connect", "connector", "webhook", "token", "products", "income", "mrr", "sync"]}
            icon={PlugZap}
            title="Open connections (Polar)"
            onSelect={run(() => {
              router.push("/settings?s=connections");
            })}
          />
          {incomeProducts.length > 1
            ? incomeProducts.map((p) => (
                <Item
                  key={p.id}
                  value={`income-product-${p.id}`}
                  keywords={["income", "mrr", "revenue", "churn", "product", p.name]}
                  icon={TrendingUp}
                  title={`Open ${p.name} income`}
                  onSelect={run(() => {
                    // On /income the view follows the param in place; from elsewhere the hop reads it on mount.
                    if (pathname === "/income") replaceUrlParams({ product: p.id, currency: null });
                    else router.push(`/income?product=${encodeURIComponent(p.id)}`);
                  })}
                />
              ))
            : null}
          <Item
            value="income-net"
            keywords={["net", "income", "spending", "savings", "rate", "runway", "cash", "burn"]}
            icon={TrendingUp}
            title="Open net income and runway"
            onSelect={run(() => {
              router.push("/income/net");
            })}
          />
          <Item
            value="income-goals"
            keywords={["goal", "goals", "target", "mrr", "save", "savings", "projection", "on track"]}
            icon={Target}
            title="Open goals"
            onSelect={run(() => {
              router.push("/income/goals");
            })}
          />
          <Item
            value="income-rebuild"
            keywords={["rebuild", "recompute", "income", "mrr", "movements", "polar", "metrics"]}
            icon={RefreshCcw}
            title="Rebuild income figures"
            onSelect={run(() => {
              void rebuildIncome().then(
                (r) => {
                  toast(
                    r.ok
                      ? { title: "Income figures rebuilt", body: r.connectors === 0 ? "No connector yet." : `${String(r.movements)} MRR movements from ${String(r.connectors)} connector${r.connectors === 1 ? "" : "s"}.` }
                      : { title: r.reason === "demo" ? "Demo income isn't stored" : r.reason === "off" ? "Connectors are off" : "Couldn't rebuild income figures" },
                  );
                },
                () => {
                  toast({ title: "Couldn't rebuild income figures" });
                },
              );
            })}
          />
        </Command.Group>

        <Command.Group heading="Notes">
          <Item
            value="notes-new"
            keywords={["note", "new", "create", "sticky", "write", "capture"]}
            icon={SquarePen}
            title="New note"
            onSelect={run(() => {
              router.push(`/notes?n=${notesApi.create()}`);
            })}
          />
          <Item
            value="notes-board"
            keywords={["note", "notes", "board", "sticky", "canvas", "open"]}
            icon={LayoutDashboard}
            title="Open notes board"
            onSelect={run(() => {
              router.push("/notes?view=board");
            })}
          />
        </Command.Group>

        {reading.length > 0 ? (
          <Command.Group heading="Reader">
            {reading.map((d) => (
              <Item
                key={d.id}
                value={`reader-continue-${d.id}`}
                keywords={["read", "reading", "continue", "resume", "book", "pdf", d.title, d.author ?? ""]}
                icon={BookOpenText}
                title={`Continue ${d.title}`}
                hint={d.progress ? `${String(d.progress.percent)}%` : "Not started"}
                onSelect={run(() => {
                  // On /reader the view follows the param in place; from elsewhere the hop reads it on mount.
                  if (pathname === "/reader") pushUrl(`/reader?d=${encodeURIComponent(d.id)}`);
                  else router.push(`/reader?d=${encodeURIComponent(d.id)}`);
                })}
              />
            ))}
          </Command.Group>
        ) : null}

        <Command.Group heading="Music">
          {musicHits.map((t) => (
            <Item
              key={t.path}
              value={`music-track-${t.path}`}
              keywords={[t.title, t.artist, t.album, "music", "song"]}
              icon={Play}
              title={`Play ${t.title} · ${t.artist}`}
              hint={t.album}
              onSelect={run(() => {
                // The song, with the rest of its album queued after it.
                const album = (musicTracks ?? []).filter((x) => x.albumArtist === t.albumArtist && x.album === t.album).sort(albumOrder);
                useMusicPlayer.getState().playList(album, Math.max(0, album.findIndex((x) => x.path === t.path)));
              })}
            />
          ))}
          <Item
            value="music-open"
            keywords={["music", "library", "songs", "albums", "artists", "browse"]}
            icon={Music}
            title="Music library"
            onSelect={run(() => {
              if (pathname === "/media") pushUrl("/media?tab=music");
              else router.push("/media?tab=music");
            })}
          />
        </Command.Group>

        {musicTrack ? (
          <Command.Group heading="Music player">
            <Item
              value="music-toggle"
              keywords={["play", "pause", "music", "song", musicTrack.artist]}
              icon={musicPlaying ? Pause : Play}
              title={`${musicPlaying ? "Pause" : "Play"} ${musicTrack.title}`}
              hint={musicTrack.artist}
              onSelect={run(() => {
                useMusicPlayer.getState().toggle();
              })}
            />
            <Item
              value="music-next"
              keywords={["next", "skip", "track", "song", "music"]}
              icon={SkipForward}
              title="Next track"
              onSelect={run(() => {
                useMusicPlayer.getState().next();
              })}
            />
            <Item
              value="music-prev"
              keywords={["previous", "back", "track", "song", "music"]}
              icon={SkipBack}
              title="Previous track"
              onSelect={run(() => {
                useMusicPlayer.getState().prev();
              })}
            />
            <Item
              value="music-shuffle"
              keywords={["shuffle", "random", "music"]}
              icon={Shuffle}
              title={musicShuffle ? "Turn shuffle off" : "Turn shuffle on"}
              onSelect={run(() => {
                useMusicPlayer.getState().setShuffle(!musicShuffle);
              })}
            />
            <Item
              value="music-repeat"
              keywords={["repeat", "loop", "music"]}
              icon={musicRepeat === "all" ? Repeat1 : Repeat}
              title={musicRepeat === "off" ? "Repeat the queue" : musicRepeat === "all" ? "Repeat this track" : "Turn repeat off"}
              onSelect={run(() => {
                useMusicPlayer.getState().cycleRepeat();
              })}
            />
            <Item
              value="music-mute"
              keywords={["mute", "unmute", "volume", "sound", "music"]}
              icon={musicVolume.muted ? Volume2 : VolumeX}
              title={musicVolume.muted ? "Unmute music" : "Mute music"}
              onSelect={run(() => {
                useMusicPlayer.getState().toggleMute();
              })}
            />
            <Item
              value="music-volume-up"
              keywords={["volume", "louder", "up", "sound", "music"]}
              icon={Volume2}
              title={`Volume up (now ${String(Math.round((musicVolume.muted ? 0 : musicVolume.level) * 100))}%)`}
              onSelect={run(() => {
                useMusicPlayer.getState().nudgeVolume(VOLUME_STEP);
              })}
            />
            <Item
              value="music-volume-down"
              keywords={["volume", "quieter", "down", "softer", "sound", "music"]}
              icon={Volume1}
              title={`Volume down (now ${String(Math.round((musicVolume.muted ? 0 : musicVolume.level) * 100))}%)`}
              onSelect={run(() => {
                useMusicPlayer.getState().nudgeVolume(-VOLUME_STEP);
              })}
            />
            <Item
              value="music-stop"
              keywords={["stop", "music", "clear", "queue"]}
              icon={Square}
              title="Stop music"
              onSelect={run(() => {
                useMusicPlayer.getState().stop();
              })}
            />
          </Command.Group>
        ) : null}

        {player ? (
          <Command.Group heading="Player">
            <Item
              value="player-toggle"
              keywords={["play", "pause", "video"]}
              icon={player.el.paused ? Play : Pause}
              title={`${player.el.paused ? "Play" : "Pause"} ${player.title}`}
              hint="K"
              onSelect={run(() => {
                playerActions.toggle();
              })}
            />
            <Item
              value="player-back"
              keywords={["rewind", "back", "seek"]}
              icon={Rewind}
              title="Back 10 seconds"
              hint="J"
              onSelect={run(() => {
                playerActions.seek(-10);
              })}
            />
            <Item
              value="player-forward"
              keywords={["forward", "skip", "seek"]}
              icon={FastForward}
              title="Forward 10 seconds"
              hint="L"
              onSelect={run(() => {
                playerActions.seek(10);
              })}
            />
            <Item
              value="player-faster"
              keywords={["speed", "faster", "rate"]}
              icon={Gauge}
              title={`Faster (now ${String(player.el.playbackRate)}×)`}
              hint=">"
              onSelect={run(() => {
                playerActions.speed(1);
              })}
            />
            <Item
              value="player-slower"
              keywords={["speed", "slower", "rate"]}
              icon={Gauge}
              title={`Slower (now ${String(player.el.playbackRate)}×)`}
              hint="<"
              onSelect={run(() => {
                playerActions.speed(-1);
              })}
            />
            {player.controls ? (
              <>
                <Item
                  value="player-pip"
                  keywords={["picture in picture", "pip", "float"]}
                  icon={PictureInPicture2}
                  title="Picture in picture"
                  hint="I"
                  onSelect={run(() => {
                    player.controls?.togglePictureInPicture();
                  })}
                />
                <Item
                  value="player-fullscreen"
                  keywords={["fullscreen", "full screen"]}
                  icon={Maximize}
                  title="Fullscreen"
                  hint="F"
                  onSelect={run(() => {
                    player.controls?.toggleFullscreen();
                  })}
                />
              </>
            ) : null}
            <Item
              value="player-theatre"
              keywords={["theatre", "theater", "wide", "cinema"]}
              icon={RectangleHorizontal}
              title={player.theatre ? "Leave theatre mode" : "Theatre mode"}
              hint="T"
              onSelect={run(() => {
                usePlayer.getState().setTheatre(!player.theatre);
              })}
            />
          </Command.Group>
        ) : null}

        {going.length + media.length > 0 ? (
          <Command.Group heading="Media">
            {going.map((m) => (
              <Item
                key={m.id}
                value={`media-continue-${m.id}`}
                keywords={["continue", "resume", "watch", "video", "media", m.title]}
                icon={m.kind === "audio" ? Music : Clapperboard}
                title={`Continue ${m.title}`}
                hint={formatMediaDuration(m.progress.positionS)}
                onSelect={run(() => {
                  if (pathname === "/media") openWatch(m.id);
                  else router.push(mediaHref(m.id));
                })}
              />
            ))}
            {media.map((m) => (
              <Item
                key={m.id}
                value={`media-play-${m.id}`}
                keywords={["play", "watch", "listen", "video", "media", m.title]}
                icon={m.kind === "audio" ? Music : Clapperboard}
                title={`Play ${m.title}`}
                {...(m.durationS ? { hint: formatMediaDuration(m.durationS) } : {})}
                onSelect={run(() => {
                  if (pathname === "/media") openWatch(m.id);
                  else router.push(mediaHref(m.id));
                })}
              />
            ))}
          </Command.Group>
        ) : null}

        <Command.Group heading="Notifications">
          <Item
            value="notifications-open"
            keywords={["notifications", "alerts", "inbox", "bell", "unread"]}
            icon={Bell}
            title="Open notifications"
            {...(notifications.unread > 0 ? { hint: `${String(notifications.unread)} unread` } : {})}
            onSelect={run(() => {
              notifications.setOpen(true);
            })}
          />
          {notifications.unread > 0 && (
            <Item
              value="notifications-read-all"
              keywords={["notifications", "alerts", "mark all read", "clear", "unread"]}
              icon={CheckCheck}
              title="Mark all notifications read"
              onSelect={run(() => {
                notifications.markRead("all");
              })}
            />
          )}
        </Command.Group>

        <Command.Group heading="Board">
          <Item
            value="board-edit"
            keywords={["board", "home", "edit", "arrange", "widgets", "add widget", "layout"]}
            icon={Pencil}
            title="Edit the board"
            hint="Arrange and add widgets"
            onSelect={run(() => {
              // Already home: flip the flag in place, no server round trip.
              if (pathname === "/") window.history.replaceState(null, "", BOARD_EDIT_HREF);
              else router.push(BOARD_EDIT_HREF);
            })}
          />
        </Command.Group>

        <Command.Group heading="Windows">
          {WINDOWS.map((w) => {
            const isOpen = openWindows.includes(w.id);
            return (
              <Item
                key={w.id}
                value={`window-${w.id}`}
                keywords={["window", "mini", "float", "pop out", w.title]}
                icon={isOpen ? X : AppWindow}
                title={`${isOpen ? "Close" : "Open"} the ${w.title.toLowerCase()} window`}
                onSelect={run(() => {
                  if (isOpen) closeWindow(w.id);
                  else openWindow(w.id);
                })}
              />
            );
          })}
        </Command.Group>

        {/* The prefs would bury the apps, so they wait for a word ("skin", "accent", "wallpaper"); a typed duration fuzzy-matches them too. */}
        {query.trim() !== "" && typedTimer === null && (
        <Command.Group heading="Settings">
          {SKINS.map((skin) => (
            <Item
              key={skin}
              value={`skin-${skin}`}
              keywords={["skin", "appearance", "look", SKIN_LABELS[skin]]}
              icon={Paintbrush}
              title={`Skin: ${SKIN_LABELS[skin]}`}
              {...inUse(prefs.skin === skin)}
              onSelect={run(() => {
                update({ skin });
              })}
            />
          ))}
          <Item
            value="accent-skin"
            keywords={["accent", "colour", "color", "signal", "default"]}
            icon={Palette}
            title="Accent: the skin's own"
            {...inUse(prefs.accent === null)}
            onSelect={run(() => {
              update({ accent: null });
            })}
          />
          {ACCENT_PRESETS.map((p) => (
            <Item
              key={p.hex}
              value={`accent-${p.hex}`}
              keywords={["accent", "colour", "color", "signal", p.name]}
              icon={Palette}
              title={`Accent: ${p.name}`}
              {...inUse(prefs.accent === p.hex)}
              onSelect={run(() => {
                update({ accent: p.hex });
              })}
            />
          ))}
          {/* Per page, the wallpaper commands set this page's scene; otherwise the one wallpaper (SPEC V64). */}
          {WALLPAPERS.map((wallpaper) => (
            <Item
              key={wallpaper}
              value={`wallpaper-${wallpaper}`}
              keywords={["wallpaper", "background", "home", "page", WALLPAPER_LABELS[wallpaper]]}
              icon={Wallpaper}
              title={`Wallpaper: ${WALLPAPER_LABELS[wallpaper]}`}
              {...inUse(currentWallpaper === wallpaper)}
              onSelect={run(() => {
                if (prefs.wallpaperScope !== "pages") {
                  update({ wallpaper });
                  return;
                }
                update({ wallpaperPages: withPageWallpaper(prefs.wallpaperPages, wallpaperPage, wallpaper) });
              })}
            />
          ))}
          {WALLPAPER_COVERS.map((wallpaperCover) => (
            <Item
              key={wallpaperCover}
              value={`wallpaper-cover-${wallpaperCover}`}
              keywords={["wallpaper", "background", "cover", "whole", "page", "top bar", WALLPAPER_COVER_LABELS[wallpaperCover]]}
              icon={Wallpaper}
              title={`Wallpaper covers: ${WALLPAPER_COVER_LABELS[wallpaperCover].toLowerCase()}`}
              {...inUse(prefs.wallpaperCover === wallpaperCover)}
              onSelect={run(() => {
                update({ wallpaperCover });
              })}
            />
          ))}
          {AURORA_EDGES.map((auroraEdge) => (
            <Item
              key={auroraEdge}
              value={`aurora-edge-${auroraEdge}`}
              keywords={["wallpaper", "aurora", "top", "bottom", "edge", AURORA_EDGE_LABELS[auroraEdge]]}
              icon={Wallpaper}
              title={`Aurora from the ${AURORA_EDGE_LABELS[auroraEdge].toLowerCase()}`}
              {...inUse(prefs.auroraEdge === auroraEdge)}
              onSelect={run(() => {
                update({ auroraEdge });
              })}
            />
          ))}
          {SOUND_MODES.map((mode) => (
            <Item
              key={mode}
              value={`sound-mode-${mode}`}
              keywords={["sound", "speech", "music", "video", "duck", "mix", "volume", SOUND_MODE_LABELS[mode]]}
              icon={Volume2}
              title={`Read-aloud over music: ${SOUND_MODE_LABELS[mode]}`}
              {...inUse(soundMix.mode === mode)}
              onSelect={run(() => {
                soundMixPref.set({ ...soundMix, mode });
              })}
            />
          ))}
          {TIMER_MODES.map((timerMode) => (
            <Item
              key={timerMode}
              value={`timer-mode-${timerMode}`}
              keywords={["timer", "repeat", "mode", TIMER_MODE_LABELS[timerMode]]}
              icon={Repeat}
              title={`Repeat timers: ${TIMER_MODE_LABELS[timerMode]}`}
              {...inUse(prefs.timerMode === timerMode)}
              onSelect={run(() => {
                update({ timerMode });
              })}
            />
          ))}
        </Command.Group>
        )}

        {account.kind === "owner" && (
          <Command.Group heading="Account">
            {/* Stays open until it works, so a failure has somewhere to show. */}
            <Item
              value="account-sign-out"
              keywords={["sign out", "log out", "logout", "account", "lock"]}
              icon={LogOut}
              title={{ idle: "Sign out", pending: "Signing out", failed: "Sign-out failed, try again" }[signOutState]}
              onSelect={() => {
                if (signOutState === "pending") return;
                setSignOutState("pending");
                void signOutOk().then((ok) => {
                  if (!ok) {
                    setSignOutState("failed");
                    return;
                  }
                  close();
                  router.replace("/login");
                  router.refresh();
                });
              }}
            />
          </Command.Group>
        )}
      </Command.List>
      <PaletteFooter railExpanded={railExpanded} onToggleRail={onToggleRail} />
    </>
  );
}

/** The hint that marks the pref already in use. */
/** "Spend ₦4,500 · Food & drink · jollof" (or "Income …") for a quick-add draft. */
function quickTitle(
  d: { amountMinor: number; currency: Txn["currency"]; categoryId: string | null; payee: string; postedOn: string; tags: readonly string[] },
  data: { categories: readonly Category[]; timeZone: string } | null,
  verb = true,
): string {
  const cats = byId(data?.categories ?? []);
  const cat = d.categoryId ? cats.get(d.categoryId) : undefined;
  const yesterday = data && d.postedOn !== todayIn(data.timeZone) ? "yesterday" : null;
  const parts = [
    `${verb ? (d.amountMinor > 0 ? "Income " : "Spend ") : ""}${formatMoney({ minor: Math.abs(d.amountMinor), currency: d.currency })}`,
    cat ? `${cat.emoji} ${categoryPath(cat, cats)}` : null,
    d.payee || null,
    yesterday,
    d.tags.length ? d.tags.map((t) => `#${t}`).join(" ") : null,
  ];
  return parts.filter(Boolean).join(" · ");
}

function inUse(on: boolean): { hint?: string } {
  return on ? { hint: "In use" } : {};
}

/*
  Quick toggles pinned under the results, outside the list: they are never
  filtered away, and using them keeps the palette open so the change shows.
*/
function PaletteFooter({ railExpanded, onToggleRail }: { railExpanded: boolean; onToggleRail: () => void }) {
  const { theme, setTheme } = useTheme();
  const indicatorId = React.useId();
  const current = theme ?? "system";

  return (
    <div className="mt-2 flex items-center justify-between gap-3 border-t border-border pt-3 dark:border-glass-border">
      <div
        role="group"
        aria-label="Theme"
        className="flex items-center rounded-pill bg-sheet p-1 ring-1 ring-border dark:bg-background/40 dark:ring-glass-border"
      >
        {THEMES.map((t) => {
          const active = current === t.choice;
          const Icon = t.icon;
          return (
            <button
              key={t.choice}
              type="button"
              aria-pressed={active}
              title={t.title}
              onClick={(e) => {
                revealTheme(t.choice, setTheme, centerOf(e.currentTarget));
              }}
              className={cn(
                "relative isolate inline-flex h-8 items-center gap-1.5 rounded-pill px-3 text-[12px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-3.5",
                active ? "text-inverse-foreground dark:text-signal" : "text-ink-2 hover:text-foreground",
              )}
            >
              {active && (
                <motion.span
                  layoutId={indicatorId}
                  layoutDependency={current}
                  transition={TAB_SPRING}
                  aria-hidden
                  style={{ borderRadius: 9999 }}
                  className="absolute inset-0 -z-10 bg-inverse dark:bg-signal-soft"
                />
              )}
              <Icon strokeWidth={1.75} aria-hidden />
              {t.short}
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onToggleRail}
        aria-expanded={railExpanded}
        className="hidden h-8 items-center gap-2 rounded-pill px-3 text-[12px] font-medium text-ink-2 outline-none hover:bg-card-nested hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:inline-flex dark:hover:bg-accent [&_svg]:size-3.5"
      >
        <PanelLeft strokeWidth={1.75} aria-hidden />
        {railExpanded ? "Collapse sidebar" : "Expand sidebar"}
        <Kbd>[</Kbd>
      </button>
    </div>
  );
}

function Item({
  value,
  keywords,
  icon: Icon,
  title,
  hint,
  forceMount,
  disabled,
  onSelect,
}: {
  value: string;
  keywords?: string[];
  icon: LucideIcon;
  title: string;
  hint?: string;
  forceMount?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <Command.Item
      value={value}
      keywords={[title, ...(keywords ?? [])]}
      {...(forceMount ? { forceMount: true } : {})}
      {...(disabled ? { disabled: true } : {})}
      onSelect={onSelect}
      className="flex h-11 cursor-pointer items-center gap-3 rounded-[14px] px-2 text-ink-2 outline-none transition-colors duration-200 ease-out data-[selected=true]:bg-signal-soft data-[selected=true]:text-foreground group-data-faded/list:data-[selected=true]:bg-transparent"
    >
      <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card-nested text-ink-2 ring-1 ring-border dark:ring-glass-border">
        <Icon className="size-4" strokeWidth={1.75} aria-hidden />
      </span>
      <span className="min-w-0 truncate text-[13.5px] font-medium text-foreground">{title}</span>
      {hint ? <span className="ml-auto max-w-[45%] min-w-0 shrink-0 truncate pl-3 text-[12px] text-ink-3">{hint}</span> : null}
    </Command.Item>
  );
}
