import type { BlockTone, ChartSpec, TableBlock } from '@protoyard/blocks';

/**
 * Pure helpers for the data family: number and money formatting (money is
 * integer cents with a three-letter currency), the chart spec split into
 * charts-ui series or slices, and tone labels. Locale is explicit (`en-US` by
 * default), never the system's, so output is the same everywhere.
 */

export const DATA_LOCALE = 'en-US';

export type TableColumnFormat = NonNullable<TableBlock['columns'][number]['format']>;
export type ChartUnit = NonNullable<ChartSpec['unit']>;

const formatters = new Map<string, Intl.NumberFormat>();
function numberFormat(key: string, options: Intl.NumberFormatOptions): Intl.NumberFormat {
  let format = formatters.get(key);
  if (!format) {
    format = new Intl.NumberFormat(DATA_LOCALE, options);
    formatters.set(key, format);
  }
  return format;
}

/** Integer cents as currency: `123450, 'USD'` → `$1,234.50`. */
export function formatCents(cents: number, currency = 'USD'): string {
  return numberFormat(`cents:${currency}`, { style: 'currency', currency }).format(cents / 100);
}

/** A table cell as text: numbers by the column format, `null` as an em dash. */
export function formatTableCell(
  value: string | number | null,
  format: TableColumnFormat = 'text',
  currency = 'USD'
): string {
  if (value === null) return '—';
  if (typeof value === 'string') return value;
  switch (format) {
    case 'cents':
      return formatCents(value, currency);
    case 'percent':
      return numberFormat('percent', { style: 'percent', maximumFractionDigits: 1 }).format(value);
    default:
      return numberFormat('number', { maximumFractionDigits: 2 }).format(value);
  }
}

/** Number-like columns align to the end unless the column says otherwise. */
export function columnAlign(column: TableBlock['columns'][number]): 'start' | 'center' | 'end' {
  if (column.align) return column.align;
  return column.format && column.format !== 'text' ? 'end' : 'start';
}

/** A chart value as text, by the spec's unit (`cents` uses the spec currency, default USD). */
export function chartValueFormatter(
  spec: Pick<ChartSpec, 'unit' | 'currency'>
): (value: number) => string {
  const unit = spec.unit ?? 'number';
  if (unit === 'cents') return (value) => formatCents(value, spec.currency ?? 'USD');
  if (unit === 'percent') {
    const format = numberFormat('percent', { style: 'percent', maximumFractionDigits: 1 });
    return (value) => format.format(value);
  }
  const format =
    unit === 'compact'
      ? numberFormat('compact', { notation: 'compact' })
      : numberFormat('number', { maximumFractionDigits: 2 });
  return (value) => format.format(value);
}

/** Line, area and bar draw on axes; donut, pie and funnel are part-to-whole. */
export function isCartesianChart(kind: ChartSpec['kind']): boolean {
  return kind === 'line' || kind === 'area' || kind === 'bar';
}

/** The spec's series as charts-ui cartesian series. */
export function chartSeries(spec: ChartSpec) {
  return spec.series.map((series, i) => ({
    id: `s${i}`,
    label: series.label,
    points: spec.labels.map((x, j) => ({ x, y: series.values[j] ?? null })),
  }));
}

/** The first series as part-whole slices (part-whole specs have exactly one series). */
export function chartItems(spec: ChartSpec) {
  return spec.labels.map((label, i) => ({
    id: `i${i}`,
    label,
    value: spec.series[0]?.values[i] ?? 0,
  }));
}

/** The words a tone adds for screen readers (color alone never carries meaning). */
export const TONE_LABELS: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: '',
  accent: '',
  info: 'Note',
  success: 'Positive',
  warning: 'Caution',
  danger: 'Negative',
});

/** Theme-token classes for a tone's indicator (the text itself stays foreground for contrast). */
export const TONE_INDICATOR: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: 'bg-muted-foreground',
  accent: 'bg-primary',
  info: 'bg-info',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-destructive',
});
