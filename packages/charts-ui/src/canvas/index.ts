import type { ChartFamily } from '../families.ts';

export const FAMILY = 'canvas' satisfies ChartFamily;

export {
  CANVAS_POINT_THRESHOLD,
  type CanvasBar,
  type CanvasChartKind,
  type CanvasPoint,
  CanvasRenderer,
  type CanvasRendererMode,
  type CanvasSeries,
  downsampleCanvasPoints,
  drawCanvasChart,
  useCanvas,
} from '@texuli/charts/canvas';

/** @deprecated alias */
export const CANVAS_LINE_POINTS = 5000;
/** @deprecated alias */
export const CANVAS_SCATTER_POINTS = 2000;
export type Renderer = 'auto' | 'svg' | 'canvas';
