import type { DeckBackground } from '@protoyard/decks';
import type { DeckStyle } from '@protoyard/decks/schema';
import { getContext, setContext } from 'svelte';
import type { DeckMode, DeckStyleResolution, SlideSurface } from './kit.ts';

/**
 * Reactive deck style for one deck root. The style kit (themes, palette
 * engine, background resolver) is a lazy chunk; until it resolves, slides
 * render on the host's theme. The resolution is scoped: callers put
 * `rootStyle` on their own root element, never on `<html>`, so DevTools and
 * the host page keep their theme.
 */
export class DeckStyleState {
  status = $state<'pending' | 'ready' | 'error'>('pending');
  resolution = $state.raw<DeckStyleResolution | null>(null);
  #kit = $state.raw<typeof import('./kit.ts') | null>(null);
  #surfaces = new Map<string, SlideSurface>();
  #request = 0;

  /** Resolve `style` for `mode`; a newer call wins over a slower older one. */
  async resolve(style: DeckStyle | undefined, mode: DeckMode): Promise<void> {
    const request = ++this.#request;
    try {
      const kit = this.#kit ?? (await import('./kit.ts'));
      const resolution = await kit.resolveDeckLook(style, mode);
      if (request !== this.#request) return;
      this.#surfaces.clear();
      this.#kit = kit;
      this.resolution = resolution;
      this.status = 'ready';
    } catch {
      if (request !== this.#request) return;
      // Keep the host theme: the deck stays readable, only unstyled.
      this.status = 'error';
    }
  }

  get rootStyle(): string | undefined {
    return this.resolution?.rootStyle;
  }

  get warnings(): readonly string[] {
    return this.resolution?.warnings ?? [];
  }

  /** The surface of a slide (its own background, else the deck background), cached per background. */
  surface(
    background: DeckBackground | string | undefined,
    deckBackground: string | undefined
  ): SlideSurface | null {
    const kit = this.#kit;
    const resolution = this.resolution;
    if (!kit || !resolution) return null;
    const value = background ?? deckBackground;
    const key =
      typeof value === 'string' || value === undefined ? (value ?? '') : JSON.stringify(value);
    let surface = this.#surfaces.get(key);
    if (!surface) {
      surface = kit.slideSurface(value, resolution.palette);
      this.#surfaces.set(key, surface);
    }
    return surface;
  }
}

const KEY = Symbol.for('@protoyard/decks-ui/deck-style');

export interface DeckStyleContext {
  state: DeckStyleState;
  /** The deck-level background preset (`deck.style.background`). */
  readonly deckBackground: string | undefined;
}

export function setDeckStyleContext(context: DeckStyleContext): void {
  setContext(KEY, context);
}

/** The nearest deck style, or `null` outside a styled deck (frames then render unstyled). */
export function getDeckStyleContext(): DeckStyleContext | null {
  return getContext<DeckStyleContext | undefined>(KEY) ?? null;
}
