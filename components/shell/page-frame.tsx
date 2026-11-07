import type * as React from "react";
import { EmptyMark } from "@/components/shell/empty-mark";
import { PrivacyButton } from "@/components/money/privacy";
import { ModeChip } from "@/components/shell/mode-chip";
import { SyncChip } from "@/components/shell/sync-chip";
import { cn } from "@/lib/utils";

/*
  Every page's frame, Raven's grammar (ported from admin_shadow-garden): a
  header on the band (title, subtitle, the page's own actions), then the
  rounded sheet that rises to hold the page's cards.

  The sheet's body is an @container stack. Pages that want columns use
  container variants, never viewport breakpoints: the rail is 84px or 232px,
  so the viewport lies about the room a page has.

  A page whose content scrolls on its own (Music's long list) marks an
  element `data-page-fill`: the frame then fills the screen exactly, the
  sheet's column takes the height left under the header, and the page itself
  never scrolls. CSS has(), so a client-side tab can opt in without the
  server page knowing; the dock clearance moves into that scroller.
*/

const FILL = {
  // A floor: on a very short screen (a phone on its side) the frame stops shrinking and the page scrolls, sheet and all.
  frame: "has-[[data-page-fill]]:h-svh has-[[data-page-fill]]:min-h-[34rem]",
  sheet: "has-[[data-page-fill]]:flex has-[[data-page-fill]]:min-h-0 has-[[data-page-fill]]:flex-col",
  column: "has-[[data-page-fill]]:min-h-0 has-[[data-page-fill]]:flex-1 has-[[data-page-fill]]:pb-0",
};

/** Page width cap, net of the rail: Raven's calc(1900px - rail). Skeletons share it. */
export const PAGE_COLUMN = "mx-auto w-full max-w-[calc(1900px-var(--rail-w))] px-5 md:px-8";

/**
 * Room under a page's last card for the bar floating over the bottom edge:
 * the dock (bottom-5 + h-14) on wide screens, the tab bar (bottom-3 + h-16)
 * on phones. Both reach 76px up; 2rem more keeps the last card clear of the
 * bar's shadow. Inside the sheet, so its surface runs on under the bar.
 */
export const FLOATING_BAR_CLEARANCE = "pb-[calc(76px+2rem)]";

export function PageFrame({
  title,
  subtitle,
  actions,
  sheetClassName,
  backdrop,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  /** The page's own controls, at the right of the header. */
  actions?: React.ReactNode;
  sheetClassName?: string;
  /** Drawn behind the sheet's content, clipped to its rounded top: Home's wallpaper. */
  backdrop?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("flex min-h-svh flex-col", FILL.frame)}>
      <div className={cn(PAGE_COLUMN, "@container/frame pt-6 pb-6")}>
        {/* Wraps: on a phone, a page's actions (the money tabs) drop under the title instead of squeezing it.
            From @4xl the title and the eye share the island's line (h-9 at top-2: the header starts 8 px down),
            and the tabs sit under it, 8 px clear of the island (user 2026-11-07). */}
        <header className="entrance flex flex-wrap items-center justify-between gap-x-4 gap-y-3 @4xl/frame:-mt-4 @4xl/frame:items-start">
          {/* Full width below @4xl so the actions always take their own line there; the island layout above only runs on one row. */}
          <div className={cn("min-w-0", actions ? "w-full @4xl/frame:w-auto" : null)}>
            <h1 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-display text-[26px] leading-tight font-black tracking-[0.02em] text-foreground uppercase">
              {title}
            </h1>
            {subtitle ? <p className="truncate text-[13px] text-ink-2">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3 @4xl/frame:items-start">
            {actions ? <div className="@4xl/frame:mt-11">{actions}</div> : null}
            <div className="flex items-center gap-3">
              {/* Show / hide amounts, on every page (user 2026-11-05: app-wide, in the top bar). */}
              <PrivacyButton className="size-9 shrink-0" />
              <SyncChip />
              <ModeChip />
            </div>
          </div>
        </header>
      </div>

      <div className={cn("relative isolate flex-1 rounded-t-frame bg-sheet dark:border-t dark:border-glass-border", FILL.sheet)}>
        {backdrop ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-t-frame">
            {backdrop}
          </div>
        ) : null}
        <div className={cn(PAGE_COLUMN, "@container flex flex-col gap-4 pt-6 md:pt-8", FLOATING_BAR_CLEARANCE, FILL.column, sheetClassName)}>{children}</div>
      </div>
    </div>
  );
}

/** Raven's section heading inside a sheet: title left, a quiet note right. */
export function SheetHeading({ title, note }: { title: React.ReactNode; note?: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-1">
      <h2 className="font-display text-[17px] leading-tight tracking-[-0.01em] text-foreground">{title}</h2>
      {note ? <p className="text-[12px] text-ink-2">{note}</p> : null}
    </div>
  );
}

/** The empty state (vxrcel-ui-design [R]): hairline rings around Wanheda's mark, leaning toward the pointer. */
export function EmptyState({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
      <EmptyMark />
      <p className="mt-6 font-display text-xl leading-tight tracking-[-0.01em] text-foreground">{title}</p>
      {body && <div className="mt-2 max-w-xs text-[13px] leading-relaxed text-pretty text-ink-2">{body}</div>}
    </div>
  );
}
