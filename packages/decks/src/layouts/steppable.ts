/**
 * Where a catalog layout reveals a step marker (`''` the whole body, a key a
 * nested object, `key.*` each list item): the deck model's steppable paths.
 * A light module (no schemas), so lint and renderers can import it.
 */
import {
  isSteppablePath,
  layoutSteppablePaths,
  DECK_LAYOUT_IDS as MODEL_LAYOUT_IDS,
} from '@texuli/deck/model';
import { slideFragments, slideSteps } from '../motion/index.ts';
import type { DeckSlide } from '../schema/index.ts';

type DeckLayoutId = (typeof MODEL_LAYOUT_IDS)[number];

/** Where each layout reveals a step marker in its props (`''`, `image`, `cards.*`). */
export const DECK_LAYOUT_STEPPABLE: Readonly<Record<DeckLayoutId, readonly string[]>> =
  /* @__PURE__ */ Object.freeze(
    Object.fromEntries(MODEL_LAYOUT_IDS.map((id) => [id, layoutSteppablePaths(id)])) as Record<
      DeckLayoutId,
      readonly string[]
    >
  );

/** Whether `layout` reveals a marker at `path` (relative to `props`). */
export function isSteppablePropPath(layout: string, path: readonly (string | number)[]): boolean {
  return isSteppablePath(layout, path);
}

/**
 * Step markers in a catalog slide's props that its layout does not reveal,
 * as paths relative to `props` (`[['spec', 'series', 0]]`): they still add a
 * step, but nothing hides. Empty for free slides.
 */
export function stepMarkersOutsideLayout(slide: DeckSlide): (string | number)[][] {
  if (!('props' in slide)) return [];
  return slideFragments(slideSteps(slide))
    .filter((fragment) => fragment.kind === 'prop')
    .map((fragment) => [...fragment.path.slice(1)])
    .filter((path) => !isSteppablePropPath(slide.layout, path));
}
