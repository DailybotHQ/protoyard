/*
 * Ordinal scales for categories: a band scale gives each key a slot with a
 * width (bars), a point scale gives each key a position (dots, line charts
 * over categories).
 */

export interface BandScale<K extends string = string> {
  /** Start of the key's band, or `undefined` for a key outside the domain. */
  (key: K): number | undefined;
  bandwidth(): number;
  /** Distance between the starts of adjacent bands. */
  step(): number;
  /** The key whose band (or step, for points) contains `position`; for hover hit tests. */
  invert(position: number): K | undefined;
  readonly domain: readonly K[];
  readonly range: readonly [number, number];
}

export interface BandScaleOptions<K extends string = string> {
  domain: readonly K[];
  range: readonly [number, number];
  /** Fraction of a step left empty between bands, 0…1 (default 0). */
  paddingInner?: number;
  /** Fraction of a step left empty before the first and after the last band (default 0). */
  paddingOuter?: number;
  /** Where leftover space goes, 0 = start, 0.5 = centered, 1 = end (default 0.5). */
  align?: number;
}

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

export function bandScale<K extends string>(options: BandScaleOptions<K>): BandScale<K> {
  const domain = [...new Set(options.domain)];
  const [r0, r1] = options.range;
  const reverse = r1 < r0;
  const lo = reverse ? r1 : r0;
  const hi = reverse ? r0 : r1;
  const paddingInner = clamp01(options.paddingInner ?? 0);
  const paddingOuter = Math.max(0, options.paddingOuter ?? 0);
  const align = clamp01(options.align ?? 0.5);
  const n = domain.length;

  const step = n === 0 ? 0 : (hi - lo) / Math.max(1, n - paddingInner + paddingOuter * 2);
  const start = lo + (hi - lo - step * (n - paddingInner)) * align;
  const bandwidth = step * (1 - paddingInner);
  const starts = domain.map((_, i) => start + step * i);
  if (reverse) starts.reverse();
  const index = new Map(domain.map((key, i) => [key, i]));

  const scale = (key: K): number | undefined => {
    const i = index.get(key);
    return i === undefined ? undefined : starts[i];
  };
  const invert = (position: number): K | undefined => {
    if (n === 0 || step <= 0) return undefined;
    // Hit area per key is its whole step, centered on the band, so gaps still hover.
    const slot = Math.floor((position - start + (step - bandwidth) / 2) / step);
    if (slot < 0 || slot >= n) return undefined;
    return domain[reverse ? n - 1 - slot : slot];
  };
  return Object.assign(scale, {
    bandwidth: () => bandwidth,
    step: () => step,
    invert,
    domain,
    range: [r0, r1] as const,
  });
}

export interface PointScaleOptions<K extends string = string> {
  domain: readonly K[];
  range: readonly [number, number];
  /** Space before the first and after the last point, in steps (default 0). */
  padding?: number;
  align?: number;
}

/** Evenly spaced positions; a band scale with zero-width bands. */
export function pointScale<K extends string>(options: PointScaleOptions<K>): BandScale<K> {
  return bandScale({
    domain: options.domain,
    range: options.range,
    paddingInner: 1,
    paddingOuter: options.padding ?? 0,
    align: options.align ?? 0.5,
  });
}
