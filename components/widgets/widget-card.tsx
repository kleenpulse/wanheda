import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/** Every widget's card: a readout header (icon, title, an optional note at the right), then the body. */
export function WidgetCard({
  title,
  icon: Icon,
  note,
  className,
  children,
}: {
  title: string;
  icon: LucideIcon;
  note?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className={cn("bento flex h-full min-h-0 flex-col overflow-hidden p-5", className)}>
      <header className="flex items-center justify-between gap-3">
        <h2 className="readout flex items-center gap-2">
          <Icon aria-hidden className="size-3.5" />
          {title}
        </h2>
        {note ? (
          <span data-widget-note className="readout truncate">
            {note}
          </span>
        ) : null}
      </header>
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

/** A quiet chip for a widget showing sample data. */
export function SampleChip() {
  return <span className="rounded-pill bg-card-nested px-2 py-0.5 ring-1 ring-border dark:ring-glass-border">Sample</span>;
}
