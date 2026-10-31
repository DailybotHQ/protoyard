/**
 * Protoyard row → series helper kept for dashboards and analytics.
 * Maps onto Texuli cartesian series (x/y points only).
 */

export interface CartesianPoint<D = unknown> {
  x: number | string;
  y: number | null;
  size?: number;
  datum?: D;
}

export interface CartesianSeries<D = unknown> {
  id: string;
  label: string;
  points: readonly CartesianPoint<D>[];
  color?: string;
  comparison?: boolean;
  axis?: 'left' | 'right';
  type?: 'bar' | 'line';
}

/**
 * The x scale a caller means. Kept for API stability: Texuli's cartesian
 * charts take no x kind or x formatter yet, so a `time` series is labelled and
 * announced as raw epoch milliseconds (Texuli gap G97).
 */
export type XKind = 'time' | 'linear' | 'category';
export type BarMode = 'grouped' | 'stacked' | 'expanded';
export type ValueUnit = 'number' | 'compact' | 'cents' | 'percent';

export interface UnitOptions {
  unit?: ValueUnit;
  currency?: string;
}

/** Builds series from rows for BarChart/LineChart adapters. */
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

/** Strip Protoyard-only fields before handing series to Texuli. */
export function toTexuliSeries(series: readonly CartesianSeries[]): {
  id: string;
  label: string;
  points: { x: number | string; y: number | null }[];
  color?: string;
}[] {
  return series.map((s) => ({
    id: s.id,
    label: s.label,
    points: s.points.map((p) => ({ x: p.x, y: p.y })),
    ...(s.color ? { color: s.color } : {}),
  }));
}

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
  return (value) => {
    if (value === null || !Number.isFinite(value)) return '—';
    return unit === 'cents' ? f.format(value / 100) : f.format(value);
  };
}

export function tickFormatter(options: UnitOptions = {}): (value: number) => string {
  const format = valueFormatter(options);
  return (value) => format(value);
}

export function comboRoles(
  series: readonly CartesianSeries[]
): Map<string, { type: 'bar' | 'line'; axis: 'left' | 'right' }> {
  const out = new Map<string, { type: 'bar' | 'line'; axis: 'left' | 'right' }>();
  series.forEach((s, i) => {
    out.set(s.id, {
      type: s.type ?? (i === 0 ? 'bar' : 'line'),
      axis: s.axis ?? (s.type === 'bar' || (s.type === undefined && i === 0) ? 'left' : 'right'),
    });
  });
  return out;
}

export function defaultSummary(series: readonly CartesianSeries[], _xKind?: XKind): string {
  const n = series.reduce((sum, s) => sum + s.points.filter((p) => p.y !== null).length, 0);
  return `${series.length} series · ${n} points`;
}

export function chartFormatters(_xKind?: XKind, units?: UnitOptions) {
  return { value: valueFormatter(units), tick: tickFormatter(units) };
}
