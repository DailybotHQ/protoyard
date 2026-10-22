/**
 * Every deck control, described once (`DECK_CONTROLS`). The toolbar, its
 * tooltips, the help dialog, the docs tables and `protoyard deck
 * capabilities` all read this registry, and the input guard (`decide.ts`)
 * derives its key maps from it, so a label, a shortcut and what a key does
 * can never drift apart.
 *
 * Data only: no DOM, no Svelte, no icons. `icon` is an id the renderer maps
 * to its own icon set, and `available(env)` reads the capabilities the
 * renderer detected (`DeckControlEnvironment`).
 */
import type { DeckInputAction } from './decide.ts';

/** Where a control sits, in display order. */
export const DECK_CONTROL_GROUPS = [
  'navigate',
  'view',
  'present',
  'share',
  'help',
  'debug',
] as const;
export type DeckControlGroup = (typeof DECK_CONTROL_GROUPS)[number];

/**
 * Icon ids (Lucide names). The registry stays icon-free; a renderer maps each
 * id to a component.
 */
export const DECK_CONTROL_ICONS = [
  'arrow-right',
  'arrow-left',
  'arrow-left-to-line',
  'arrow-right-to-line',
  'layout-grid',
  'presentation',
  'maximize',
  'minimize',
  'eye-off',
  'pointer',
  'keyboard',
  'printer',
  'link',
  'bug',
  'list',
] as const;
export type DeckControlIcon = (typeof DECK_CONTROL_ICONS)[number];

/** Browser and host capabilities a control can depend on. */
export const DECK_CONTROL_CAPABILITIES = [
  /** Full screen: the Fullscreen API, or the "fill the window" fallback. */
  'fullscreen',
  /** A second window for the presenter (else it opens beside the deck). */
  'popup',
  /** Writing to the clipboard. */
  'clipboard',
  /** `window.print()`. */
  'print',
  /** The debug panel: dev builds, `?debug=1` or `debug="on"`. */
  'debug',
] as const;
export type DeckControlCapability = (typeof DECK_CONTROL_CAPABILITIES)[number];

/** What the renderer detected; each flag is true when the capability works. */
export type DeckControlEnvironment = Readonly<Record<DeckControlCapability, boolean>>;

/**
 * A normal viewer's browser: everything a page can do, and no debug panel
 * (it is opt-in). The docs tables and `DECK_KEY_BINDINGS` describe this case.
 */
export const DEFAULT_DECK_CONTROL_ENVIRONMENT: DeckControlEnvironment = Object.freeze({
  fullscreen: true,
  popup: true,
  clipboard: true,
  print: true,
  debug: false,
});

/** One key that triggers a control. */
export interface DeckControlKey {
  /** `KeyboardEvent.key` (letters match either case). */
  key: string;
  /** How a person reads it: `→`, `Page Down`, `Ctrl + P`. */
  label: string;
  /**
   * Shift: `required` (Shift + Space goes back), or `allowed` (`?` needs Shift
   * on most layouts). Omitted: the key works only without Shift.
   */
  shift?: 'required' | 'allowed';
  /** The modifier it needs: Ctrl, or ⌘ on a Mac. */
  modifier?: 'ctrl' | 'meta';
  /** The key only closes this control while it is on (`Esc`). */
  closes?: boolean;
}

export interface DeckControl {
  /** Stable id for hooks and docs (`data-py-deck-tool`), the same as the action. */
  id: DeckInputAction;
  /** What the deck does (`DeckInputAction`). */
  action: DeckInputAction;
  group: DeckControlGroup;
  /** A short name for the button and the help dialog. */
  label: string;
  /** One sentence a first-time viewer understands, for the tooltip. */
  description: string;
  keys: readonly DeckControlKey[];
  /** True when the control turns something on and off (a pressed state). */
  toggle: boolean;
  icon: DeckControlIcon;
  /** Capabilities the control needs to work at all. */
  requires: readonly DeckControlCapability[];
  /** True when every capability it requires is present. */
  available: (env: DeckControlEnvironment) => boolean;
}

type ControlSpec = Omit<DeckControl, 'id' | 'available'>;

const ESC: DeckControlKey = { key: 'Escape', label: 'Esc', closes: true };

function control(spec: ControlSpec): DeckControl {
  return Object.freeze({
    ...spec,
    id: spec.action,
    keys: Object.freeze(spec.keys.map((key) => Object.freeze({ ...key }))),
    requires: Object.freeze([...spec.requires]),
    available: (env: DeckControlEnvironment) => spec.requires.every((need) => env[need] === true),
  });
}

/** Every deck control, in display order (grouped by `DECK_CONTROL_GROUPS`). */
export const DECK_CONTROLS: readonly DeckControl[] = Object.freeze([
  control({
    action: 'prev',
    group: 'navigate',
    label: 'Previous step or slide',
    description: 'Goes back one step, or to the previous slide when this one is at its start.',
    keys: [
      { key: 'ArrowLeft', label: '←' },
      { key: 'ArrowUp', label: '↑' },
      { key: 'PageUp', label: 'Page Up' },
      { key: ' ', label: 'Shift + Space', shift: 'required' },
    ],
    toggle: false,
    icon: 'arrow-left',
    requires: [],
  }),
  control({
    action: 'jump',
    group: 'navigate',
    label: 'Choose a slide',
    description: 'Opens the slide list so you can jump directly to a slide.',
    keys: [],
    toggle: false,
    icon: 'list',
    requires: [],
  }),
  control({
    action: 'next',
    group: 'navigate',
    label: 'Next step or slide',
    description: 'Shows the next step of this slide, or the next slide when it has none left.',
    keys: [
      { key: 'ArrowRight', label: '→' },
      { key: 'ArrowDown', label: '↓' },
      { key: 'PageDown', label: 'Page Down' },
      { key: ' ', label: 'Space' },
    ],
    toggle: false,
    icon: 'arrow-right',
    requires: [],
  }),
  control({
    action: 'first',
    group: 'navigate',
    label: 'First slide',
    description: 'Jumps back to the first slide.',
    keys: [{ key: 'Home', label: 'Home' }],
    toggle: false,
    icon: 'arrow-left-to-line',
    requires: [],
  }),
  control({
    action: 'last',
    group: 'navigate',
    label: 'Last slide',
    description: 'Jumps to the last slide.',
    keys: [{ key: 'End', label: 'End' }],
    toggle: false,
    icon: 'arrow-right-to-line',
    requires: [],
  }),
  control({
    action: 'overview',
    group: 'view',
    label: 'Overview of all slides',
    description: 'Shows every slide as a grid, so you can jump straight to any of them.',
    keys: [{ key: 'o', label: 'O' }, ESC],
    toggle: true,
    icon: 'layout-grid',
    requires: [],
  }),
  control({
    action: 'fullscreen',
    group: 'view',
    label: 'Full screen',
    description: 'Fills the whole screen with the slides; press Esc to leave.',
    keys: [{ key: 'f', label: 'F' }],
    toggle: true,
    icon: 'maximize',
    requires: ['fullscreen'],
  }),
  control({
    action: 'fullscreen-exit',
    group: 'view',
    label: 'Leave full screen',
    description: 'Leaves full screen and returns the deck to its normal place on the page.',
    keys: [ESC],
    toggle: false,
    icon: 'minimize',
    requires: ['fullscreen'],
  }),
  control({
    action: 'presenter',
    group: 'present',
    label: 'Presenter view',
    description:
      'Shows your notes, the next slide and timers, in a second window or beside the deck.',
    keys: [
      { key: 's', label: 'S' },
      { key: 'p', label: 'P' },
    ],
    toggle: true,
    icon: 'presentation',
    // Without a popup the presenter opens beside the deck, so it always works.
    requires: [],
  }),
  control({
    action: 'blackout',
    group: 'present',
    label: 'Black out the screen',
    description: 'Turns the screen black to pause the room; press B again or click to come back.',
    keys: [{ key: 'b', label: 'B' }, { key: '.', label: '.' }, ESC],
    toggle: true,
    icon: 'eye-off',
    requires: [],
  }),
  control({
    action: 'laser',
    group: 'present',
    label: 'Laser pointer',
    description: 'Turns the mouse pointer into a bright dot for pointing at the slide.',
    keys: [{ key: 'l', label: 'L' }, ESC],
    toggle: true,
    icon: 'pointer',
    requires: [],
  }),
  control({
    action: 'copy-link',
    group: 'share',
    label: 'Copy link to this slide',
    description: 'Copies a link that opens the deck at this slide and step.',
    keys: [],
    toggle: false,
    icon: 'link',
    requires: ['clipboard'],
  }),
  control({
    action: 'print',
    group: 'share',
    label: 'Print, one slide per page',
    description: 'Prints the deck with one slide per page, or saves it as a PDF.',
    keys: [
      { key: 'p', label: 'Ctrl + P', modifier: 'ctrl' },
      { key: 'p', label: '⌘ + P', modifier: 'meta' },
    ],
    toggle: false,
    icon: 'printer',
    requires: ['print'],
  }),
  control({
    action: 'help',
    group: 'help',
    label: 'Controls and shortcuts',
    description: 'Lists every control in this deck, with its keys.',
    keys: [{ key: '?', label: '?', shift: 'allowed' }, ESC],
    toggle: true,
    icon: 'keyboard',
    requires: [],
  }),
  control({
    action: 'debug',
    group: 'debug',
    label: 'Debug for agents',
    description: "Shows this slide's source, its checks and a reference to paste into an AI agent.",
    keys: [{ key: 'd', label: 'D' }, ESC],
    toggle: true,
    icon: 'bug',
    requires: ['debug'],
  }),
]);

const BY_ACTION: ReadonlyMap<DeckInputAction, DeckControl> = new Map(
  DECK_CONTROLS.map((item) => [item.action, item])
);

/** The control for an action. */
export function deckControlFor(action: DeckInputAction): DeckControl {
  const found = BY_ACTION.get(action);
  if (!found) throw new RangeError(`No deck control for the action "${action}".`);
  return found;
}

/** The controls that work in `env`, in display order. */
export function availableDeckControls(
  env: DeckControlEnvironment = DEFAULT_DECK_CONTROL_ENVIRONMENT
): DeckControl[] {
  return DECK_CONTROLS.filter((item) => item.available(env));
}

/** One help-dialog row: a control's keys, its action and its label. */
export interface DeckKeyBinding {
  keys: readonly string[];
  action: DeckInputAction;
  label: string;
}

/** The key bindings that work in `env`, in display order (controls without keys left out). */
export function deckKeyBindings(
  env: DeckControlEnvironment = DEFAULT_DECK_CONTROL_ENVIRONMENT
): DeckKeyBinding[] {
  return availableDeckControls(env)
    .filter((item) => item.keys.length > 0)
    .map((item) => ({
      keys: item.keys.map((key) => key.label),
      action: item.action,
      label: item.label,
    }));
}

/**
 * Every binding a normal viewer has (`DEFAULT_DECK_CONTROL_ENVIRONMENT`):
 * the help dialog and the docs table. Debug's `D` appears only where debug
 * is on (`deckKeyBindings(env)`).
 */
export const DECK_KEY_BINDINGS: readonly DeckKeyBinding[] = Object.freeze(deckKeyBindings());
