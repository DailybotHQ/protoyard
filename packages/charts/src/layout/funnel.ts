/*
 * Funnel geometry: one bar per step, sized by its value relative to the
 * largest step, centred, with conversion and drop-off ratios for labels.
 */

export interface FunnelStepInput {
  id: string;
  label?: string;
  value: number;
}

export interface FunnelStepLayout {
  id: string;
  label?: string;
  value: number;
  /** value / first step's value; null when the first step is 0. */
  conversion: number | null;
  /** value / previous step's value (1 for the first step); null when the previous step is 0. */
  stepConversion: number | null;
  /** previous − value (0 for the first step). */
  dropOff: number;
  /** dropOff / previous; null when the previous step is 0. */
  dropOffRate: number | null;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FunnelLayoutOptions {
  width: number;
  height: number;
  /** `vertical`: bars stacked top to bottom, width ∝ value. `horizontal`: columns left to right, height ∝ value. */
  orientation?: 'vertical' | 'horizontal';
  /** Space between steps in pixels (default 8). */
  gap?: number;
  /** Smallest bar size in pixels so a tiny step stays visible and focusable (default 2). */
  minSize?: number;
}

export function funnelLayout(
  steps: readonly FunnelStepInput[],
  options: FunnelLayoutOptions
): FunnelStepLayout[] {
  const orientation = options.orientation ?? 'vertical';
  const gap = Math.max(0, options.gap ?? 8);
  const minSize = Math.max(0, options.minSize ?? 2);
  const n = steps.length;
  if (n === 0) return [];
  const values = steps.map((s) => (Number.isFinite(s.value) && s.value > 0 ? s.value : 0));
  const max = Math.max(...values);
  const first = values[0] as number;
  const along = orientation === 'vertical' ? options.height : options.width;
  const across = orientation === 'vertical' ? options.width : options.height;
  const band = Math.max(0, (along - gap * (n - 1)) / n);
  return steps.map((step, i) => {
    const value = values[i] as number;
    const previous = i === 0 ? value : (values[i - 1] as number);
    const size = max > 0 ? Math.max(minSize, (value / max) * across) : minSize;
    const offset = (across - size) / 2;
    const position = i * (band + gap);
    const geometry =
      orientation === 'vertical'
        ? { x: offset, y: position, width: size, height: band }
        : { x: position, y: across - size, width: band, height: size };
    return {
      id: step.id,
      ...(step.label === undefined ? {} : { label: step.label }),
      value,
      conversion: first > 0 ? value / first : null,
      stepConversion: i === 0 ? 1 : previous > 0 ? value / previous : null,
      dropOff: i === 0 ? 0 : previous - value,
      dropOffRate: i === 0 ? 0 : previous > 0 ? (previous - value) / previous : null,
      ...geometry,
    };
  });
}
