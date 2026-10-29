/**
 * One ordered stack for every layered surface (drawers, and any overlay that
 * opts in through `useOverlayLayer`).
 *
 * The overlay primitives already route Escape and outside clicks to the topmost layer, traps
 * focus in modal content and locks scroll. The stack adds what nesting needs
 * on top of that: monotonic z-indexes so a later overlay always paints above
 * an earlier one, the question "is this the top overlay?", the element that
 * opened each overlay so focus can return to it, and dismissible layers — a
 * menu or picker open inside an overlay owns Escape, so one key press closes
 * that layer and never the overlay (and the draft) behind it.
 */

/** First z-index handed out: just above the `z-50` that Dialog and BottomSheet use. */
export const OVERLAY_Z_BASE = 50;

export interface OverlayEntry {
  readonly id: number;
  readonly zIndex: number;
  /** Modal overlays dim the page and trap focus; non-modal ones leave it usable. */
  readonly modal: boolean;
  /** The element focused when the overlay opened; focus returns here on close. */
  readonly opener: HTMLElement | null;
}

export interface PushOverlayOptions {
  modal?: boolean;
  /** Defaults to the currently focused element (never `<body>`). */
  opener?: Element | null;
}

export interface RestoreFocusOptions {
  /**
   * The closed overlay's element. Focus is only moved when it is lost (on
   * `<body>`) or still inside this element, so a click that moved focus to the
   * page behind a non-modal overlay is never undone.
   */
  container?: Element | null;
}

type StackListener = (size: number) => void;

function focusedElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement && active !== document.body ? active : null;
}

function canFocus(element: HTMLElement): boolean {
  if (!element.isConnected) return false;
  if ((element as HTMLButtonElement).disabled) return false;
  return element.closest('[inert]') === null;
}

export class OverlayStack {
  #entries: OverlayEntry[] = [];
  #nextId = 0;
  #nextZ = OVERLAY_Z_BASE;
  #listeners = new Set<StackListener>();
  #layers = new Map<HTMLElement, () => void>();

  /** Opens an entry that paints above every open overlay. */
  push(options: PushOverlayOptions = {}): OverlayEntry {
    const opener =
      options.opener === undefined
        ? focusedElement()
        : options.opener instanceof HTMLElement
          ? options.opener
          : null;
    this.#nextId += 1;
    this.#nextZ += 1;
    const entry: OverlayEntry = {
      id: this.#nextId,
      zIndex: this.#nextZ,
      modal: options.modal ?? false,
      opener,
    };
    this.#entries.push(entry);
    this.#notify();
    return entry;
  }

  /** Removes an entry wherever it sits; returns false when it was not open. */
  remove(entry: OverlayEntry): boolean {
    const index = this.#entries.indexOf(entry);
    if (index === -1) return false;
    this.#entries.splice(index, 1);
    // Restart the counter once everything is closed so z-indexes never creep up.
    if (this.#entries.length === 0) this.#nextZ = OVERLAY_Z_BASE;
    this.#notify();
    return true;
  }

  /**
   * Moves focus back to the entry's opener when focus was lost with the closed
   * overlay. Returns true when focus moved.
   */
  restoreFocus(entry: OverlayEntry, options: RestoreFocusOptions = {}): boolean {
    const opener = entry.opener;
    if (!opener || !canFocus(opener)) return false;
    const current = focusedElement();
    const lost = current === null || !current.isConnected;
    const inside = Boolean(current && options.container?.contains(current));
    if (!lost && !inside) return false;
    opener.focus({ preventScroll: true });
    return document.activeElement === opener;
  }

  top(): OverlayEntry | undefined {
    return this.#entries[this.#entries.length - 1];
  }

  isTop(entry: OverlayEntry | null | undefined): boolean {
    return entry != null && this.top() === entry;
  }

  /** Open entries, bottom first. */
  entries(): readonly OverlayEntry[] {
    return [...this.#entries];
  }

  get size(): number {
    return this.#entries.length;
  }

  /** The z-index of the top overlay, or the base when nothing is open. */
  topZIndex(): number {
    return this.top()?.zIndex ?? OVERLAY_Z_BASE;
  }

  hasModal(): boolean {
    return this.#entries.some((entry) => entry.modal);
  }

  /** Listen to the number of open overlays. Returns the unsubscribe function. */
  subscribe(listener: StackListener): () => void {
    this.#listeners.add(listener);
    return () => {
      this.#listeners.delete(listener);
    };
  }

  /**
   * A floating layer inside an overlay (menu panel, picker) registers here
   * while open, with how to close it. Escape then closes that layer first.
   */
  registerDismissibleLayer(element: HTMLElement, close: () => void): () => void {
    this.#layers.set(element, close);
    return () => {
      this.#layers.delete(element);
    };
  }

  /**
   * Called by an overlay on Escape: when a registered layer owns the key
   * (holds focus, or lives inside the overlay), closes the innermost one and
   * returns true — the overlay must stay open.
   */
  dismissLayerFor(event: KeyboardEvent, overlay: Element | null): boolean {
    if (this.#layers.size === 0) return false;
    const target = event.target instanceof Node ? event.target : null;
    const owning = [...this.#layers].filter(
      ([layer]) =>
        layer.isConnected &&
        ((target !== null && layer.contains(target)) || overlay?.contains(layer) === true)
    );
    if (owning.length === 0) return false;
    const holding = owning.filter(([layer]) => target !== null && layer.contains(target));
    const pool = holding.length > 0 ? holding : owning;
    let innermost = pool[0] as [HTMLElement, () => void];
    for (const candidate of pool) {
      if (candidate[0] !== innermost[0] && innermost[0].contains(candidate[0])) {
        innermost = candidate;
      }
    }
    innermost[1]();
    return true;
  }

  /** Forget every entry and layer (tests, or a full app reset). */
  reset(): void {
    this.#entries = [];
    this.#layers.clear();
    this.#nextZ = OVERLAY_Z_BASE;
    this.#notify();
  }

  #notify(): void {
    for (const listener of this.#listeners) listener(this.#entries.length);
  }
}

/** The shared stack every built-in overlay registers with. */
export const overlayStack = new OverlayStack();
