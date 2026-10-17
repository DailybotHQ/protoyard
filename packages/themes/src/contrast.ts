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
] as const;

/** Non-text UI pairs (WCAG 1.4.11): 3:1 so focus rings and controls stay visible. */
export const UI_CONTRAST_PAIRS = [
  ['ring', 'background'],
  ['ring', 'surface'],
] as const;
