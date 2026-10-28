/**
 * `@protoyard/decks` input: the deck engine's controls registry and input
 * decisions (`@texuli/deck/engine`), with the registry in Protoyard's shape.
 */

export {
  DECK_CHROME_ATTRIBUTE,
  DECK_ESCAPE_ORDER,
  DECK_INPUT_ACTIONS,
  DECK_SWIPE_AXIS_RATIO,
  DECK_SWIPE_MAX_DURATION_MS,
  DECK_SWIPE_MIN_DISTANCE,
  type DeckInputEvent,
  type DeckInputState,
  type DeckInputTarget,
  decideDeckInput,
  inputPathFrom,
} from '@texuli/deck/engine';
export {
  availableDeckControls,
  DECK_CONTROL_CAPABILITIES,
  DECK_CONTROL_GROUPS,
  DECK_CONTROL_ICONS,
  DECK_CONTROLS,
  DECK_KEY_BINDINGS,
  DEFAULT_DECK_CONTROL_ENVIRONMENT,
  type DeckControl,
  type DeckControlCapability,
  type DeckControlEnvironment,
  type DeckControlGroup,
  type DeckControlIcon,
  type DeckControlKey,
  type DeckInputAction,
  type DeckKeyBinding,
  deckControlFor,
  deckKeyBindings,
} from './controls.ts';

/**
 * The marker `@protoyard/blocks-ui` puts on blocks with their own controls
 * (poll, quiz, form, map, embed…). DeckApp's free-slide renderer adds the
 * stage's `data-tx-deck-interactive` around them, so their clicks and keys
 * never move the deck.
 */
export const DECK_INTERACTIVE_ATTRIBUTE = 'data-py-deck-interactive';
