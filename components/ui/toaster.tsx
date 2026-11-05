"use client";

import * as React from "react";
import type { Route } from "next";
import Link from "next/link";
import { X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { create } from "zustand";
import { buttonClass } from "@/components/ui/button";
import { BANNER_SPRING } from "@/lib/motion";

/*
  Toasts: short notices that float above the page and leave on their own. The
  shell mounts one Toaster; anything calls toast(). Motion follows the house
  MotionConfig, so reduced motion (system or app setting) turns the slide off.
*/

export interface Toast {
  id: string;
  title: string;
  body?: string;
  action?: { label: string; href: Route };
}

const SHOW_MS = 9_000;
const MAX_TOASTS = 3;

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));

export function dismissToast(id: string) {
  useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

/** Shows a toast. One with the same id replaces it. */
export function toast(next: Omit<Toast, "id"> & { id?: string }) {
  const item: Toast = { ...next, id: next.id ?? crypto.randomUUID() };
  useToasts.setState((s) => ({ toasts: [...s.toasts.filter((t) => t.id !== item.id), item].slice(-MAX_TOASTS) }));
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed inset-x-3 bottom-[calc(76px+1rem)] z-40 flex flex-col items-center gap-2 md:inset-x-auto md:right-4 md:items-end"
    >
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ toast: t }: { toast: Toast }) {
  const [held, setHeld] = React.useState(false);
  React.useEffect(() => {
    if (held) return;
    const timer = setTimeout(() => {
      dismissToast(t.id);
    }, SHOW_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [t.id, held]);

  return (
    <motion.div
      layout
      role="status"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: BANNER_SPRING }}
      exit={{ opacity: 0, y: 8, transition: { duration: 0.16 } }}
      onPointerEnter={() => {
        setHeld(true);
      }}
      onPointerLeave={() => {
        setHeld(false);
      }}
      onFocus={() => {
        setHeld(true);
      }}
      onBlur={() => {
        setHeld(false);
      }}
      className="pointer-events-auto flex w-full max-w-[380px] items-start gap-3 rounded-[18px] bg-card px-4 py-3 text-foreground shadow-lift ring-1 ring-border dark:bg-card-nested dark:ring-glass-border"
    >
      <div className="min-w-0 flex-1">
        <p className="text-[13.5px] font-medium">{t.title}</p>
        {t.body ? <p className="mt-0.5 text-pretty text-[12.5px] leading-snug text-ink-2">{t.body}</p> : null}
        {t.action ? (
          <Link
            href={t.action.href}
            onClick={() => {
              dismissToast(t.id);
            }}
            className="mt-2 inline-block rounded-sm text-[12.5px] font-medium text-foreground underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {t.action.label}
          </Link>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => {
          dismissToast(t.id);
        }}
        className={buttonClass("ghost", "circle-sm", "-my-1 -mr-1.5 size-8")}
      >
        <X aria-hidden strokeWidth={1.75} />
        <span className="sr-only">Dismiss</span>
      </button>
    </motion.div>
  );
}
