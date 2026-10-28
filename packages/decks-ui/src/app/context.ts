import type { FreeSlide } from '@protoyard/decks/schema';
import { getContext, setContext } from 'svelte';
import type { CustomSlideRegistry } from '../layouts/custom-slides.ts';

/**
 * What DeckApp hands its slide renderers through Svelte context (the
 * `@texuli/slides` stage passes renderers only the slide and its render
 * context): the generated deck's custom slide registry and its free slides.
 */
export interface DeckHostContext {
  readonly customSlides: CustomSlideRegistry | undefined;
  /** The deck's free slides by id (the stage sees them as host slides, see `stage-deck.ts`). */
  readonly freeSlides: ReadonlyMap<string, FreeSlide>;
}

const KEY = Symbol.for('@protoyard/decks-ui/host');

export function setDeckHostContext(context: DeckHostContext): void {
  setContext(KEY, context);
}

export function getDeckHostContext(): DeckHostContext {
  return (
    getContext<DeckHostContext | undefined>(KEY) ?? {
      customSlides: undefined,
      freeSlides: new Map(),
    }
  );
}
