import type { OverlayDismissEvent } from '@texuli/core/overlay';
import type { OverlayLayer } from './use-overlay-layer.svelte.ts';

export interface OverlayDismissRules {
  layer: OverlayLayer;
  /** The overlay's element, for the dismissible layers it contains. */
  element: () => Element | null;
  /** Whether Escape closes it. Default true. */
  escape?: () => boolean;
  /** Whether a pointer down outside closes it. Default true. */
  outside?: () => boolean;
  /** While true, nothing closes it (an action in progress). */
  blocked?: () => boolean;
}

/**
 * The close rules every Protoyard overlay applies on top of the primitive's
 * own (`onDismissRequest`): only the top overlay of the stack closes, a menu
 * or picker open inside it takes Escape first, and Escape and outside presses
 * follow the overlay's options. Presses in the undo toaster never reach here:
 * Texuli's overlays count inert exemptions (the toaster) as inside.
 */
export function overlayDismissHandler(
  rules: OverlayDismissRules
): (event: OverlayDismissEvent) => void {
  return (event) => {
    const { layer } = rules;
    if (rules.blocked?.() || !layer.stack.isTop(layer.entry)) {
      event.preventDefault();
      return;
    }
    if (event.reason === 'escape') {
      const key = event.originalEvent;
      const handled =
        key instanceof KeyboardEvent && layer.stack.dismissLayerFor(key, rules.element());
      if (handled || rules.escape?.() === false) event.preventDefault();
      return;
    }
    if (rules.outside?.() === false) event.preventDefault();
  };
}
