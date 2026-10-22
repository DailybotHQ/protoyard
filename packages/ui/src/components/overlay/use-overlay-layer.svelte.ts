import { type OverlayEntry, type OverlayStack, overlayStack } from './overlay-stack.ts';

export interface OverlayLayerOptions {
  /** Read reactively when the overlay opens. */
  modal?: () => boolean;
  stack?: OverlayStack;
}

export interface OverlayLayer {
  readonly stack: OverlayStack;
  /** The open entry, or null while closed. */
  readonly entry: OverlayEntry | null;
  readonly zIndex: number;
  /** Return focus to whatever opened the most recent entry (see `OverlayStack.restoreFocus`). */
  restoreFocus(container?: Element | null): boolean;
}

/**
 * Registers an overlay with the stack while `isOpen()` is true. The entry is
 * pushed in a pre-effect, before the overlay mounts and moves focus, so the
 * opener captured is the element the person used to open it.
 */
export function useOverlayLayer(
  isOpen: () => boolean,
  options: OverlayLayerOptions = {}
): OverlayLayer {
  const stack = options.stack ?? overlayStack;
  let entry = $state.raw<OverlayEntry | null>(null);
  // Kept after close so focus can return once the content has unmounted.
  let closed: OverlayEntry | null = null;

  $effect.pre(() => {
    const open = isOpen();
    if (open && entry === null) {
      entry = stack.push({ modal: options.modal?.() ?? false });
    } else if (!open && entry !== null) {
      stack.remove(entry);
      closed = entry;
      entry = null;
    }
  });

  $effect(() => () => {
    if (entry !== null) stack.remove(entry);
  });

  return {
    stack,
    get entry() {
      return entry;
    },
    get zIndex() {
      return entry?.zIndex ?? stack.topZIndex();
    },
    restoreFocus(container?: Element | null): boolean {
      const target = entry ?? closed;
      if (target === null) return false;
      return stack.restoreFocus(target, { container });
    },
  };
}

/** The z-index just above the top open overlay, kept current as the stack changes. */
export function useOverlayTopZIndex(stack: OverlayStack = overlayStack): {
  readonly current: number;
} {
  let current = $state(stack.topZIndex() + 1);
  $effect(() => {
    const sync = () => {
      current = stack.topZIndex() + 1;
    };
    sync();
    return stack.subscribe(sync);
  });
  return {
    get current() {
      return current;
    },
  };
}
