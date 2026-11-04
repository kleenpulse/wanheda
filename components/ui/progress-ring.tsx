import type * as React from "react";

/** A small signal-coloured ring that empties as `value` goes 1 → 0. Children sit in the middle. */
export function ProgressRing({ value, children }: { value: number; children?: React.ReactNode }) {
  const r = 9;
  const c = 2 * Math.PI * r;
  return (
    <span className="relative grid size-[22px] shrink-0 place-items-center text-signal">
      <svg viewBox="0 0 24 24" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={12} cy={12} r={r} fill="none" stroke="currentColor" strokeOpacity={0.25} strokeWidth={3} />
        <circle
          cx={12}
          cy={12}
          r={r}
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, value)))}
          className="transition-[stroke-dashoffset] duration-100 ease-linear"
        />
      </svg>
      {children}
    </span>
  );
}
