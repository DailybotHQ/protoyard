/*
 * Small color math for chart palettes: hex ↔ linear sRGB ↔ OKLab/OKLCH,
 * WCAG contrast and colour-vision-deficiency simulation. Copied in spirit
 * from @protoyard/themes (oklch.ts, contrast.ts) so charts carry no runtime
 * dependency on the theme library; keep the two in sync.
 */

export type Rgb = readonly [number, number, number];

export interface Oklab {
  l: number;
  a: number;
  b: number;
}

export interface Oklch {
  l: number;
  c: number;
  h: number;
}

/** `#rgb` / `#rrggbb` → 0–255 channels; `null` for anything else (rgb(), names, alpha). */
export function parseHex(color: string): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1] as string;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as unknown as Rgb;
}

const toLinear = (channel: number) => {
  const v = channel / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (channel: number) => {
  const v = Math.min(1, Math.max(0, channel));
  return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
};

export function linearRgb(hex: string): Rgb {
  const rgb = parseHex(hex);
  if (!rgb) throw new TypeError(`expected a hex color, got "${hex}"`);
  return [toLinear(rgb[0]), toLinear(rgb[1]), toLinear(rgb[2])];
}

export function linearToHex(rgb: Rgb): string {
  return `#${rgb.map((c) => Math.round(fromLinear(c)).toString(16).padStart(2, '0')).join('')}`;
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = linearRgb(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two hex colors (1…21). */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function linearToOklab([r, g, b]: Rgb): Oklab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

function oklabToLinear({ l, a, b }: Oklab): Rgb {
  const lr = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const mr = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const sr = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * lr - 3.3077115913 * mr + 0.2309699292 * sr,
    -1.2684380046 * lr + 2.6097574011 * mr - 0.3413193965 * sr,
    -0.0041960863 * lr - 0.7034186147 * mr + 1.707614701 * sr,
  ];
}

export function hexToOklch(hex: string): Oklch {
  const { l, a, b } = linearToOklab(linearRgb(hex));
  const c = Math.hypot(a, b);
  const h = c < 1e-6 ? 0 : ((((Math.atan2(b, a) * 180) / Math.PI) % 360) + 360) % 360;
  return { l, c, h };
}

const inGamut = (rgb: Rgb) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** OKLCH → hex, lowering chroma (never lightness or hue) until it fits sRGB. */
export function oklchToHex({ l, c, h }: Oklch): string {
  const lightness = Math.min(1, Math.max(0, l));
  const angle = (h * Math.PI) / 180;
  const at = (chroma: number) =>
    oklabToLinear({ l: lightness, a: chroma * Math.cos(angle), b: chroma * Math.sin(angle) });
  let rgb = at(Math.max(0, c));
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = Math.max(0, c);
    rgb = at(0);
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const candidate = at(mid);
      if (inGamut(candidate)) {
        lo = mid;
        rgb = candidate;
      } else hi = mid;
    }
  }
  return linearToHex(rgb);
}

/** Perceptual distance (Euclidean in OKLab); about 0.02 is a just-noticeable difference. */
export function oklabDistance(a: Rgb, b: Rgb): number {
  const p = linearToOklab(a);
  const q = linearToOklab(b);
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}

export type VisionDeficiency = 'protanopia' | 'deuteranopia';

/* Machado, Oliveira & Fernandes (2009), severity 1.0, applied to linear RGB. */
const MACHADO: Record<VisionDeficiency, readonly number[]> = {
  protanopia: [
    0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998,
  ],
  deuteranopia: [
    0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.01182, 0.04294, 0.968881,
  ],
};

export function simulateDeficiency([r, g, b]: Rgb, kind: VisionDeficiency): Rgb {
  const m = MACHADO[kind];
  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  return [
    clamp((m[0] as number) * r + (m[1] as number) * g + (m[2] as number) * b),
    clamp((m[3] as number) * r + (m[4] as number) * g + (m[5] as number) * b),
    clamp((m[6] as number) * r + (m[7] as number) * g + (m[8] as number) * b),
  ];
}
