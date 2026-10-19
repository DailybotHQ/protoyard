/*
 * Stack layouts for stacked bars and areas. Input is one array of values per
 * series (series × index); output is one [y0, y1] pair per value in data
 * units, ready for a y scale. Missing values (null, NaN) stack as 0 height.
 */

export type StackOffset = 'none' | 'expand' | 'diverging';

export type StackSpan = readonly [number, number];

export interface StackOptions {
  /**
   * `none`: cumulative in series order. `expand`: each index normalized to
   * 0…1 (100% stacks; absolute values). `diverging`: positives stack up from
   * 0 and negatives down from 0, so mixed signs never overlap.
   */
  offset?: StackOffset;
}

const value = (v: number | null | undefined) =>
  v === null || v === undefined || !Number.isFinite(v) ? 0 : v;

export function stack(
  series: readonly (readonly (number | null)[])[],
  options: StackOptions = {}
): StackSpan[][] {
  const offset = options.offset ?? 'none';
  const length = Math.max(0, ...series.map((s) => s.length));
  const out: StackSpan[][] = series.map(() => []);
  for (let i = 0; i < length; i++) {
    if (offset === 'diverging') {
      let up = 0;
      let down = 0;
      series.forEach((s, k) => {
        const v = value(s[i]);
        if (v >= 0) {
          (out[k] as StackSpan[]).push([up, up + v]);
          up += v;
        } else {
          (out[k] as StackSpan[]).push([down + v, down]);
          down += v;
        }
      });
      continue;
    }
    const total =
      offset === 'expand' ? series.reduce((sum, s) => sum + Math.abs(value(s[i])), 0) : 1;
    let base = 0;
    series.forEach((s, k) => {
      const raw = offset === 'expand' ? Math.abs(value(s[i])) : value(s[i]);
      const v = offset === 'expand' ? (total === 0 ? 0 : raw / total) : raw;
      (out[k] as StackSpan[]).push([base, base + v]);
      base += v;
    });
  }
  return out;
}

/** Largest stack top (and lowest bottom) across indices, for the y domain. */
export function stackExtent(stacks: readonly (readonly StackSpan[])[]): [number, number] {
  let lo = 0;
  let hi = 0;
  for (const s of stacks) {
    for (const [y0, y1] of s) {
      lo = Math.min(lo, y0, y1);
      hi = Math.max(hi, y0, y1);
    }
  }
  return [lo, hi];
}

export interface GroupOffsets {
  /** Offset of each series' bar from the band start. */
  offsets: number[];
  /** Width of each bar. */
  width: number;
}

/** Splits a band into `count` side-by-side bars with `padding` (0…1 of a slot) between them. */
export function groupOffsets(bandwidth: number, count: number, padding = 0.1): GroupOffsets {
  const n = Math.max(0, Math.floor(count));
  if (n === 0 || !(bandwidth > 0)) return { offsets: [], width: 0 };
  // A slot is one bar plus the gap after it; the last bar has no gap, so n bars fill the band.
  const pad = Math.min(0.9, Math.max(0, padding));
  const slot = bandwidth / (n - pad);
  const width = slot * (1 - pad);
  return { offsets: Array.from({ length: n }, (_, i) => i * slot), width };
}
