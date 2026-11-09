"use client";

import * as React from "react";
import { AudioLines, Download, Music, Pause, Play, SkipBack, SkipForward, Square, TrendingUp, TriangleAlert, Wallet } from "lucide-react";
import { useActivitySync } from "@/components/island/activity-sync";
import { LiveActivity, type IslandActivity } from "@/components/island/live-activity";
import { IslandButton } from "@/components/island/money-alert-activity";
import { orderTimers, timerActivity } from "@/components/island/timer-activity";
import { useCoverUrl } from "@/components/media/cover";
import { Equalizer } from "@/components/media/now-playing-card";
import { ProgressRing } from "@/components/ui/progress-ring";
import { rankActivities, type Ranked } from "@/lib/activity/priority";
import { useActivity } from "@/lib/activity/store";
import type { IslandCommand, IslandItem, IslandSnapshot } from "@/lib/island/snapshot";
import { desktopBridge } from "@/lib/platform/desktop";
import { cn } from "@/lib/utils";

/*
 * The desktop's floating island (V70), in its own transparent window over
 * every app while Wanheda is in the background. What's live comes from the
 * main window as a snapshot through the shell; timers come from the shared
 * activity store, like a second tab, with their usual card. Buttons go back
 * through the shell. The window reports where the island sits, so clicks
 * pass through everywhere else.
 */

const send = (command: IslandCommand) => desktopBridge()?.island.command(command);

export function FloatingIsland() {
  const ready = useActivitySync();
  const [snapshot, setSnapshot] = React.useState<IslandSnapshot | null>(null);
  const [over, setOver] = React.useState(false);
  const timers = useActivity((s) => s.timers);

  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let live = true;
    void bridge.island.get().then((s) => {
      if (live && s) setSnapshot(s);
    });
    const offSnapshot = bridge.island.onSnapshot(setSnapshot);
    const offHover = bridge.island.onHover(setOver);
    return () => {
      live = false;
      offSnapshot();
      offHover();
    };
  }, []);

  const ranked = React.useMemo(() => {
    const items = snapshot?.items ?? [];
    const all: Ranked<IslandActivity>[] = [
      ...items.map((item) => ({ item: activityFor(item), kind: rankOf(item), startedAt: item.kind === "media" || item.kind === "speech" ? item.startedAt : 0 })),
      ...orderTimers(timers).map((t) => ({ item: timerActivity(t), kind: "timer" as const, startedAt: t.id === snapshot?.lastTimer ? snapshot.lastTimerAt : 0 })),
    ];
    return rankActivities(all);
  }, [snapshot, timers]);
  const activities = React.useMemo(() => ranked.map((r) => r.item), [ranked]);
  const content = ready && activities.length > 0;

  useReport(content);

  if (!content) return null;
  return (
    <div className="pointer-events-none flex w-full justify-center pt-2">
      <LiveActivity activities={activities} show={ranked[0]?.item.id} showKey={ranked[0]?.startedAt} pointerInside={over} />
    </div>
  );
}

/**
 * Tells the shell whether there's anything to show and where the island sits
 * (it changes size as it opens and morphs), checked ten times a second and
 * sent only when it moves. The window is never throttled, even while hidden.
 */
function useReport(content: boolean) {
  React.useEffect(() => {
    const bridge = desktopBridge();
    if (!bridge) return;
    let last = "";
    const measure = () => {
      const el = content ? document.querySelector("[data-island-shape]") : null;
      const box = el?.getBoundingClientRect();
      // A little slack around the shape, so its shadow and the edge of a click count.
      const pad = 6;
      const rect =
        box && box.width > 0
          ? {
              x: Math.max(0, Math.floor(box.left - pad)),
              y: Math.max(0, Math.floor(box.top - pad)),
              width: Math.min(window.innerWidth, Math.ceil(box.width + pad * 2)),
              height: Math.min(window.innerHeight, Math.ceil(box.height + pad * 2)),
            }
          : null;
      const report = { content, rect };
      const key = JSON.stringify(report);
      if (key === last) return;
      last = key;
      bridge.island.report(report);
    };
    measure();
    const t = setInterval(measure, 100);
    return () => {
      clearInterval(t);
    };
  }, [content]);
}

function rankOf(item: IslandItem): "media" | "speech" | "transfer" | "alert" {
  return item.kind;
}

function activityFor(item: IslandItem): IslandActivity {
  switch (item.kind) {
    case "media":
      return {
        id: item.id,
        label: item.title,
        status: `, ${item.artist}, ${item.playing ? "playing" : "paused"}`,
        leading: <Art coverKey={item.coverKey} />,
        trailing: <Equalizer playing={item.playing} />,
        expanded: <MediaCard item={item} />,
      };
    case "speech":
      return {
        id: item.id,
        label: item.title,
        status: `, ${item.paused ? "paused" : "reading"}, ${percent(item.progress)}`,
        leading: (
          <ProgressRing value={item.progress}>
            {item.paused ? <Pause aria-hidden className="size-3 fill-current" /> : <AudioLines aria-hidden className="size-3" />}
          </ProgressRing>
        ),
        trailing: <span className={cn("tabular text-sm font-semibold", item.paused ? "text-island-foreground/60" : "text-signal")}>{percent(item.progress)}</span>,
        expanded: <SpeechCard item={item} />,
      };
    case "transfer":
      return {
        id: item.id,
        label: item.label,
        status: `, ${item.detail.toLowerCase()}`,
        leading: item.failed ? (
          <TriangleAlert aria-hidden className="size-3.5 text-signal" />
        ) : (
          <ProgressRing value={item.progress ?? 0}>
            <Download aria-hidden className="size-3" />
          </ProgressRing>
        ),
        trailing: (
          <span className={cn("tabular text-sm font-semibold", item.progress !== null ? "text-signal" : "text-island-foreground/60")}>
            {item.failed ? "Failed" : item.progress === null ? "Next" : percent(item.progress)}
          </span>
        ),
        expanded: <Card kicker="In progress" title={item.label} detail={item.detail} />,
      };
    case "alert": {
      const Icon = item.tag === "money" ? Wallet : TrendingUp;
      return {
        id: item.id,
        label: item.title,
        status: item.body ? `, ${item.body}` : "",
        leading: <Icon aria-hidden className="size-3.5 text-signal" />,
        trailing: <span className="text-sm font-semibold text-signal">{item.tag === "money" ? "Money" : "Income"}</span>,
        expanded: <AlertCard item={item} />,
      };
    }
  }
}

const percent = (share: number) => `${String(Math.round(share * 100))}%`;

function Art({ coverKey }: { coverKey: string | null }) {
  const art = useCoverUrl(coverKey);
  return art ? (
    <img src={art} alt="" draggable={false} className="size-6 rounded-md object-cover" />
  ) : (
    <span className="grid size-6 place-items-center rounded-md bg-island-foreground/12">
      <Music aria-hidden className="size-3.5" />
    </span>
  );
}

function Card({ kicker, title, detail, children }: { kicker: string; title: string; detail?: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="min-w-0">
        <p className="text-xs font-medium text-island-foreground/70">{kicker}</p>
        <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{title}</p>
        {detail ? <p className="tabular mt-1 line-clamp-2 text-xs text-island-foreground/70">{detail}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

function RoundButton({ label, onClick, children, big }: { label: string; onClick: () => void; children: React.ReactNode; big?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid shrink-0 place-items-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-signal active:scale-95 motion-reduce:active:scale-100",
        big ? "size-12 bg-island-foreground text-island" : "size-10 bg-island-foreground/12 text-island-foreground hover:bg-island-foreground/20",
      )}
    >
      {children}
    </button>
  );
}

function MediaCard({ item }: { item: Extract<IslandItem, { kind: "media" }> }) {
  return (
    <div className="flex flex-col gap-4 p-5">
      <div className="flex min-w-0 items-center gap-3">
        <BigArt coverKey={item.coverKey} />
        <div className="min-w-0">
          <p className="truncate text-lg leading-tight font-semibold text-island-foreground">{item.title}</p>
          <p className="truncate text-sm text-island-foreground/70">{item.artist || "Unknown artist"}</p>
        </div>
      </div>
      <div className="flex items-center justify-center gap-4">
        <RoundButton label="Previous" onClick={() => send({ kind: "music", action: "previous" })}>
          <SkipBack aria-hidden className="size-4 fill-current" />
        </RoundButton>
        <RoundButton big label={item.playing ? "Pause" : "Play"} onClick={() => send({ kind: "music", action: "toggle" })}>
          {item.playing ? <Pause aria-hidden className="size-5 fill-current" /> : <Play aria-hidden className="size-5 fill-current" />}
        </RoundButton>
        <RoundButton label="Next" onClick={() => send({ kind: "music", action: "next" })}>
          <SkipForward aria-hidden className="size-4 fill-current" />
        </RoundButton>
      </div>
    </div>
  );
}

function BigArt({ coverKey }: { coverKey: string | null }) {
  const art = useCoverUrl(coverKey);
  return art ? (
    <img src={art} alt="" draggable={false} className="size-14 shrink-0 rounded-xl object-cover" />
  ) : (
    <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-island-foreground/12">
      <Music aria-hidden className="size-6" />
    </span>
  );
}

function SpeechCard({ item }: { item: Extract<IslandItem, { kind: "speech" }> }) {
  return (
    <Card kicker="Reading aloud" title={item.title} detail={`${percent(item.progress)} read`}>
      <IslandButton tone="signal" onClick={() => send({ kind: "speech", action: "toggle" })}>
        {item.paused ? "Resume" : "Pause"}
      </IslandButton>
      <IslandButton onClick={() => send({ kind: "speech", action: "stop" })}>
        <Square aria-hidden className="size-3 fill-current" />
        Stop
      </IslandButton>
      {item.path ? <IslandButton onClick={() => send({ kind: "open", path: item.path ?? "/" })}>Open</IslandButton> : null}
    </Card>
  );
}

function AlertCard({ item }: { item: Extract<IslandItem, { kind: "alert" }> }) {
  return (
    <Card kicker={item.tag === "money" ? "Money" : "Income"} title={item.title} detail={item.body}>
      {item.path ? (
        <IslandButton tone="signal" onClick={() => send({ kind: "open", path: item.path ?? "/" })}>
          Open
        </IslandButton>
      ) : null}
      <IslandButton onClick={() => send({ kind: "dismiss", noticeId: item.noticeId })}>Dismiss</IslandButton>
    </Card>
  );
}
