/**
 * `@protoyard/views-ui/canvas` — an infinite canvas: a thin host adapter
 * over `@texuli/canvas/editor` (shapes, text, sticky notes, frames,
 * connectors, snapping and guides, a JSON clipboard, undo), plus Texuli's
 * framework-free model and SVG export. A lazy subpath; never part of the
 * `@protoyard/ui` barrel.
 */

export { canvasToSvg } from '@texuli/canvas/export';
export {
  CANVAS_LIMITS,
  type CanvasDocument,
  type CanvasShape,
  createCanvas,
  loadUntrustedCanvas,
  validateCanvas,
} from '@texuli/canvas/model';
export { default as CanvasView } from './CanvasView.svelte';
