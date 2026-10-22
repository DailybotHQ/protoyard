/**
 * Surfaces that must stay keyboard-reachable while a modal overlay traps
 * focus (the undo toaster). Mark the host with {@link UNDO_TOASTER_ATTR}.
 *
 * Bits modal focus scopes listen on document `focusin` (capture) and pull
 * focus back into the overlay. {@link installUndoToasterFocusExemption}
 * registers an earlier capture listener that stops those handlers when focus
 * lands in the toaster, so Tab can reach Undo / Dismiss.
 */

/** Attribute on the UndoToaster landmark. */
export const UNDO_TOASTER_ATTR = 'data-ui-undo-toaster';

/** True when `target` is inside the undo toaster (or is the toaster itself). */
export function isUndoToasterTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[${UNDO_TOASTER_ATTR}]`) !== null;
}

let exemptionInstalled = false;

/**
 * Install once per document. Safe to call from `UndoToaster` mount and from
 * tests. Returns an uninstall function (no-op after the first install keeps
 * the listener for the app lifetime).
 */
export function installUndoToasterFocusExemption(
  doc: Document = typeof document !== 'undefined' ? document : (undefined as unknown as Document)
): () => void {
  if (!doc || exemptionInstalled) return () => {};
  exemptionInstalled = true;
  const onFocusIn = (event: FocusEvent) => {
    if (isUndoToasterTarget(event.target)) {
      event.stopImmediatePropagation();
    }
  };
  doc.addEventListener('focusin', onFocusIn, true);
  return () => {
    doc.removeEventListener('focusin', onFocusIn, true);
    exemptionInstalled = false;
  };
}
