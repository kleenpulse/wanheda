import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Register the skin's custom scales, or tailwind-merge mistakes `text-kpi` for a
// colour and drops it (vxrcel-ui-design, ember.md).
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      radius: ["card", "frame", "pill"],
      shadow: ["card", "glow", "lift"],
      text: ["hero", "kpi", "kpi-sm", "micro"],
    },
  },
});

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
