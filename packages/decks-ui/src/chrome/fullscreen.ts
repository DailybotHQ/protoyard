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

/**
 * How the deck fills the screen: `native` is the browser's Fullscreen API;
 * `window` is the CSS fallback that fills the page's own viewport, used where
 * the API is missing or refused (iPhone Safari, an iframe without
 * `allow="fullscreen"` such as an artifact viewer).
 */
export type DeckFullscreenMode = 'native' | 'window';

/** The full screen overlay fades after this long without a pointer move or touch. */
export const FULLSCREEN_OVERLAY_IDLE_MS = 2500;

/** What the full screen button's tooltip says when the deck will fill the window instead. */
export const FULLSCREEN_WINDOW_DESCRIPTION =
  'Fills this window with the slides: this page cannot use the browser’s full screen. Press Esc to leave.';

export interface DeckFullscreen {
  /** The current mode, or null when the deck is not full screen. */
  readonly mode: DeckFullscreenMode | null;
  /** The mode `enter()` will try first: `native` only when the API is available. */
  readonly preferred: DeckFullscreenMode;
  enter(): Promise<void>;
  exit(): Promise<void>;
  toggle(): Promise<void>;
  destroy(): void;
}

/**
 * Full screen for the deck root. The state always follows the document
 * (`fullscreenchange`, `document.fullscreenElement`), never the request
 * promise alone; a refusal (`fullscreenerror` or a rejected request) falls
 * back to fill-the-window mode instead of failing silently.
 */
export function createDeckFullscreen(options: {
  element: () => Element | null | undefined;
  onChange: (mode: DeckFullscreenMode | null) => void;
  doc?: Document;
}): DeckFullscreen {
  const doc = options.doc ?? document;
  let windowMode = false;
  let mode: DeckFullscreenMode | null = null;
  let requesting = false;

  const sync = () => {
    const next: DeckFullscreenMode | null = isFullscreen(options.element(), doc)
      ? 'native'
      : windowMode
        ? 'window'
        : null;
    if (next === mode) return;
    mode = next;
    options.onChange(mode);
  };
  const fallBack = () => {
    if (isFullscreen(options.element(), doc)) return;
    windowMode = true;
    sync();
  };
  const onError = () => {
    if (requesting) fallBack();
  };
  doc.addEventListener('fullscreenchange', sync);
  doc.addEventListener('fullscreenerror', onError);

  const api = {
    get mode() {
      return mode;
    },
    get preferred(): DeckFullscreenMode {
      return fullscreenAvailable(doc) ? 'native' : 'window';
    },
    async enter() {
      if (mode) return;
      const element = options.element();
      if (
        !element ||
        !fullscreenAvailable(doc) ||
        typeof element.requestFullscreen !== 'function'
      ) {
        fallBack();
        return;
      }
      requesting = true;
      try {
        await element.requestFullscreen();
      } catch {
        fallBack();
      } finally {
        requesting = false;
      }
      sync();
    },
    async exit() {
      if (windowMode) {
        windowMode = false;
        sync();
      }
      if (isFullscreen(options.element(), doc)) {
        try {
          await doc.exitFullscreen?.();
        } catch {
          // Already leaving (the browser's own Escape); `fullscreenchange` settles the state.
        }
      }
      sync();
    },
    toggle() {
      return mode ? api.exit() : api.enter();
    },
    destroy() {
      doc.removeEventListener('fullscreenchange', sync);
      doc.removeEventListener('fullscreenerror', onError);
    },
  };
  return api;
}
