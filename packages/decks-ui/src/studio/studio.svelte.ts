import { parseDeckHash } from '@protoyard/decks';
import {
  applyDeckEdits,
  compatibleLayouts,
  type DeckStudioEdits,
  type DeckStudioSlideKey,
  type DeckStudioStyleKey,
  deckStudioOptions,
} from '@protoyard/decks/patch';
import type { Deck } from '@protoyard/decks/schema';

type SlideEdit = NonNullable<DeckStudioEdits['slides']>[string];
type HashTarget = Pick<Window, 'addEventListener' | 'removeEventListener' | 'location'>;
type DeckPatch = ReturnType<typeof applyDeckEdits>['patch'];

export interface DeckStudioOptions {
  /**
   * JSON Pointer of the deck inside the file the patch is for: `/deck` for a
   * deck blueprint (`{ "kind": "deck", "deck": { … } }`). Default: the patch
   * targets the deck document itself.
   */
  pointer?: '' | `/${string}`;
}

/** Re-roots every operation of a deck patch under `pointer`. */
export function prefixDeckPatch(
  patch: DeckPatch,
  pointer: DeckStudioOptions['pointer'] = ''
): DeckPatch {
  if (!pointer) return patch;
  return patch.map((op) => ({ ...op, path: `${pointer}${op.path}` }));
}

/**
 * Deck Studio state: the source deck, the edits made so far, and everything
 * derived from them — the live `preview` deck (hand it to `DeckApp`), the RFC
 * 6902 `patch` that turns the source JSON into that preview, and any schema
 * `issues`. Edits stay in memory: nothing is written to tables or files.
 */
export function createDeckStudio(sourceDeck: Deck, studioOptions: DeckStudioOptions = {}) {
  const source = structuredClone(sourceDeck);
  const options = deckStudioOptions();
  let edits = $state<DeckStudioEdits>({ style: {}, slides: {} });
  let slideId = $state(source.slides[0]?.id ?? '');

  const result = $derived(applyDeckEdits(source, edits));
  const preview = $derived(result.ok ? result.deck : source);
  const patch = $derived(prefixDeckPatch(result.patch, studioOptions.pointer));
  const patchJson = $derived(JSON.stringify(patch, null, 2));
  const slide = $derived(preview.slides.find((item) => item.id === slideId));
  const layoutChoices = $derived(slide ? compatibleLayouts(slide) : []);

  const selectSlide = (id: string) => {
    if (source.slides.some((item) => item.id === id)) slideId = id;
  };

  return {
    source,
    options,
    get edits() {
      return edits;
    },
    /** The slide the slide controls edit (follows the deck's `#/<id>/<step>` hash). */
    get slideId() {
      return slideId;
    },
    /** The edited deck, or the source while the edits do not validate. */
    get preview() {
      return preview;
    },
    /** The RFC 6902 patch for the source file (rooted at `pointer`). */
    get patch() {
      return patch;
    },
    get patchJson() {
      return patchJson;
    },
    get issues() {
      return result.ok ? [] : result.issues;
    },
    get slide() {
      return slide;
    },
    /** Layouts the current slide's content already fits, so switching never drops content. */
    get layoutChoices() {
      return layoutChoices;
    },
    setStyle<K extends DeckStudioStyleKey>(key: K, value: Deck['style'][K] | null): void {
      edits = { ...edits, style: { ...edits.style, [key]: value } };
    },
    setSlide<K extends DeckStudioSlideKey>(key: K, value: SlideEdit[K]): void {
      if (!slideId) return;
      const slides = { ...edits.slides };
      slides[slideId] = { ...slides[slideId], [key]: value };
      edits = { ...edits, slides };
    },
    selectSlide,
    reset(): void {
      edits = { style: {}, slides: {} };
    },
    /** Follows the deck hash so the slide controls edit what is on screen. Returns a stop function. */
    followHash(target: HashTarget = window): () => void {
      const sync = () => {
        const location = parseDeckHash(target.location.hash);
        if (location) selectSlide(location.slideId);
      };
      sync();
      target.addEventListener('hashchange', sync);
      return () => target.removeEventListener('hashchange', sync);
    },
  };
}

export type DeckStudio = ReturnType<typeof createDeckStudio>;
