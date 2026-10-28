/**
 * WCAG 2.x relative luminance and contrast ratio for `#rgb` / `#rrggbb`
 * colors. Kept tiny on purpose: presets use hex so they can be verified.
 */

export function parseHex(color: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color.trim());
  if (!match) return null;
  let hex = match[1] as string;
  if (hex.length === 3) hex = [...hex].map((c) => c + c).join('');
  return [0, 2, 4].map((i) => Number.parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string): number {
  const rgb = parseHex(color);
  if (!rgb) throw new TypeError(`relativeLuminance(): expected a hex color, got "${color}"`);
  const [r, g, b] = rgb.map(channel) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

/** Token pairs that carry text and therefore must reach 4.5:1 (AA, normal text). */
export const TEXT_CONTRAST_PAIRS = [
  ['foreground', 'background'],
  ['surfaceForeground', 'surface'],
  ['foreground', 'elevated'],
  ['mutedForeground', 'background'],
  ['mutedForeground', 'surface'],
  ['mutedForeground', 'muted'],
  ['primaryForeground', 'primary'],
  ['secondaryForeground', 'secondary'],
  ['accentForeground', 'accent'],
  ['destructiveForeground', 'destructive'],
  ['successForeground', 'success'],
  ['warningForeground', 'warning'],
  ['infoForeground', 'info'],
  ['sidebarForeground', 'sidebar'],
  // Semantic colors are also used as text/icon color on plain surfaces.
  ['primary', 'background'],
  ['primary', 'surface'],
  ['destructive', 'surface'],
  ['success', 'surface'],
  ['info', 'surface'],
  ['destructive', 'muted'],
  ['primary', 'muted'],
] as const;

/** Non-text UI pairs (WCAG 1.4.11): 3:1 so focus rings and controls stay visible. */
export const UI_CONTRAST_PAIRS = [
  ['ring', 'background'],
  ['ring', 'surface'],
] as const;

function mixHex(color: string, toward: string, amount: number): string | null {
  const a = parseHex(color);
  const b = parseHex(toward);
  if (!a || !b) return null;
  return `#${a
    .map((c, i) =>
      Math.round(c + ((b[i] as number) - c) * amount)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/**
 * Hover fill for a filled control: a visible step darker or lighter that
 * keeps `text` at AA. Prefers the direction that increases contrast; when
 * the fill is already at an extreme (e.g. Monochrome dark, primary ≈ white)
 * it steps the other way as long as contrast stays ≥ 4.5:1.
 */
export function hoverFill(fill: string, text: string): string {
  if (!parseHex(fill) || !parseHex(text)) return fill;
  const candidates = ['#000000', '#ffffff']
    .map((target) => mixHex(fill, target, 0.14) as string)
    .map((color) => ({
      color,
      ratio: contrastRatio(color, text),
      delta: Math.abs(relativeLuminance(color) - relativeLuminance(fill)),
    }))
    .filter((c) => c.ratio >= 4.5 && c.delta >= 0.01);
  if (candidates.length === 0) return fill;
  // Most contrast wins; a visible step is guaranteed by the delta filter.
  return candidates.sort((x, y) => y.ratio - x.ratio)[0]?.color ?? fill;
}

/** Texuli's link states (`--tx-link`, `--tx-link-<state>`, `--tx-link-visited`). */
export interface LinkStates {
  default: string;
  hover: string;
  active: string;
  focus: string;
  visited: string;
  disabled: string;
}

/** Surfaces Texuli's AA gate checks link text on (button `link` variant pairs). */
export const LINK_SURFACES = ['background', 'surface', 'muted', 'elevated'] as const;

type LinkPalette = Record<
  (typeof LINK_SURFACES)[number] | 'primary' | 'foreground' | 'mutedForeground',
  string
>;

function worstRatio(color: string, backgrounds: readonly string[]): number {
  return Math.min(
    ...backgrounds.map((background) =>
      parseHex(color) && parseHex(background) ? contrastRatio(color, background) : 21
    )
  );
}

/**
 * Link colors for one palette. The default is the theme's primary when it
 * reads at AA (4.5:1) on every link surface, else the foreground (or the
 * muted foreground); hover and active step further toward the foreground,
 * so they stay at AA and differ visibly; focus matches hover; visited links
 * look like links (prototypes keep no browsing history worth styling); a
 * disabled link uses the muted foreground (WCAG exempts disabled text).
 */
export function linkStates(palette: LinkPalette): LinkStates {
  const surfaces = LINK_SURFACES.map((role) => palette[role]);
  const candidates = [palette.primary, palette.foreground, palette.mutedForeground];
  const base =
    candidates.find((color) => worstRatio(color, surfaces) >= 4.5) ??
    [...candidates].sort((a, b) => worstRatio(b, surfaces) - worstRatio(a, surfaces))[0] ??
    palette.foreground;
  const step = (amount: number): string => {
    const mixed = mixHex(base, palette.foreground, amount);
    return mixed && worstRatio(mixed, surfaces) >= worstRatio(base, surfaces) ? mixed : base;
  };
  const hover = step(0.25);
  return {
    default: base,
    hover,
    active: step(0.4),
    focus: hover,
    visited: base,
    disabled: palette.mutedForeground,
  };
}
