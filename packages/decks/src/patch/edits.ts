import { BUILTIN_THEMES, FONT_CATALOG, THEME_LIBRARY_META } from '@protoyard/themes';
import { DECK_BACKGROUND_PRESET_IDS } from '../backgrounds/resolve.ts';
import { DECK_ASPECTS } from '../canvas.ts';
import { DECK_LAYOUTS } from '../layouts/catalog.ts';
import { type Deck, type DeckSlide, type DeckStyle, safeParseDeck } from '../schema/index.ts';
import { applyDeckPatch, type DeckPatchOperation } from './json-patch.ts';

/**
 * Deck Studio's edit model (ADR-038): what the studio can change, applied to
 * a source deck as a live preview and exported as an RFC 6902 patch that
 * turns the source JSON into exactly that preview. Pure data and functions;
 * the Svelte panel lives in `@protoyard/decks-ui/studio`.
 */

/** Style fields the studio edits. */
export const DECK_STUDIO_STYLE_KEYS = [
  'theme',
  'paletteSeed',
  'fontPair',
  'aspect',
  'motion',
  'background',
  'slideNumbers',
  'progress',
] as const;
export type DeckStudioStyleKey = (typeof DECK_STUDIO_STYLE_KEYS)[number];

/** Slide fields the studio edits. */
export const DECK_STUDIO_SLIDE_KEYS = ['layout', 'background', 'transition', 'hidden'] as const;
export type DeckStudioSlideKey = (typeof DECK_STUDIO_SLIDE_KEYS)[number];

type Transition = NonNullable<DeckSlide['transition']>;

/** `null` removes a field (back to the default); `undefined` leaves it alone. */
export interface DeckStudioEdits {
  style?: { [K in DeckStudioStyleKey]?: DeckStyle[K] | null };
  slides?: Record<
    string,
    {
      layout?: string;
      background?: string | null;
      transition?: Transition | null;
      hidden?: boolean | null;
    }
  >;
}

/** Choices the panel offers, from the same registries the renderer resolves. */
export function deckStudioOptions() {
  return {
    themes: [
      ...BUILTIN_THEMES.map((theme) => ({ id: theme.id, label: theme.name })),
      ...THEME_LIBRARY_META.map((meta) => ({ id: meta.id, label: meta.name })),
    ],
    fontPairs: FONT_CATALOG.map((pair) => ({ id: pair.id, label: pair.label })),
    aspects: [...DECK_ASPECTS],
    motions: ['full', 'subtle', 'none'] as const,
    backgrounds: [...DECK_BACKGROUND_PRESET_IDS],
    progress: ['none', 'top', 'bottom'] as const,
    transitions: ['none', 'fade', 'slide', 'zoom', 'morph'] as const,
  };
}

/**
 * Catalog layouts this slide's props already satisfy, so switching layout
 * never drops content. A free slide stays free. Checked with the deck schema
 * itself (catalog, props and step markers).
 */
export function compatibleLayouts(slide: DeckSlide): string[] {
  if (!('props' in slide)) return ['free'];
  return DECK_LAYOUTS.filter((layout) => layout.id !== 'free')
    .map((layout) => layout.id)
    .filter((id) => safeParseDeck({ style: {}, slides: [{ ...slide, layout: id }] }).success);
}

function setOrRemove(
  ops: DeckPatchOperation[],
  base: string,
  record: Record<string, unknown>,
  key: string,
  value: unknown
): void {
  if (value === undefined) return;
  const path = `${base}/${key}`;
  // A key holding `undefined` is absent once serialized, so it does not exist for a patch.
  const exists = Object.hasOwn(record, key) && record[key] !== undefined;
  if (value === null) {
    if (exists) ops.push({ op: 'remove', path });
    return;
  }
  if (!exists) ops.push({ op: 'add', path, value });
  else if (JSON.stringify(record[key]) !== JSON.stringify(value))
    ops.push({ op: 'replace', path, value });
}

/**
 * The RFC 6902 patch that turns `source` into the edited deck. Each slide
 * edit starts with a `test` on the slide id, so the patch refuses to apply to
 * a deck whose slides moved. Choosing a theme removes a palette seed and the
 * other way round (a seed wins when both are present).
 */
export function deckEditsToPatch(source: Deck, edits: DeckStudioEdits): DeckPatchOperation[] {
  const ops: DeckPatchOperation[] = [];
  const style = { ...(edits.style ?? {}) };
  if (style.theme !== undefined && style.theme !== null && style.paletteSeed === undefined)
    style.paletteSeed = null;
  if (style.paletteSeed !== undefined && style.paletteSeed !== null && style.theme === undefined)
    style.theme = null;
  for (const key of DECK_STUDIO_STYLE_KEYS) {
    setOrRemove(ops, '/style', source.style as Record<string, unknown>, key, style[key]);
  }
  for (const [id, slideEdit] of Object.entries(edits.slides ?? {})) {
    const index = source.slides.findIndex((slide) => slide.id === id);
    if (index < 0) throw new RangeError(`No slide "${id}" in the source deck`);
    const slide = source.slides[index] as Record<string, unknown>;
    const slideOps: DeckPatchOperation[] = [];
    for (const key of DECK_STUDIO_SLIDE_KEYS) {
      const value = slideEdit[key];
      if (key === 'layout' && (value === null || slide.layout === 'free' || value === 'free'))
        continue;
      setOrRemove(
        slideOps,
        `/slides/${index}`,
        slide,
        key,
        key === 'hidden' && value === false ? null : value
      );
    }
    if (slideOps.length > 0)
      ops.push({ op: 'test', path: `/slides/${index}/id`, value: id }, ...slideOps);
  }
  return ops;
}

export type DeckStudioResult =
  | { ok: true; deck: Deck; patch: DeckPatchOperation[] }
  | { ok: false; patch: DeckPatchOperation[]; issues: { jsonPath: string; message: string }[] };

/** Applies the edits through their patch and validates the result with `DeckSchema`. */
export function applyDeckEdits(source: Deck, edits: DeckStudioEdits): DeckStudioResult {
  const patch = deckEditsToPatch(source, edits);
  const next = applyDeckPatch(source, patch);
  const parsed = safeParseDeck(next);
  if (parsed.success) return { ok: true, deck: parsed.deck, patch };
  return {
    ok: false,
    patch,
    issues: parsed.issues.map((issue) => ({ jsonPath: issue.jsonPath, message: issue.message })),
  };
}
