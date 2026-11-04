"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "@/components/shell/account-menu";
import { activeInk, idleInk } from "@/components/shell/styles";
import { MODULES, SYSTEM_PAGES, isActive } from "@/lib/modules";
import { cn } from "@/lib/utils";

const item =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring [&_svg]:size-[18px]";

/** Below md the rail becomes Raven's floating glass tab bar (FR-SHELL-9). */
export function MobileTabBar() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around rounded-full px-2 shadow-lift md:hidden"
    >
      {[...MODULES, ...SYSTEM_PAGES].map(({ route, title, icon: Icon }) => {
        const active = isActive(pathname, route);
        return (
          <Link
            key={route}
            href={route}
            aria-current={active ? "page" : undefined}
            className={cn(item, active ? cn("bg-inverse dark:bg-signal-soft", activeInk) : idleInk)}
          >
            <Icon strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{title}</span>
          </Link>
        );
      })}
      <AccountMenu side="top" />
    </nav>
  );
}
