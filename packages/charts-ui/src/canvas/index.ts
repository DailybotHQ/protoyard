// @protoyard/charts-ui/canvas — Canvas renderer for dense line and scatter series.
// LineChart, AreaChart and ScatterChart use it through their `renderer` prop; this
// entry exposes the pieces for custom charts.
import type { ChartFamily } from '../families.ts';

export const FAMILY = 'canvas' satisfies ChartFamily;

export { default as CanvasMarks } from './CanvasMarks.svelte';
export {
  CANVAS_LINE_POINTS,
  CANVAS_SCATTER_POINTS,
  type CanvasDots,
  type CanvasLine,
  type PixelPoint,
  type Renderer,
  reduceForPixels,
  resolveColor,
  ScatterIndex,
  useCanvas,
} from './model.ts';
