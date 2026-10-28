import 'fake-indexeddb/auto';
import { configure } from '@testing-library/svelte';
import { resetToastStore } from 'texuli/toast';
import { afterEach } from 'vitest';
import { toast } from '../../packages/ui/src/components/toast/toast.svelte.ts';
import { undoToast } from '../../packages/ui/src/components/toast/undo.svelte.ts';
import { setOverlayPortalTarget } from '../../packages/ui/src/lib/overlay-portal.ts';

/**
 * Lazy renderers (charts, blocks, views) resolve a dynamic import before the
 * first paint. Under a full parallel run the default 1 s wait for findBy and
 * waitFor times out on a busy machine, so asynchronous UI gets 3 s: still
 * well inside Vitest's 5 s test timeout, and no assertion is relaxed.
 */
configure({ asyncUtilTimeout: 3000 });

afterEach(() => {
  setOverlayPortalTarget(null);
  toast.dismiss();
  resetToastStore();
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
