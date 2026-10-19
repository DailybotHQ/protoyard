import { niceDomain, tickStep } from '../scales/ticks.ts';

/*
 * Histogram binning. Bins are half-open [x0, x1) except the last, which also
 * holds its upper edge, so every finite value lands in exactly one bin.
 */

export interface Bin {
  x0: number;
  x1: number;
  count: number;
}

export interface BinOptions {
  /** Explicit inner edges (sorted); the domain supplies the outer edges. */
  thresholds?: readonly number[];
  /** About how many bins (default: Sturges, ⌈log₂ n⌉ + 1); edges are rounded to nice steps. */
  count?: number;
  /** Fixed outer edges; default is the values' extent rounded out to nice steps. */
  domain?: readonly [number, number];
}

/** Sturges' rule: ⌈log₂ n⌉ + 1 bins for n values. */
export function sturges(n: number): number {
  return n <= 1 ? 1 : Math.ceil(Math.log2(n)) + 1;
}

export function bin(values: readonly (number | null)[], options: BinOptions = {}): Bin[] {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  if (finite.length === 0 && !options.domain) return [];
  let lo = options.domain ? options.domain[0] : Math.min(...finite);
  let hi = options.domain ? options.domain[1] : Math.max(...finite);
  if (lo > hi) [lo, hi] = [hi, lo];

  let edges: number[];
  if (options.thresholds) {
    edges = [lo, ...options.thresholds.filter((t) => t > lo && t < hi), hi];
  } else if (lo === hi) {
    edges = [lo, hi];
  } else {
    const count = Math.max(1, options.count ?? sturges(finite.length));
    if (!options.domain) [lo, hi] = niceDomain(lo, hi, count);
    const step = tickStep(lo, hi, count);
    const first = Math.floor(lo / step + 1e-9);
    const last = Math.ceil(hi / step - 1e-9);
    edges = [];
    for (let i = first; i <= last; i++) edges.push(Number((i * step).toPrecision(12)));
    edges[0] = Math.max(lo, edges[0] as number);
    edges[edges.length - 1] = Math.min(hi, edges.at(-1) as number);
  }

  const bins: Bin[] = [];
  for (let i = 0; i < edges.length - 1; i++)
    bins.push({ x0: edges[i] as number, x1: edges[i + 1] as number, count: 0 });
  if (bins.length === 0) bins.push({ x0: lo, x1: hi, count: 0 });
  for (const v of finite) {
    if (v < lo || v > hi) continue;
    // Binary search for the bin whose [x0, x1) holds v; the top edge goes to the last bin.
    let a = 0;
    let b = bins.length - 1;
    while (a < b) {
      const mid = (a + b + 1) >>> 1;
      if ((bins[mid] as Bin).x0 <= v) a = mid;
      else b = mid - 1;
    }
    (bins[a] as Bin).count++;
  }
  return bins;
}
