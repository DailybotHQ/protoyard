<script lang="ts">
import { OVERLAY_Z_BASE } from '@texuli/core/overlay-core';
import type { ComponentProps } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { Toaster as TexuliToaster } from 'texuli/toast';
import { useOverlayPortalTarget } from '../../lib/use-overlay-portal.svelte.ts';
import { overlayStack } from '../overlay/overlay-stack.ts';
import { useOverlayTopZIndex } from '../overlay/use-overlay-layer.svelte.ts';

/**
 * Texuli's `Toaster` (same props), kept inside a framed device or browser
 * screen. Texuli 0.5.0's toast viewport is always a `popover="manual"` in the
 * page's top layer, with no container option (Texuli gap N32), so inside a
 * frame the toasts painted at the page's corner, outside the simulated screen.
 *
 * While a shell sets an overlay portal target (a framed screen, which is the
 * containing block for fixed descendants), the viewport leaves the top layer
 * and stays a fixed box inside the screen, ordered above contained overlays
 * by z-index, as contained dialogs are. Without a frame it is Texuli's top-layer
 * viewport unchanged. The region, its live toasts and its inert exemption stay
 * mounted either way, so toasts are announced and reachable under modals.
 */
type Props = ComponentProps<typeof TexuliToaster>;

let props: Props = $props();

const portal = useOverlayPortalTarget();
const topZ = useOverlayTopZIndex();
let openOverlays = $state(overlayStack.size);
$effect(() => overlayStack.subscribe((size) => (openOverlays = size)));
/** Above every contained overlay, as the undo toaster is. */
const containedZ = $derived(
  Math.max(60, topZ.current, openOverlays > 0 ? OVERLAY_Z_BASE + openOverlays + 1 : 0)
);

function isOpen(node: HTMLElement): boolean {
  try {
    return node.matches(':popover-open');
  } catch {
    return false;
  }
}

/**
 * Contains or releases Texuli's viewport. An attachment re-runs when the frame
 * or the overlay stack changes. It runs before Texuli's own mount effect: with
 * the `popover` attribute already removed, that effect's `showPopover()`
 * throws and Texuli falls back to its fixed positioning, as on engines
 * without popovers.
 */
const placeViewport: Attachment<HTMLElement> = (host) => {
  const contained = portal.current !== undefined;
  const z = containedZ;
  const viewport = host.querySelector<HTMLElement>('[data-tx-toast-viewport]');
  if (!viewport) return;
  if (contained) {
    try {
      if (isOpen(viewport)) viewport.hidePopover();
    } catch {
      // Already out of the top layer.
    }
    // Without the attribute the UA no longer hides it, and Texuli's re-raise
    // (which only acts on an open popover) leaves it in place.
    viewport.removeAttribute('popover');
    viewport.setAttribute('data-py-toaster-contained', '');
    viewport.style.zIndex = String(z);
    return;
  }
  viewport.removeAttribute('data-py-toaster-contained');
  viewport.style.zIndex = '';
  if (!viewport.hasAttribute('popover')) viewport.setAttribute('popover', 'manual');
  try {
    if (!isOpen(viewport)) viewport.showPopover();
  } catch {
    // Engines without popovers keep Texuli's fixed positioning.
  }
};
</script>

<div style="display: contents" data-py-toaster="" {@attach placeViewport}>
  <TexuliToaster {...props} />
</div>
