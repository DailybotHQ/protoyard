import type { Margin, Rect } from '@protoyard/charts';
import type { ChartPalette } from '@protoyard/charts/palette';
import { getContext, setContext } from 'svelte';

/** What a chart inside a ChartFrame can read; every field is reactive. */
export interface ChartFrameContext {
  /** Container width in CSS pixels (0 until measured). */
  readonly width: number;
  readonly height: number;
  readonly margin: Margin;
  /** Plot rectangle inside the margins. */
  readonly plot: Rect;
  readonly mode: 'light' | 'dark';
  /** True when the theme or the OS asks for reduced motion: charts must not animate. */
  readonly reducedMotion: boolean;
  readonly palette: ChartPalette | null;
}

/** What ChartFrame passes to its `children` snippet. */
export interface ChartFrameSize {
  width: number;
  height: number;
  plot: Rect;
}

const KEY = Symbol('protoyard.chart-frame');

export function setChartFrameContext(context: ChartFrameContext): void {
  setContext(KEY, context);
}

/** The enclosing ChartFrame, or undefined when a chart is rendered on its own. */
export function getChartFrameContext(): ChartFrameContext | undefined {
  return getContext<ChartFrameContext | undefined>(KEY);
}
