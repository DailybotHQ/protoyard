import type { DeckControl, DeckControlKey } from '@protoyard/decks';

/**
 * The deck chrome's tooltip: one instance per toolbar, moved between the
 * buttons (never one per button). It explains a control to a first-time
 * viewer: its label, the registry's one-sentence description and its
 * shortcut. It opens on hover after a short delay, at once on keyboard focus,
 * and on a long press for touch; Escape closes only the tooltip. While it
 * shows, the button is `aria-describedby` the visible tooltip text.
 *
 * Plain DOM and pure functions, no Svelte runes: `ChromeTooltip.svelte` draws
 * it, and every rule here is unit-testable with fake timers.
 */

/** Hover delay before a tooltip opens. */
export const TOOLTIP_HOVER_DELAY_MS = 300;
/** A touch held this long shows the tooltip instead of pressing the button. */
export const TOOLTIP_LONG_PRESS_MS = 500;
/** After a long press ends, the tooltip stays this long so it can be read. */
export const TOOLTIP_LINGER_MS = 1500;
/** Space between the tooltip and its button, and kept to the viewport edges. */
export const TOOLTIP_GAP_PX = 8;
export const TOOLTIP_MARGIN_PX = 8;

export interface TooltipContent {
  title: string;
  description: string;
  /** `Press F.`, `Press S or P.`, or null for a control without keys. */
  shortcut: string | null;
}

/** "A", "A or B", "A, B or C". */
function listOr(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} or ${items.at(-1)}`;
}

/** The shortcut sentence for a control's keys. */
export function shortcutText(keys: readonly DeckControlKey[]): string | null {
  const opens = keys.filter((key) => !key.closes).map((key) => key.label);
  const closes = keys.some((key) => key.closes);
  if (opens.length === 0) return closes ? 'Press Esc.' : null;
  return `Press ${listOr(opens)}.${closes ? ' Esc closes it.' : ''}`;
}

/** What the tooltip says about a control (the label may be its current state, e.g. "Leave full screen"). */
export function controlTooltip(
  control: Pick<DeckControl, 'label' | 'description' | 'keys'>,
  label: string = control.label
): TooltipContent {
  return { title: label, description: control.description, shortcut: shortcutText(control.keys) };
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TooltipPlacement {
  x: number;
  y: number;
}

/**
 * Where the tooltip goes: centered above its button, flipped below when the
 * top has no room (or less room than the bottom), and slid sideways to stay
 * inside the viewport.
 */
export function placeTooltip(
  anchor: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = TOOLTIP_GAP_PX,
  margin = TOOLTIP_MARGIN_PX
): TooltipPlacement {
  const above = anchor.y - gap - tip.height;
  const below = anchor.y + anchor.height + gap;
  const roomAbove = anchor.y - gap - margin;
  const roomBelow = viewport.height - (anchor.y + anchor.height) - gap - margin;
  const top = roomAbove >= tip.height || roomAbove >= roomBelow;
  const centered = anchor.x + anchor.width / 2 - tip.width / 2;
  const maxX = Math.max(margin, viewport.width - margin - tip.width);
  return {
    x: Math.min(Math.max(centered, margin), maxX),
    y: top ? Math.max(margin, above) : below,
  };
}

type OpenedBy = 'hover' | 'focus' | 'press';

export interface TooltipControllerOptions<A> {
  /** True while tooltips must not show (laser, blackout, print, presenter popup). */
  suppressed?: () => boolean;
  /** Called whenever the anchor showing changes (null: hidden). */
  onChange: (anchor: A | null) => void;
}

/** The tooltip's state machine, independent of the DOM. */
export interface TooltipController<A> {
  readonly current: A | null;
  hoverStart(anchor: A): void;
  hoverEnd(anchor: A): void;
  focus(anchor: A): void;
  blur(anchor: A): void;
  /** A touch began on the anchor. */
  pressStart(anchor: A): void;
  /** The touch ended or was cancelled. */
  pressEnd(anchor: A): void;
  /** True once after a long press showed the tooltip: the click that follows must not press the button. */
  consumeClick(anchor: A): boolean;
  /** Escape: closes the tooltip; true when it was open (the key is then the tooltip's alone). */
  escape(): boolean;
  hide(): void;
  destroy(): void;
}

export function createTooltipController<A>(
  options: TooltipControllerOptions<A>
): TooltipController<A> {
  let current: A | null = null;
  let openedBy: OpenedBy | null = null;
  let pending: ReturnType<typeof setTimeout> | null = null;
  let pressed: A | null = null;
  let swallowClick: A | null = null;
  /** Just after a hover tooltip closed: the next button's opens at once (moving along the toolbar). */
  let warm = false;
  let warmTimer: ReturnType<typeof setTimeout> | null = null;
  const cool = () => {
    if (warmTimer !== null) clearTimeout(warmTimer);
    warmTimer = null;
    warm = false;
  };

  const cancel = () => {
    if (pending !== null) clearTimeout(pending);
    pending = null;
  };
  const show = (anchor: A, by: OpenedBy) => {
    cancel();
    if (options.suppressed?.()) return;
    const changed = current !== anchor;
    current = anchor;
    openedBy = by;
    if (changed) options.onChange(anchor);
  };
  const hide = () => {
    cancel();
    pressed = null;
    if (current === null) return;
    current = null;
    openedBy = null;
    options.onChange(null);
  };
  const later = (run: () => void, ms: number) => {
    cancel();
    pending = setTimeout(() => {
      pending = null;
      run();
    }, ms);
  };

  return {
    get current() {
      return current;
    },
    hoverStart(anchor) {
      if (current === anchor) return;
      // Moving along the toolbar while (or just after) a tooltip shows switches at once.
      if (warm || (current !== null && openedBy === 'hover')) {
        cool();
        show(anchor, 'hover');
        return;
      }
      later(() => show(anchor, 'hover'), TOOLTIP_HOVER_DELAY_MS);
    },
    hoverEnd(anchor) {
      if (current === null) {
        cancel();
        return;
      }
      if (current !== anchor || openedBy !== 'hover') return;
      hide();
      cool();
      warm = true;
      warmTimer = setTimeout(() => {
        warmTimer = null;
        warm = false;
      }, TOOLTIP_HOVER_DELAY_MS);
    },
    focus(anchor) {
      show(anchor, 'focus');
    },
    blur(anchor) {
      if (current === anchor && openedBy !== 'hover') hide();
    },
    pressStart(anchor) {
      pressed = anchor;
      later(() => {
        if (pressed !== anchor) return;
        swallowClick = anchor;
        show(anchor, 'press');
      }, TOOLTIP_LONG_PRESS_MS);
    },
    pressEnd(anchor) {
      if (pressed !== anchor) return;
      pressed = null;
      if (current === anchor && openedBy === 'press') later(hide, TOOLTIP_LINGER_MS);
      else cancel();
    },
    consumeClick(anchor) {
      if (swallowClick !== anchor) return false;
      swallowClick = null;
      return true;
    },
    escape() {
      if (current === null) return false;
      hide();
      return true;
    },
    hide,
    destroy() {
      hide();
      cool();
      swallowClick = null;
    },
  };
}

/** What `ChromeTooltip.svelte` draws: the button it belongs to and its text. */
export interface DeckTooltipView {
  anchor: HTMLElement;
  content: TooltipContent;
}

export interface DeckTooltip {
  /** The tooltip element's id (the buttons point `aria-describedby` at it while it shows). */
  readonly id: string;
  readonly view: DeckTooltipView | null;
  /** A Svelte attachment for one button: `{@attach tooltip.anchor(() => content)}`. */
  anchor(content: () => TooltipContent): (node: HTMLElement) => () => void;
  subscribe(listener: (view: DeckTooltipView | null) => void): () => void;
  hide(): void;
  destroy(): void;
}

let sequence = 0;

/** True for a focus that came from the keyboard (`:focus-visible`), not a click or tap. */
function keyboardFocus(node: HTMLElement): boolean {
  try {
    return node.matches(':focus-visible');
  } catch {
    return true;
  }
}

/**
 * The one tooltip of a toolbar. Each button attaches with `anchor()`; the
 * tooltip listens for Escape (in the capture phase, before the deck sees it)
 * only while it shows. CSS hides it in print.
 */
export function createDeckTooltip(options: { suppressed?: () => boolean } = {}): DeckTooltip {
  sequence += 1;
  const id = `py-deck-tooltip-${sequence}`;
  const contents = new Map<HTMLElement, () => TooltipContent>();
  const listeners = new Set<(view: DeckTooltipView | null) => void>();
  let view: DeckTooltipView | null = null;
  let described: HTMLElement | null = null;

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !controller.escape()) return;
    // The tooltip's alone: never also leave full screen or close the help dialog.
    event.preventDefault();
    event.stopImmediatePropagation();
  };

  const controller: TooltipController<HTMLElement> = createTooltipController<HTMLElement>({
    ...(options.suppressed ? { suppressed: options.suppressed } : {}),
    onChange: (anchor) => {
      // The toolbar's buttons carry no other description, so the tooltip owns the attribute.
      described?.removeAttribute('aria-describedby');
      described = null;
      const read = anchor ? contents.get(anchor) : undefined;
      view = anchor && read ? { anchor, content: read() } : null;
      if (view) {
        view.anchor.setAttribute('aria-describedby', id);
        described = view.anchor;
        window.addEventListener('keydown', onKeydown, true);
      } else {
        window.removeEventListener('keydown', onKeydown, true);
      }
      for (const listener of listeners) listener(view);
    },
  });

  return {
    id,
    get view() {
      return view;
    },
    anchor(content) {
      return (node) => {
        contents.set(node, content);
        const enter = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') controller.hoverStart(node);
        };
        const leave = (event: PointerEvent) => {
          if (event.pointerType !== 'touch') controller.hoverEnd(node);
        };
        const down = (event: PointerEvent) => {
          if (event.pointerType === 'touch') controller.pressStart(node);
        };
        const up = (event: PointerEvent) => {
          if (event.pointerType === 'touch') controller.pressEnd(node);
        };
        const focus = () => {
          if (keyboardFocus(node)) controller.focus(node);
        };
        const blur = () => controller.blur(node);
        const click = (event: MouseEvent) => {
          // The click that ends a long press only showed the tooltip.
          if (!controller.consumeClick(node)) return;
          event.preventDefault();
          event.stopImmediatePropagation();
        };
        const menu = (event: Event) => {
          // A long press would open the system menu on touch screens.
          if (controller.current === node) event.preventDefault();
        };
        node.addEventListener('pointerenter', enter);
        node.addEventListener('pointerleave', leave);
        node.addEventListener('pointerdown', down);
        node.addEventListener('pointerup', up);
        node.addEventListener('pointercancel', up);
        node.addEventListener('focus', focus);
        node.addEventListener('blur', blur);
        node.addEventListener('click', click, true);
        node.addEventListener('contextmenu', menu);
        return () => {
          if (controller.current === node) controller.hide();
          contents.delete(node);
          node.removeEventListener('pointerenter', enter);
          node.removeEventListener('pointerleave', leave);
          node.removeEventListener('pointerdown', down);
          node.removeEventListener('pointerup', up);
          node.removeEventListener('pointercancel', up);
          node.removeEventListener('focus', focus);
          node.removeEventListener('blur', blur);
          node.removeEventListener('click', click, true);
          node.removeEventListener('contextmenu', menu);
        };
      };
    },
    subscribe(listener) {
      listeners.add(listener);
      listener(view);
      return () => listeners.delete(listener);
    },
    hide() {
      controller.hide();
    },
    destroy() {
      controller.hide();
      controller.destroy();
      listeners.clear();
      contents.clear();
    },
  };
}
