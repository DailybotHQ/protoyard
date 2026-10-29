/**
 * Surfaces that must stay keyboard-reachable while a modal overlay traps
 * focus (the undo toaster). Mark the host with {@link UNDO_TOASTER_ATTR}.
 *
 * The toaster registers as an inert exemption (`@texuli/core/inert`), which
 * Texuli's overlays treat as part of every modal: Tab reaches it, and presses
 * in it are never "outside".
 */

/** Attribute on the UndoToaster landmark. */
export const UNDO_TOASTER_ATTR = 'data-ui-undo-toaster';

/** True when `target` is inside the undo toaster (or is the toaster itself). */
export function isUndoToasterTarget(target: EventTarget | null | undefined): boolean {
  if (!(target instanceof Element)) return false;
  return target.closest(`[${UNDO_TOASTER_ATTR}]`) !== null;
}

/**
 * @deprecated No longer needed: Texuli's modal focus scopes keep inert
 * exemptions (the undo toaster registers as one) reachable. Kept as a no-op
 * so existing callers keep working; returns a no-op uninstall function.
 */
export function installUndoToasterFocusExemption(_doc?: Document): () => void {
  return () => {};
}
