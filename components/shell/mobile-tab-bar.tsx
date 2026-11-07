"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, Search } from "lucide-react";
import { AccountMenu } from "@/components/shell/account-menu";
import { usePalette } from "@/components/shell/palette-store";
import { activeInk, idleInk } from "@/components/shell/styles";
import { Menu, MenuContent, MenuLinkItem, MenuTrigger } from "@/components/ui/menu";
import { MODULES, SYSTEM_PAGES, isActive } from "@/lib/modules";
import { splitTabs, tabCapacity } from "@/lib/shell/tab-overflow";
import { cn } from "@/lib/utils";

const item =
  "relative inline-flex size-11 shrink-0 items-center justify-center rounded-full outline-none transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-ring active:scale-95 [&_svg]:size-[18px]";

const ROUTES = [...MODULES, ...SYSTEM_PAGES];
/** Search and the account menu: always on the bar, after the routes. */
const PINNED = 2;
/** The bar's horizontal padding (px-2), left out of the room the tabs share. */
const PAD_X = 16;

/** Menu rows sized for a thumb: 48 px tall, a larger label and icon than the desktop menus. */
const TOUCH_ROW = "h-12 gap-3 rounded-[14px] px-3 text-[15px] [&_svg]:size-5";

/**
 * Below md the rail becomes Raven's floating glass tab bar (FR-SHELL-9). On a
 * narrow phone not every app fits: the bar keeps what fits (the page you're
 * on always among them), and the rest open from a More menu above it.
 */
export function MobileTabBar() {
  const pathname = usePathname();
  const openPalette = usePalette((s) => s.setOpen);
  const bar = React.useRef<HTMLElement>(null);
  // Unknown until measured: everything renders (the server's HTML), then the first layout pass trims it before paint.
  const [capacity, setCapacity] = React.useState<number | null>(null);

  React.useLayoutEffect(() => {
    const el = bar.current;
    if (!el) return;
    const measure = () => {
      setCapacity(tabCapacity(el.clientWidth - PAD_X));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, []);

  const active = ROUTES.findIndex((r) => isActive(pathname, r.route));
  const { bar: shown, more } = capacity === null ? { bar: ROUTES, more: [] } : splitTabs(ROUTES, capacity, PINNED, active);

  return (
    <nav
      ref={bar}
      aria-label="Primary"
      className="glass fixed inset-x-3 bottom-3 z-30 flex h-16 items-center justify-around overflow-hidden rounded-full px-2 shadow-lift md:hidden"
    >
      {shown.map(({ route, title, icon: Icon }) => {
        const on = isActive(pathname, route);
        return (
          <Link
            key={route}
            href={route}
            aria-current={on ? "page" : undefined}
            className={cn(item, on ? cn("bg-inverse dark:bg-signal-soft", activeInk) : idleInk)}
          >
            <Icon strokeWidth={1.75} aria-hidden />
            <span className="sr-only">{title}</span>
          </Link>
        );
      })}
      {more.length > 0 ? (
        <Menu>
          <MenuTrigger aria-label={`More apps, ${String(more.length)}`} className={cn(item, idleInk, "data-[popup-open]:bg-muted data-[popup-open]:text-foreground dark:data-[popup-open]:bg-accent")}>
            <Ellipsis strokeWidth={1.75} aria-hidden />
          </MenuTrigger>
          <MenuContent side="top" align="center" sideOffset={14} className="w-60 p-2">
            {more.map(({ route, title, icon: Icon }) => (
              <MenuLinkItem key={route} render={<Link href={route} />} className={TOUCH_ROW}>
                <Icon strokeWidth={1.75} />
                {title}
              </MenuLinkItem>
            ))}
          </MenuContent>
        </Menu>
      ) : null}
      <button
        type="button"
        onClick={() => {
          openPalette(true);
        }}
        className={cn(item, "text-signal-ink dark:text-signal")}
      >
        <Search strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Search or start a timer</span>
      </button>
      <AccountMenu side="top" />
    </nav>
  );
}
