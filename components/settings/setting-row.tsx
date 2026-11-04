import * as React from "react";
import { cn } from "@/lib/utils";

/*
  Raven's settings grammar (email-manager components/settings/setting-row):
  cards with a quiet readout title and hairlines between rows; each row puts
  the label and its description on the left and the control on the right.
*/

/** A card of settings rows, the way System Settings groups them. */
export function SettingsCard({ title, children, className }: { title: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("bento overflow-hidden p-0", className)}>
      <h3 className="readout px-5 pt-4 pb-1">{title}</h3>
      <div className="divide-y divide-border/70 dark:divide-glass-border">{children}</div>
    </section>
  );
}

/**
 * One setting. `wide` controls drop under the label on narrow cards; `stack`
 * always does. The control gets the label's id for aria-labelledby.
 */
export function SettingRow({
  label,
  description,
  layout = "inline",
  children,
}: {
  label: React.ReactNode;
  description?: React.ReactNode;
  layout?: "inline" | "wide" | "stack";
  children?: (labelId: string) => React.ReactNode;
}) {
  const labelId = React.useId();
  return (
    <div
      className={cn(
        "grid items-center gap-x-6 gap-y-3 px-5 py-4",
        layout === "stack"
          ? "grid-cols-1"
          : layout === "wide"
            ? "grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_auto]"
            : "grid-cols-[minmax(0,1fr)_auto]",
      )}
    >
      <div className="min-w-0">
        <p id={labelId} className="flex min-h-6 items-center gap-2 text-[14px] font-medium text-foreground">
          {label}
        </p>
        {description ? (
          <p className="mt-0.5 max-w-[46ch] text-[13px] leading-snug text-pretty text-ink-2">{description}</p>
        ) : null}
      </div>
      {children ? (
        <div className={cn("min-w-0", layout === "inline" && "justify-self-end", layout === "wide" && "@lg:justify-self-end")}>
          {children(labelId)}
        </div>
      ) : null}
    </div>
  );
}
