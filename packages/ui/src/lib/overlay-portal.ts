/**
 * Where overlays (dialogs, sheets, the undo toaster) open when a device shell
 * is framed. ShellHost sets the device screen so overlays stay inside the
 * bezel; cleared for full-bleed (they open in the page's top layer).
 */

let portalTarget: Element | null = null;
const listeners = new Set<() => void>();

export function setOverlayPortalTarget(el: Element | null): void {
  if (portalTarget === el) return;
  portalTarget = el;
  for (const listener of listeners) listener();
}

export function getOverlayPortalTarget(): Element | null {
  if (portalTarget && !portalTarget.isConnected) {
    setOverlayPortalTarget(null);
  }
  return portalTarget;
}

/** Subscribe to target changes (Svelte components re-read on notify). */
export function subscribeOverlayPortalTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
