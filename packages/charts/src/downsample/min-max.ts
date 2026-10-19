/*
 * Min-max ("M4") bucketing for canvas lines: per pixel column keep the first,
 * lowest, highest and last sample. A line drawn through those is pixel-
 * identical to one drawn through every sample, so spikes and outage dips
 * survive any amount of reduction. Inputs must be sorted by x.
 */

export interface MinMaxOptions {
  /** Number of columns, usually the plot width in device pixels. */
  buckets: number;
  /** Visible x range; defaults to the first and last x. Samples outside are dropped. */
  x0?: number;
  x1?: number;
}

/**
 * Indices to draw, ascending. At most 4 per bucket; fewer when samples
 * coincide. A non-finite y inside a bucket is kept (once) so renderers can
 * still break the line at gaps.
 */
export function minMaxBuckets(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  options: MinMaxOptions
): number[] {
  const n = Math.min(xs.length, ys.length);
  const buckets = Math.max(1, Math.floor(options.buckets));
  if (n === 0) return [];
  const x0 = options.x0 ?? (xs[0] as number);
  const x1 = options.x1 ?? (xs[n - 1] as number);
  const span = x1 - x0;
  if (n <= buckets * 4 && options.x0 === undefined && options.x1 === undefined) {
    return Array.from({ length: n }, (_, i) => i);
  }

  const out: number[] = [];
  let current = -1;
  let first = -1;
  let last = -1;
  let min = -1;
  let max = -1;
  let gap = -1;
  const flush = () => {
    if (current === -1) return;
    const picked = [first, min, max, last, gap].filter((i) => i !== -1);
    picked.sort((p, q) => p - q);
    let previous = -1;
    for (const i of picked) {
      if (i !== previous) out.push(i);
      previous = i;
    }
  };

  for (let i = 0; i < n; i++) {
    const x = xs[i] as number;
    if (x < x0 || x > x1) continue;
    const bucket = span > 0 ? Math.min(buckets - 1, Math.floor(((x - x0) / span) * buckets)) : 0;
    if (bucket !== current) {
      flush();
      current = bucket;
      first = -1;
      last = -1;
      min = -1;
      max = -1;
      gap = -1;
    }
    const y = ys[i] as number;
    if (!Number.isFinite(y)) {
      if (gap === -1) gap = i;
      continue;
    }
    if (first === -1) first = i;
    last = i;
    if (min === -1 || y < (ys[min] as number)) min = i;
    if (max === -1 || y > (ys[max] as number)) max = i;
  }
  flush();
  return out;
}
