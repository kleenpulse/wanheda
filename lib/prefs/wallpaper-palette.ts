// Home wallpapers draw on canvas and WebGL, which cannot read CSS variables.
// This resolves the skin's role tokens to bytes at runtime, so the scenes keep
// following the skin, the theme and the accent without a colour in the source.

export type Rgb = readonly [number, number, number];

export interface WallpaperPalette {
  dark: boolean;
  /** --signal: the one hue (accent-adjusted when an accent is set). */
  signal: Rgb;
  /** --foreground: ink on paper, near-white on glass. */
  ink: Rgb;
  /** --ink-3: the faintest readable ink. */
  faint: Rgb;
}

/** A canvas colour string from resolved token bytes. */
export function paint([r, g, b]: Rgb, alpha = 1): string {
  return `rgb(${r} ${g} ${b} / ${alpha})`;
}

/** 0..1 channels for a WebGL uniform. */
export function unit([r, g, b]: Rgb): [number, number, number] {
  return [r / 255, g / 255, b / 255];
}

let scratch: CanvasRenderingContext2D | null = null;

/**
 * The computed colour of a CSS colour expression, as bytes. A probe element
 * resolves `var()` and relative `oklch(from …)`; a 1×1 canvas then flattens
 * whatever colour space the browser kept into sRGB.
 */
function resolve(probe: HTMLElement, expr: string): Rgb {
  probe.style.color = expr;
  const computed = getComputedStyle(probe).color;
  scratch ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!scratch) return [128, 128, 128];
  scratch.clearRect(0, 0, 1, 1);
  scratch.fillStyle = computed;
  scratch.fillRect(0, 0, 1, 1);
  const [r = 128, g = 128, b = 128] = scratch.getImageData(0, 0, 1, 1).data;
  return [r, g, b];
}

export function readPalette(root: HTMLElement = document.documentElement): WallpaperPalette {
  const probe = document.createElement("span");
  probe.hidden = true;
  document.body.append(probe);
  try {
    return {
      dark: root.classList.contains("dark"),
      signal: resolve(probe, "var(--signal)"),
      ink: resolve(probe, "var(--foreground)"),
      faint: resolve(probe, "var(--ink-3)"),
    };
  } finally {
    probe.remove();
  }
}

export function samePalette(a: WallpaperPalette, b: WallpaperPalette): boolean {
  const eq = (x: Rgb, y: Rgb) => x[0] === y[0] && x[1] === y[1] && x[2] === y[2];
  return a.dark === b.dark && eq(a.signal, b.signal) && eq(a.ink, b.ink) && eq(a.faint, b.faint);
}
