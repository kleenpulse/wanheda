import type * as React from "react";
import { ModeChip } from "@/components/shell/mode-chip";
import { cn } from "@/lib/utils";

/*
  Every page's frame, Raven's grammar (ported from admin_shadow-garden): a
  header on the band (title, subtitle, the page's own actions), then the
  rounded sheet that rises to hold the page's cards.

  The sheet's body is an @container stack. Pages that want columns use
  container variants, never viewport breakpoints: the rail is 84px or 232px,
  so the viewport lies about the room a page has.
*/

/** Page width cap, net of the rail: Raven's calc(1900px - rail). Skeletons share it. */
export const PAGE_COLUMN = "mx-auto w-full max-w-[calc(1900px-var(--rail-w))] px-5 md:px-8";

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
    <div className="flex min-h-svh flex-col">
      <div className={cn(PAGE_COLUMN, "@container/frame pt-6 pb-6")}>
        <header className="entrance flex items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 font-display text-[22px] leading-tight tracking-[-0.01em] text-foreground">
              {title}
            </h1>
            {subtitle ? <p className="truncate text-[13px] text-ink-2">{subtitle}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-3">
            {actions}
            <ModeChip />
          </div>
        </header>
      </div>

      <div className="relative isolate flex-1 rounded-t-frame bg-sheet dark:border-t dark:border-glass-border">
        {backdrop ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden rounded-t-frame">
            {backdrop}
          </div>
        ) : null}
        <div className={cn(PAGE_COLUMN, "@container flex flex-col gap-4 py-6 md:py-8", sheetClassName)}>{children}</div>
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

/** The empty state (vxrcel-ui-design [R]): hairline rings around the signal dot. */
export function EmptyState({ title, body }: { title: string; body?: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-8 py-14 text-center">
      <span aria-hidden className="relative grid size-24 place-items-center">
        <span className="absolute inset-0 rounded-full ring-1 ring-border dark:ring-glass-border" />
        <span className="absolute inset-4 rounded-full ring-1 ring-border dark:ring-glass-border" />
        <span className="grid size-8 place-items-center rounded-full bg-card-nested ring-1 ring-border dark:ring-glass-border">
          <span className="size-2 rounded-full bg-signal" />
        </span>
      </span>
      <p className="mt-6 font-display text-xl leading-tight tracking-[-0.01em] text-foreground">{title}</p>
      {body && <div className="mt-2 max-w-xs text-[13px] leading-relaxed text-pretty text-ink-2">{body}</div>}
    </div>
  );
}
