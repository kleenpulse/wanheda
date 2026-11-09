"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "motion/react";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { NotificationBell } from "@/components/notifications/notification-centre";
import { AccountMenu } from "@/components/shell/account-menu";
import { activeFill, activeInk, circle, idleInk } from "@/components/shell/styles";
import { WanhedaMark } from "@/components/shell/wanheda-mark";
import { ThemeToggle } from "@/components/theme-toggle";
import { Kbd } from "@/components/ui/kbd";
import { Tip, TooltipGroup } from "@/components/ui/tooltip";
import { MODULES, isActive, systemPages, type ModuleManifest } from "@/lib/modules";
import { useAccount } from "@/components/shell/account";
import { TAB_SPRING } from "@/lib/motion";
import { AppIcon } from "@/components/shell/app-icon";
import { cn } from "@/lib/utils";

/*
  Raven's nav rail with one addition, from admin_shadow-garden: it expands.
  Every entry is the same row, a 44px icon box then a label, so collapsed it
  is Raven's 84px rail and expanded it simply widens: nothing reflows, the
  labels fade in beside icons that never move. Tooltips exist only while
  collapsed; expanded, the label is already on screen.
*/

const label =
  "min-w-0 flex-1 truncate text-left text-[13.5px] whitespace-nowrap transition-opacity duration-200 ease-out-quint";

type TipFn = (text: React.ReactNode, el: React.ReactElement) => React.ReactNode;

export function NavRail({
  expanded,
  onToggle,
  className,
}: {
  expanded: boolean;
  onToggle: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const system = systemPages(useAccount().admin);
  const indicatorId = React.useId();
  // The pill moves on click, not on route commit. Waiting for usePathname
  // starts the spring when the new page renders, and a busy main thread drops
  // frames the spring's clock skips over, so the pill jumps (motion-pill-jump).
  // Moved early, the spring runs while the RSC payload is in flight.
  const [pendingRoute, setPendingRoute] = React.useState<string | null>(null);
  const [prevPath, setPrevPath] = React.useState(pathname);
  if (pathname !== prevPath) {
    setPrevPath(pathname);
    setPendingRoute(null);
  }
  const activeRoute =
    pendingRoute ?? [...MODULES, ...system].find((m) => isActive(pathname, m.route))?.route ?? null;

  const hidden = expanded ? "opacity-100" : "pointer-events-none opacity-0";
  const tip: TipFn = (text, el) => (expanded ? el : <Tip label={text} render={el} />);

  const link = (item: ModuleManifest) => (
    <RailLink
      key={item.route}
      item={item}
      active={activeRoute === item.route}
      activeRoute={activeRoute}
      onNavigate={() => {
        setPendingRoute(item.route);
      }}
      indicatorId={indicatorId}
      labelClass={cn(label, hidden)}
      tip={tip}
    />
  );

  return (
    <nav
      aria-label="Primary"
      data-expanded={expanded}
      className={cn(
        "sticky top-(--tb) z-20 h-(--app-h) shrink-0 flex-col gap-4 overflow-x-hidden overflow-y-auto bg-band px-5 py-5 [scrollbar-width:none]",
        "transition-[width] duration-300 ease-out-quint motion-reduce:transition-none",
        "dark:border-r dark:border-rail-border",
        expanded ? "w-[232px]" : "w-[84px]",
        className,
      )}
    >
      <TooltipGroup side="right" sideOffset={12}>
        <Link
          href="/"
          aria-label="Wanheda home"
          className="flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <WanhedaMark />
          <span className={cn(label, "font-display text-[15px] font-semibold tracking-[-0.01em] text-foreground", hidden)}>
            Wanheda
          </span>
        </Link>

        <div className="-mx-1.5 mt-2 flex flex-col gap-1.5 rounded-[28px] bg-sheet p-1.5 ring-1 ring-border dark:bg-card-nested dark:ring-rail-border">
          {MODULES.map(link)}
        </div>

        <div className="mt-auto flex flex-col gap-3">
          <div className="-mx-1.5 flex flex-col gap-1.5 px-1.5">{system.map(link)}</div>
          {tip(
            expanded ? (
              "Collapse"
            ) : (
              <>
                Expand <Kbd>[</Kbd>
              </>
            ),
            <button
              type="button"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
              className="group flex items-center gap-3 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className={cn(circle, "text-ink-2 group-hover:text-foreground")}>
                {expanded ? <PanelLeftClose strokeWidth={1.75} /> : <PanelLeftOpen strokeWidth={1.75} />}
              </span>
              <span className={cn(label, "text-ink-2", hidden)}>Collapse</span>
            </button>,
          )}
          {tip("Notifications", <NotificationBell circleClass={cn(circle, idleInk)} labelClass={cn(label, "text-ink-2", hidden)} />)}
          <div className="flex items-center gap-3">
            <ThemeToggle className={cn(circle, idleInk, "[&_svg]:size-4")} />
            <span aria-hidden className={cn(label, "text-ink-2", hidden)}>
              Theme
            </span>
          </div>
          <AccountMenu withLabel labelClass={hidden} />
        </div>
      </TooltipGroup>
    </nav>
  );
}

function RailLink({
  item,
  active,
  activeRoute,
  onNavigate,
  indicatorId,
  labelClass,
  tip,
}: {
  item: ModuleManifest;
  active: boolean;
  activeRoute: string | null;
  /** Fires only for a client-side navigation (not ⌘-click, not a new tab). */
  onNavigate: () => void;
  indicatorId: string;
  labelClass: string;
  tip: TipFn;
}) {
  return tip(
    item.title,
    <Link
      href={item.route}
      onNavigate={onNavigate}
      aria-current={active ? "page" : undefined}
      className={cn(
        "group relative isolate flex h-11 w-full items-center gap-3 rounded-full outline-none transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-ring",
        active ? activeInk : cn(idleInk, "hover:bg-card dark:hover:bg-accent"),
      )}
    >
      {active && (
        <motion.span
          layoutId={indicatorId}
          layoutDependency={activeRoute}
          aria-hidden
          transition={TAB_SPRING}
          style={{ borderRadius: 9999 }}
          className={cn("absolute inset-0 -z-10", activeFill)}
        />
      )}
      <span className="relative grid size-11 shrink-0 place-items-center [&_svg]:size-[18px]">
        <AppIcon id={item.id} icon={item.icon} strokeWidth={1.75} />
      </span>
      <span className={cn(labelClass, active && "font-medium")}>{item.title}</span>
    </Link>,
  );
}
