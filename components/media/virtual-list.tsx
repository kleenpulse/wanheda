"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

// A fixed-row-height virtual list (V58, V62): only the rows in view, plus a
// few either side, are in the DOM, so 10k tracks scroll without a long task.
// The scroller carries the scroll-fade, like every list here.

const OVERSCAN = 8;

export function VirtualList<T>({
  items,
  rowHeight,
  render,
  getKey,
  className,
  label,
}: {
  items: readonly T[];
  rowHeight: number;
  render: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  label: string;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [view, setView] = React.useState({ top: 0, height: 600 });

  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let frame = 0;
    const read = () => {
      frame = 0;
      setView({ top: el.scrollTop, height: el.clientHeight });
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(read);
    };
    read();
    const ro = new ResizeObserver(onScroll);
    ro.observe(el);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      ro.disconnect();
      cancelAnimationFrame(frame);
    };
  }, []);

  const first = Math.max(0, Math.floor(view.top / rowHeight) - OVERSCAN);
  const last = Math.min(items.length, Math.ceil((view.top + view.height) / rowHeight) + OVERSCAN);
  const shown = items.slice(first, last);

  return (
    <div ref={ref} role="list" aria-label={label} className={cn("overflow-y-auto scroll-fade overscroll-contain", className)}>
      <div style={{ height: items.length * rowHeight, position: "relative" }}>
        {shown.map((item, i) => (
          <div key={getKey(item)} role="listitem" style={{ position: "absolute", top: (first + i) * rowHeight, left: 0, right: 0, height: rowHeight }}>
            {render(item, first + i)}
          </div>
        ))}
      </div>
    </div>
  );
}
