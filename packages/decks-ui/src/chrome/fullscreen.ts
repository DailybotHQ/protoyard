/**
 * Browser full screen for the deck root. The level-1 deck entry has no
 * runtime, so this calls the Fullscreen API directly (level 2 prototypes may
 * use the renderer's `enterFullScreen` instead). Every call is guarded: a
 * missing API or a refusal resolves `false` and never throws.
 */

export function fullscreenAvailable(doc: Document = document): boolean {
  return (
    doc.fullscreenEnabled === true && typeof doc.documentElement.requestFullscreen === 'function'
  );
}

/** True when `element` (or something inside it) is the full screen element. */
export function isFullscreen(
  element: Element | null | undefined,
  doc: Document = document
): boolean {
  const current = doc.fullscreenElement;
  return Boolean(current && element && (current === element || element.contains(current)));
}

/** Enters full screen on `element`, or leaves it. Resolves the new state. */
export async function toggleFullscreen(
  element: Element | null | undefined,
  doc: Document = document
): Promise<boolean> {
  try {
    if (doc.fullscreenElement) {
      await doc.exitFullscreen?.();
      return false;
    }
    if (!element || typeof element.requestFullscreen !== 'function') return false;
    await element.requestFullscreen();
    return isFullscreen(element, doc);
  } catch {
    return isFullscreen(element, doc);
  }
}

/** Calls `listener` whenever the document enters or leaves full screen. */
export function onFullscreenChange(listener: () => void, doc: Document = document): () => void {
  doc.addEventListener('fullscreenchange', listener);
  return () => doc.removeEventListener('fullscreenchange', listener);
}
