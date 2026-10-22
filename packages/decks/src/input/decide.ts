/**
 * Deck input as a pure decision: a keyboard press, a click or a swipe (plus
 * a little deck state) becomes one action or `null`. No DOM access: the
 * renderer describes the event target as a path of plain element facts
 * (`inputPathFrom` builds it from a real event path), so every guard is
 * unit-testable.
 *
 * Ported from the developer's Reveal deck (RevealDeck.svelte, guarded click
 * advance) including its fix: a click that closes the overview (or lands
 * while it is closing) never also advances.
 *
 * Which key does what comes from the control registry (`controls.ts`,
 * `DECK_CONTROLS`): the key maps below are derived from it, never typed twice.
 */
import { DECK_CONTROLS } from './controls.ts';

export const DECK_INPUT_ACTIONS = [
  'next',
  'prev',
  'first',
  'last',
  'overview',
  'presenter',
  'fullscreen',
  'blackout',
  'laser',
  'help',
  'print',
  'fullscreen-exit',
  'copy-link',
  'debug',
] as const;
export type DeckInputAction = (typeof DECK_INPUT_ACTIONS)[number];

/**
 * Interactive blocks (polls, quizzes, calculators, maps, embedded apps…) put
 * this attribute on their root so clicks and swipes inside them never move
 * the deck.
 */
export const DECK_INTERACTIVE_ATTRIBUTE = 'data-py-deck-interactive';
/** Deck chrome (progress bar, slide number, toolbar) carries this attribute. */
export const DECK_CHROME_ATTRIBUTE = 'data-py-deck-chrome';

/** A swipe must travel this far (CSS px) along its axis. */
export const DECK_SWIPE_MIN_DISTANCE = 50;
/** …and be this much longer on its axis than across it (axis lock). */
export const DECK_SWIPE_AXIS_RATIO = 1.5;
/** Slower drags are not swipes (they are reading or selecting). */
export const DECK_SWIPE_MAX_DURATION_MS = 800;

/** One element on the event path, innermost first. */
export interface DeckInputTarget {
  /** Lowercase tag name: `a`, `button`, `input`, `div`… */
  tag: string;
  /** `role` attribute, if any. */
  role?: string;
  /** True for `contenteditable` elements. */
  editable?: boolean;
  /** True for `<a>` with an `href`. */
  href?: boolean;
  /** Attribute names present that the guards look at (`data-py-deck-*`). */
  attributes?: readonly string[];
}

interface Modifiers {
  shiftKey?: boolean;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
}

export type DeckInputEvent =
  | (Modifiers & {
      kind: 'key';
      /** `KeyboardEvent.key`. */
      key: string;
      repeat?: boolean;
      /** True while an IME composes text. */
      isComposing?: boolean;
      path?: readonly DeckInputTarget[];
    })
  | (Modifiers & {
      kind: 'click';
      /** `MouseEvent.button`: 0 is the primary button. */
      button?: number;
      /** Characters selected when the click ended (a selection is not a click). */
      selectionLength?: number;
      path?: readonly DeckInputTarget[];
    })
  | {
      kind: 'swipe';
      /** Displacement in CSS px from pointer down to up. */
      dx: number;
      dy: number;
      durationMs?: number;
      pointerType?: 'touch' | 'pen' | 'mouse';
      path?: readonly DeckInputTarget[];
    };

export interface DeckInputState {
  /** `closing` covers the overview's exit transition (the double-advance bug). */
  overview?: 'closed' | 'open' | 'closing';
  blackout?: boolean;
  laser?: boolean;
  help?: boolean;
  /** True while the deck is in full screen: Esc leaves it once nothing else is open. */
  fullscreen?: boolean;
  /** True when the debug panel is available (dev builds, `?debug=1`): only then does D act. */
  debugAvailable?: boolean;
}

const EDITABLE_TAGS = new Set(['input', 'textarea', 'select']);
/** Elements a click belongs to; advancing would steal it. */
const CONTROL_TAGS = new Set([
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'option',
  'label',
  'summary',
  'details',
  'iframe',
  'video',
  'audio',
  'object',
  'embed',
]);
const CONTROL_ROLES = new Set([
  'button',
  'link',
  'checkbox',
  'radio',
  'switch',
  'slider',
  'spinbutton',
  'tab',
  'menuitem',
  'option',
  'textbox',
  'combobox',
  'listbox',
  'scrollbar',
]);

const hasAttribute = (target: DeckInputTarget, name: string) =>
  target.attributes?.includes(name) === true;

const isEditable = (target: DeckInputTarget) =>
  EDITABLE_TAGS.has(target.tag) || target.editable === true || target.role === 'textbox';

/** True when the target (or an ancestor) owns the pointer or the keyboard. */
function isGuardedTarget(path: readonly DeckInputTarget[]): boolean {
  return path.some(
    (target) =>
      CONTROL_TAGS.has(target.tag) ||
      target.href === true ||
      target.editable === true ||
      (target.role !== undefined && CONTROL_ROLES.has(target.role)) ||
      hasAttribute(target, DECK_INTERACTIVE_ATTRIBUTE) ||
      hasAttribute(target, DECK_CHROME_ATTRIBUTE)
  );
}

const anyModifier = (event: Modifiers) =>
  event.ctrlKey === true ||
  event.metaKey === true ||
  event.altKey === true ||
  event.shiftKey === true;

/** Keys that move through the deck (the navigate controls), without and with Shift. */
const NAVIGATION_KEYS: Readonly<Record<string, DeckInputAction>> = {};
const SHIFTED_NAVIGATION_KEYS: Readonly<Record<string, DeckInputAction>> = {};
/** Single-character toggles (case-insensitive), and those that also accept Shift (`?`). */
const TOGGLE_KEYS: Readonly<Record<string, DeckInputAction>> = {};
const SHIFT_ALLOWED_TOGGLES = new Set<string>();
/** Ctrl or ⌘ shortcuts (print). */
const MODIFIER_KEYS: Readonly<Record<string, DeckInputAction>> = {};

for (const item of DECK_CONTROLS) {
  for (const spec of item.keys) {
    if (spec.closes) continue;
    const key = spec.key.length === 1 ? spec.key.toLowerCase() : spec.key;
    if (spec.modifier) {
      (MODIFIER_KEYS as Record<string, DeckInputAction>)[key] = item.action;
    } else if (item.group === 'navigate') {
      const table = spec.shift === 'required' ? SHIFTED_NAVIGATION_KEYS : NAVIGATION_KEYS;
      (table as Record<string, DeckInputAction>)[spec.key] = item.action;
    } else {
      (TOGGLE_KEYS as Record<string, DeckInputAction>)[key] = item.action;
      if (spec.shift === 'allowed') SHIFT_ALLOWED_TOGGLES.add(key);
    }
  }
}

/**
 * What Esc closes, innermost first: the first one that is on wins. Every
 * control with a `closes` key in the registry is here (the controls test
 * checks it), so Esc always has a way out.
 */
const ESCAPE_ORDER: readonly [DeckInputAction, (state: DeckInputState) => boolean][] = [
  ['help', (state) => state.help === true],
  ['overview', (state) => state.overview === 'open'],
  ['blackout', (state) => state.blackout === true],
  ['laser', (state) => state.laser === true],
  ['fullscreen-exit', (state) => state.fullscreen === true],
];

/** The actions Esc can reach, innermost first (for tests and docs). */
export const DECK_ESCAPE_ORDER: readonly DeckInputAction[] = ESCAPE_ORDER.map(([action]) => action);

function decideKey(
  event: Extract<DeckInputEvent, { kind: 'key' }>,
  state: DeckInputState
): DeckInputAction | null {
  if (event.isComposing) return null;
  const path = event.path ?? [];
  if (path.some(isEditable)) return null;
  const key = event.key;
  const lower = key.length === 1 ? key.toLowerCase() : key;

  // Print is the one browser shortcut a deck takes over (print mode lays out one slide per page).
  const shortcut = MODIFIER_KEYS[lower];
  if ((event.ctrlKey || event.metaKey) && !event.altKey && shortcut) {
    return event.repeat ? null : shortcut;
  }
  if (event.ctrlKey || event.metaKey || event.altKey) return null;

  if (key === 'Escape') {
    if (event.repeat) return null;
    return ESCAPE_ORDER.find(([, isOn]) => isOn(state))?.[0] ?? null;
  }

  const found = TOGGLE_KEYS[lower];
  // Debug acts only where the panel is available; elsewhere D is an ordinary key.
  const toggle = found === 'debug' && state.debugAvailable !== true ? undefined : found;
  // `?` needs Shift on most layouts; letters with Shift are someone typing.
  if (toggle && (SHIFT_ALLOWED_TOGGLES.has(lower) || !event.shiftKey)) {
    if (event.repeat) return null;
    if (state.overview === 'closing') return null;
    if (state.help) return toggle === 'help' ? 'help' : null;
    if (state.overview === 'open') return toggle === 'overview' ? 'overview' : null;
    if (state.blackout) return toggle === 'blackout' ? 'blackout' : null;
    return toggle;
  }

  const plain = NAVIGATION_KEYS[key];
  const shifted = SHIFTED_NAVIGATION_KEYS[key];
  if (!plain && !shifted) return null;
  // The overview grid, help and a blacked-out screen own the arrows; a closing overview takes nothing.
  if (state.overview === 'open' || state.overview === 'closing' || state.help || state.blackout) {
    return null;
  }
  // A focused control (a slider, a tab list) uses arrows and Space itself.
  if (isGuardedTarget(path)) return null;
  if (event.shiftKey) return shifted ?? null;
  return plain ?? null;
}

function decideClick(
  event: Extract<DeckInputEvent, { kind: 'click' }>,
  state: DeckInputState
): DeckInputAction | null {
  if ((event.button ?? 0) !== 0) return null;
  if (anyModifier(event)) return null;
  if (state.overview === 'open' || state.overview === 'closing') return null;
  if (state.help || state.blackout || state.laser) return null;
  if ((event.selectionLength ?? 0) > 0) return null;
  if (isGuardedTarget(event.path ?? [])) return null;
  return 'next';
}

function decideSwipe(
  event: Extract<DeckInputEvent, { kind: 'swipe' }>,
  state: DeckInputState
): DeckInputAction | null {
  if (event.pointerType === 'mouse') return null;
  if (!Number.isFinite(event.dx) || !Number.isFinite(event.dy)) return null;
  if (state.overview === 'open' || state.overview === 'closing') return null;
  if (state.help || state.blackout) return null;
  if (isGuardedTarget(event.path ?? [])) return null;
  if ((event.durationMs ?? 0) > DECK_SWIPE_MAX_DURATION_MS) return null;
  const ax = Math.abs(event.dx);
  const ay = Math.abs(event.dy);
  // Only horizontal swipes navigate; vertical ones scroll the page or the slide.
  if (ax < DECK_SWIPE_MIN_DISTANCE || ax < ay * DECK_SWIPE_AXIS_RATIO) return null;
  return event.dx < 0 ? 'next' : 'prev';
}

/** The action an input event asks for, or `null` when the deck should ignore it. */
export function decideDeckInput(
  event: DeckInputEvent,
  state: DeckInputState = {}
): DeckInputAction | null {
  switch (event.kind) {
    case 'key':
      return decideKey(event, state);
    case 'click':
      return decideClick(event, state);
    case 'swipe':
      return decideSwipe(event, state);
    default:
      return null;
  }
}

/** The facts a guard reads, from anything element-like (duck-typed, no DOM types). */
interface ElementLike {
  tagName?: unknown;
  isContentEditable?: unknown;
  getAttribute?: (name: string) => string | null;
  hasAttribute?: (name: string) => boolean;
}

const WATCHED_ATTRIBUTES = [DECK_INTERACTIVE_ATTRIBUTE, DECK_CHROME_ATTRIBUTE] as const;

/**
 * Turns an event path (`event.composedPath()`, innermost first) into the
 * plain targets `decideDeckInput` reads. Non-elements (text nodes, document,
 * window) are skipped; the walk stops at `stopAt` (the deck root) when given.
 */
export function inputPathFrom(nodes: readonly unknown[], stopAt?: unknown): DeckInputTarget[] {
  const out: DeckInputTarget[] = [];
  for (const node of nodes) {
    if (stopAt !== undefined && node === stopAt) break;
    const el = node as ElementLike | null;
    if (!el || typeof el.tagName !== 'string' || typeof el.getAttribute !== 'function') continue;
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') ?? undefined;
    const attributes = WATCHED_ATTRIBUTES.filter((name) =>
      typeof el.hasAttribute === 'function'
        ? el.hasAttribute(name)
        : el.getAttribute?.(name) !== null
    );
    out.push({
      tag,
      ...(role ? { role } : {}),
      ...(el.isContentEditable === true ? { editable: true } : {}),
      ...(tag === 'a' && el.getAttribute('href') !== null ? { href: true } : {}),
      ...(attributes.length > 0 ? { attributes } : {}),
    });
  }
  return out;
}
