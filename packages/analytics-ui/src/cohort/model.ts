import type { RetentionInterval } from '@protoyard/analytics/cohort';
import type { rampScale } from '@protoyard/charts-ui/matrix';

/** The palette `rampScale` reads (only `sequential` matters for cohort cells). */
export type CohortPalette = NonNullable<Parameters<typeof rampScale>[1]>;

export type CohortDisplay = 'percent' | 'count';

const percent = new Intl.NumberFormat('en-US', { style: 'percent', maximumFractionDigits: 1 });
const count = new Intl.NumberFormat('en-US');

/** A retention rate as shown in the table (`42.5%`); `—` for periods that have not started. */
export const formatRate = (rate: number | null) => (rate === null ? '—' : percent.format(rate));
export const formatCount = (value: number | null) => (value === null ? '—' : count.format(value));

const UNIT: Record<RetentionInterval, string> = { day: 'Day', week: 'Week', month: 'Month' };
export const periodLabel = (interval: RetentionInterval, period: number) =>
  `${UNIT[interval]} ${period}`;

const day = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'UTC',
});
const month = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});
/** Cohort start (UTC bucket) as a row header. */
export const cohortLabel = (interval: RetentionInterval, start: number) =>
  (interval === 'month' ? month : day).format(start);

const HEX = /^#[0-9a-f]{6}$/i;

/**
 * The theme's sequential ramp as hex, read from `--py-seq-*` on an element
 * (themes with a chart block publish it on <html>). Null when it is missing
 * or not hex: cells then keep a neutral text chip instead of guessing contrast.
 */
export function readSequentialRamp(el: Element): CohortPalette | null {
  const style = getComputedStyle(el);
  const sequential: string[] = [];
  for (let i = 1; i <= 16; i++) {
    const value = style.getPropertyValue(`--py-seq-${i}`).trim();
    if (!value) break;
    if (!HEX.test(value)) return null;
    sequential.push(value);
  }
  if (sequential.length < 2) return null;
  return {
    categorical: [],
    sequential,
    diverging: [],
    grid: 'transparent',
    axis: 'currentColor',
  };
}
