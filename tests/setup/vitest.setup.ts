import 'fake-indexeddb/auto';
import { afterEach } from 'vitest';
import { toast } from '../../packages/ui/src/components/toast/toast.svelte.ts';
import { undoToast } from '../../packages/ui/src/components/toast/undo.svelte.ts';
import { setOverlayPortalTarget } from '../../packages/ui/src/lib/overlay-portal.ts';

afterEach(() => {
  setOverlayPortalTarget(null);
  toast.dismiss();
  toast.announcement = null;
  undoToast.dismiss();
  undoToast.announcement = null;
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.clear();
    } catch {
      // Storage is unavailable in some browser-like test contexts.
    }
    try {
      window.sessionStorage.clear();
    } catch {
      // Storage is unavailable in some browser-like test contexts.
    }
  }
});

/**
 * happy-dom rejects `Animation.finished` when Svelte cancels a transition
 * (real browsers don't surface this), producing unhandled AbortErrors in
 * component tests. Marking the promise as handled keeps them honest and quiet.
 */
if (typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function') {
  const original = Element.prototype.animate;
  Element.prototype.animate = function animate(
    this: Element,
    ...args: Parameters<Element['animate']>
  ) {
    const animation = original.apply(this, args);
    animation.finished?.catch(() => {});
    return animation;
  };
}
