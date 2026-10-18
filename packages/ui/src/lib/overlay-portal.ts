/**
 * Where Bits UI overlays (dialogs, sheets) portal when a device shell is
 * framed. ShellHost sets the device screen so fixed overlays stay inside the
 * bezel; cleared for full-bleed (falls back to `document.body`).
 */

let portalTarget: Element | null = null;
const listeners = new Set<() => void>();

export function setOverlayPortalTarget(el: Element | null): void {
  if (portalTarget === el) return;
  portalTarget = el;
  for (const listener of listeners) listener();
}

export function getOverlayPortalTarget(): Element | null {
  return portalTarget;
}

/** Subscribe to target changes (Svelte components re-read on notify). */
export function subscribeOverlayPortalTarget(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
