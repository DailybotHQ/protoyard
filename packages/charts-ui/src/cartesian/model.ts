import type { Rect } from '@protoyard/charts';
import { seriesColor } from '@protoyard/charts/palette';
import {
  bandScale,
  formatDate,
  formatTimeTick,
  linearScale,
  timeScale,
} from '@protoyard/charts/scales';
import type { ChartFormatters } from '../interaction/model.ts';

/*
 * The data contract and the pure helpers shared by the cartesian charts:
 * series in data space, formatters by unit, x and y scales with ticks.
 */

export interface CartesianPoint<D = unknown> {
  /** Epoch ms for time axes, a number for linear axes, a category name otherwise. */
  x: number | string;
  y: number | null;
  /** Bubble size for scatter charts. */
  size?: number;
  datum?: D;
}

export interface CartesianSeries<D = unknown> {
  id: string;
  label: string;
  points: readonly CartesianPoint<D>[];
  color?: string;
  /** A comparison series (e.g. previous period): drawn dashed and lighter. */
  comparison?: boolean;
  /** ComboChart: which value axis the series uses (default: bars left, lines right). */
  axis?: 'left' | 'right';
  /** ComboChart: how the series is drawn (default: the first series bars, the rest lines). */
  type?: 'bar' | 'line';
}

export type XKind = 'time' | 'linear' | 'category';
/** `grouped` side by side, `stacked` on top (negatives below zero), `expanded` as shares of 100 %. */
export type BarMode = 'grouped' | 'stacked' | 'expanded';
/** `cents` values are integer cents (money); `percent` values are ratios (0.25 = 25 %). */
export type ValueUnit = 'number' | 'compact' | 'cents' | 'percent';

export interface UnitOptions {
  unit?: ValueUnit;
  currency?: string;
}

/** Builds series from rows: `seriesFromRows(rows, { x: (r) => r.day, series: [{ id: 'signups', label: 'Signups', y: (r) => r.signups }] })`. */
export function seriesFromRows<R>(
  rows: readonly R[],
  options: {
    x: (row: R) => number | string;
    series: readonly {
      id: string;
      label: string;
      y: (row: R) => number | null;
      color?: string;
      comparison?: boolean;
    }[];
  }
): CartesianSeries<R>[] {
  return options.series.map((s) => ({
    id: s.id,
    label: s.label,
    ...(s.color ? { color: s.color } : {}),
    ...(s.comparison ? { comparison: true } : {}),
    points: rows.map((row) => ({ x: options.x(row), y: s.y(row), datum: row })),
  }));
}

export const colorFor = (series: CartesianSeries, index: number) =>
  series.color ?? seriesColor(index);

// One cached Intl.NumberFormat per option set; units map to options here instead of importing a
// formatter per unit, which keeps every chart's chunk smaller.
const formats = new Map<string, Intl.NumberFormat>();
function nf(options: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(options);
  let f = formats.get(key);
  if (!f) {
    f = new Intl.NumberFormat('en-US', options);
    formats.set(key, f);
  }
  return f;
}

/** A full-precision value formatter for tooltips and tables. */
export function valueFormatter({
  unit = 'number',
  currency = 'USD',
}: UnitOptions = {}): (value: number | null) => string {
  const f =
    unit === 'cents'
      ? nf({ style: 'currency', currency })
      : unit === 'percent'
        ? nf({ style: 'percent', maximumFractionDigits: 1 })
        : unit === 'compact'
          ? nf({ notation: 'compact', maximumFractionDigits: 1 })
          : nf({ maximumFractionDigits: 2 });
  return (value) =>
    value === null || !Number.isFinite(value)
      ? '—'
      : f.format(unit === 'cents' ? Math.round(value) / 100 : value);
}

/** A short formatter for axis ticks. */
export function tickFormatter({
  unit = 'number',
  currency = 'USD',
}: UnitOptions = {}): (value: number) => string {
  const f =
    unit === 'cents'
      ? nf({ style: 'currency', currency, notation: 'compact', maximumFractionDigits: 1 })
      : unit === 'percent'
        ? nf({ style: 'percent', maximumFractionDigits: 0 })
        : nf({ notation: 'compact', maximumFractionDigits: 1 });
  return (value) => f.format(unit === 'cents' ? Math.round(value) / 100 : value);
}

export function xFormatter(kind: XKind): (value: number | string) => string {
  if (kind === 'time') return (v) => formatDate(typeof v === 'number' ? v : Date.parse(v));
  if (kind === 'linear') {
    const f = nf({ maximumFractionDigits: 2 });
    return (v) => (typeof v === 'number' ? f.format(v) : v);
  }
  return (v) => String(v);
}

export function chartFormatters(kind: XKind, units: UnitOptions): ChartFormatters {
  const y = valueFormatter(units);
  return { x: xFormatter(kind), y: (v) => y(v) };
}

/** Distinct x values in first-seen order (categories) or sorted (numbers). */
export function xValues(series: readonly CartesianSeries[], kind: XKind): (number | string)[] {
  const seen = new Set<number | string>();
  for (const s of series) for (const p of s.points) seen.add(p.x);
  const values = [...seen];
  return kind === 'category' ? values : (values as number[]).sort((a, b) => a - b);
}

export interface Tick {
  position: number;
  label: string;
}

/** A continuous x scale (time or linear) over the plot width, with labelled ticks. */
export function continuousX(kind: 'time' | 'linear', values: readonly number[], plot: Rect) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const domain: [number, number] = values.length ? [lo, hi === lo ? lo + 1 : hi] : [0, 1];
  const range: [number, number] = [plot.x, plot.x + plot.width];
  const count = Math.max(2, Math.floor(plot.width / 90));
  if (kind === 'time') {
    const scale = timeScale({ domain, range });
    const interval = scale.tickInterval(count);
    return {
      scale,
      ticks: scale
        .ticks(count)
        .map((t) => ({ position: scale(t), label: formatTimeTick(t, interval) })),
    };
  }
  const scale = linearScale({ domain, range, nice: count });
  return {
    scale,
    ticks: scale.ticks(count).map((t) => ({
      position: scale(t),
      label: nf({ notation: 'compact', maximumFractionDigits: 1 }).format(t),
    })),
  };
}

/** A category band scale along `range`, with a label per category (thinned when crowded). */
export function categoryAxis(
  categories: readonly string[],
  range: [number, number],
  padding = 0.2
) {
  const scale = bandScale({
    domain: categories,
    range,
    paddingInner: padding,
    paddingOuter: padding / 2,
  });
  const step = Math.max(
    1,
    Math.ceil((categories.length * 48) / Math.max(1, Math.abs(range[1] - range[0])))
  );
  const ticks = categories
    .filter((_, i) => i % step === 0)
    .map((c) => ({ position: (scale(c) as number) + scale.bandwidth() / 2, label: c }));
  return { scale, ticks };
}

/** A nice value scale; `zero` forces 0 into the domain (bars and areas). */
export function valueAxis(
  values: readonly number[],
  range: [number, number],
  options: { zero?: boolean; format: (v: number) => string; count?: number }
) {
  const finite = values.filter((v) => Number.isFinite(v));
  let lo = finite.length ? Math.min(...finite) : 0;
  let hi = finite.length ? Math.max(...finite) : 1;
  if (options.zero) {
    lo = Math.min(0, lo);
    hi = Math.max(0, hi);
  }
  if (lo === hi) hi = lo + 1;
  const count = options.count ?? 5;
  const scale = linearScale({ domain: [lo, hi], range, nice: count });
  return {
    scale,
    ticks: scale.ticks(count).map((t) => ({ position: scale(t), label: options.format(t) })),
  };
}

/** "3 series over 30 dates" for the screen-reader summary when none is given. */
export function defaultSummary(series: readonly CartesianSeries[], kind: XKind): string {
  const n = Math.max(0, ...series.map((s) => s.points.length));
  const what = kind === 'time' ? 'dates' : kind === 'linear' ? 'values' : 'categories';
  return `${series.length} series over ${n} ${what}. Use the chart or the table for exact values.`;
}

export const isEmpty = (series: readonly CartesianSeries[]) =>
  series.every((s) => s.points.every((p) => p.y === null || !Number.isFinite(p.y)));

/** ComboChart roles: explicit `type`/`axis`, else the first series is bars on the left and the rest lines on the right. */
export function comboRoles(
  series: readonly CartesianSeries[]
): Map<string, { type: 'bar' | 'line'; axis: 'left' | 'right' }> {
  return new Map(
    series.map((s, i) => {
      const type = s.type ?? (i === 0 ? 'bar' : 'line');
      return [s.id, { type, axis: s.axis ?? (type === 'bar' ? 'left' : 'right') }];
    })
  );
}
