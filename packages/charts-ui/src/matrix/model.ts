import {
  type ChartPalette,
  contrastRatio,
  divergingColor,
  RAMP_STEPS,
  sequentialColor,
} from '@protoyard/charts/palette';

/*
 * Matrix helpers: map values to ramp colors (CSS variables plus the hex the
 * theme resolved, for contrast checks) and pick a readable text color.
 */

export interface Cell {
  /** Stable id (`row:col`, a date, a region id). */
  id: string;
  row: number;
  col: number;
  /** Spoken and shown in the tooltip. */
  description: string;
  /** Tooltip anchor in pixel space. */
  anchor: { x: number; y: number };
}

export interface RampScale {
  /** CSS fill for a value; null values get `empty`. */
  fill: (value: number | null) => string;
  /** Text color for a value, or null when neither light nor dark text reaches 4.5:1 (or the hex is unknown). */
  text: (value: number | null) => string | null;
  min: number;
  max: number;
}

const LIGHT = '#ffffff';
const DARK = '#111827';

/** A sequential (or, with `diverging`, a centred-at-`mid`) ramp over the finite values. */
export function rampScale(
  values: readonly (number | null)[],
  palette: ChartPalette | null | undefined,
  options: { diverging?: boolean; mid?: number; min?: number; max?: number } = {}
): RampScale {
  const finite = values.filter((v): v is number => v !== null && Number.isFinite(v));
  const min = options.min ?? (finite.length ? Math.min(...finite) : 0);
  const max = options.max ?? (finite.length ? Math.max(...finite) : 1);
  const mid = options.mid ?? 0;
  const t = (v: number) => {
    if (options.diverging) {
      const reach = Math.max(Math.abs(max - mid), Math.abs(mid - min)) || 1;
      return Math.max(-1, Math.min(1, (v - mid) / reach));
    }
    return max === min ? 1 : (v - min) / (max - min);
  };
  const step = (v: number) => {
    const x = t(v);
    return options.diverging
      ? Math.round(((x + 1) / 2) * (RAMP_STEPS - 1))
      : Math.round(x * (RAMP_STEPS - 1));
  };
  const hexOf = (v: number) =>
    (options.diverging ? palette?.diverging : palette?.sequential)?.[step(v)];
  return {
    min,
    max,
    fill: (v) =>
      v === null || !Number.isFinite(v)
        ? 'transparent'
        : options.diverging
          ? divergingColor(t(v))
          : sequentialColor(t(v)),
    text: (v) => {
      if (v === null || !Number.isFinite(v)) return null;
      const hex = hexOf(v);
      if (!hex) return null;
      const light = contrastRatio(LIGHT, hex);
      const dark = contrastRatio(DARK, hex);
      const best = light >= dark ? LIGHT : DARK;
      return Math.max(light, dark) >= 4.5 ? best : null;
    },
  };
}
