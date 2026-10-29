/**
 * Every deck control, described once. The registry is the deck engine's
 * (`DECK_CONTROLS` in `@texuli/deck/engine`): the `@texuli/slides` stage's
 * toolbar, tooltips, help dialog and key handling read it. This module gives
 * it Protoyard's shape for `protoyard deck capabilities`, the docs tables and
 * agents: an `id`, English `label` and `description` (the engine's message
 * catalog) and an `icon` id (Lucide names).
 *
 * Data only: no DOM, no Svelte, no icons.
 */
import {
  DECK_CONTROL_CAPABILITIES,
  DECK_CONTROL_GROUPS,
  DECK_MESSAGES,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckAction,
  type DeckControlCapability,
  type DeckControlEnvironment,
  type DeckControlGroup,
  type DeckControlKey,
  type DeckMessageKey,
  DECK_CONTROLS as ENGINE_CONTROLS,
} from '@texuli/deck/engine';

export {
  DECK_CONTROL_CAPABILITIES,
  DECK_CONTROL_GROUPS,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControlCapability,
  type DeckControlEnvironment,
  type DeckControlGroup,
  type DeckControlKey,
};

/** What the deck does (`DeckAction` in the engine). */
export type DeckInputAction = DeckAction;

/** Icon ids (Lucide names). The registry stays icon-free; a renderer maps each id. */
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

const ICONS: Readonly<Record<DeckInputAction, DeckControlIcon>> = Object.freeze({
  next: 'arrow-right',
  prev: 'arrow-left',
  first: 'arrow-left-to-line',
  last: 'arrow-right-to-line',
  overview: 'layout-grid',
  presenter: 'presentation',
  fullscreen: 'maximize',
  'fullscreen-exit': 'minimize',
  blackout: 'eye-off',
  laser: 'pointer',
  help: 'keyboard',
  print: 'printer',
  'copy-link': 'link',
  debug: 'bug',
  jump: 'list',
});

export interface DeckControl {
  /** Stable id for hooks and docs, the same as the action. */
  id: DeckInputAction;
  action: DeckInputAction;
  group: DeckControlGroup;
  /** A short name for the button and the help dialog (the engine's English message). */
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

const message = (key: string): string =>
  (DECK_MESSAGES as Readonly<Record<string, string>>)[key as DeckMessageKey] ?? key;

/** Every deck control, in display order (the engine registry, in Protoyard's shape). */
export const DECK_CONTROLS: readonly DeckControl[] = Object.freeze(
  ENGINE_CONTROLS.map((control) =>
    Object.freeze({
      id: control.action,
      action: control.action,
      group: control.group,
      label: message(control.labelKey),
      description: message(control.descriptionKey),
      keys: control.keys,
      toggle: control.toggle,
      icon: ICONS[control.action],
      requires: control.requires,
      available: control.available,
    })
  )
);

/** The control for an action. */
export function deckControlFor(action: DeckInputAction): DeckControl {
  const found = DECK_CONTROLS.find((control) => control.action === action);
  if (!found) throw new RangeError(`No deck control for "${action}".`);
  return found;
}

/** The controls this environment can run, in display order. */
export function availableDeckControls(
  env: DeckControlEnvironment = DEFAULT_DECK_CONTROL_ENVIRONMENT
): DeckControl[] {
  return DECK_CONTROLS.filter((control) => control.available(env));
}

/** One row of the keys table: what a person presses, and what it does. */
export interface DeckKeyBinding {
  keys: readonly string[];
  action: DeckInputAction;
  label: string;
}

/** Key rows for the controls available in `env` (controls without keys are buttons only). */
export function deckKeyBindings(
  env: DeckControlEnvironment = DEFAULT_DECK_CONTROL_ENVIRONMENT
): DeckKeyBinding[] {
  return availableDeckControls(env)
    .filter((control) => control.keys.length > 0)
    .map((control) => ({
      keys: control.keys.map((key) => key.label),
      action: control.action,
      label: control.label,
    }));
}

/** Default-environment key bindings (debug omitted). */
export const DECK_KEY_BINDINGS: readonly DeckKeyBinding[] = Object.freeze(deckKeyBindings());
