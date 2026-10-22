import { slideFragments, slideSteps } from '../motion/steps.ts';
import type { DeckSlide } from '../schema/index.ts';
import type { DeckLayoutId } from './catalog.ts';

/**
 * Where a catalog layout reveals a step marker. A marker is an object in
 * `props` with an integer `step` (and an optional `fragment` or `reveal`). The
 * designed renderers hide the element drawn from that object until its step:
 *
 * - `''` is the props object itself: the whole slide body (a `big-stat`, a
 *   `quote`, a hero), with the background staying in place;
 * - a key is a nested object (`image`, `video`, `code`, `cta`, `spec`,
 *   `left`, `right`);
 * - `key.*` is each item of a list (`cards.*`, `rows.*`, `people.*`…).
 *
 * Markers anywhere else (inside a chart spec's series, say) still count as a
 * step, but no element hides. `stepMarkersOutsideLayout` lists them so lint
 * and agents can say so. A free slide reveals its blocks through each block's
 * `step`, so it has no prop paths.
 */
export const DECK_LAYOUT_STEPPABLE: Readonly<Record<DeckLayoutId, readonly string[]>> =
  /* @__PURE__ */ Object.freeze({
    'title-hero': [''],
    'section-divider': [''],
    'two-column-split': ['', 'left', 'right'],
    'three-column-cards': ['', 'cards.*'],
    'image-left': ['', 'image'],
    'image-right': ['', 'image'],
    'image-centered': ['', 'image'],
    'image-full-bleed': ['', 'image'],
    quote: [''],
    'code-with-callout': ['', 'code'],
    'big-stat': [''],
    'comparison-table': ['', 'rows.*'],
    'process-steps': ['', 'steps.*'],
    timeline: ['', 'events.*'],
    'team-avatars': ['', 'people.*'],
    'closing-cta': ['', 'cta'],
    'video-centered': ['', 'video'],
    'video-left': ['', 'video'],
    'video-right': ['', 'video'],
    chart: ['', 'spec'],
    free: [],
  });

/** The pattern of a path inside `props`: `''`, `cta`, `cards.*`. */
export function steppablePattern(path: readonly (string | number)[]): string {
  return path.map((part) => (typeof part === 'number' ? '*' : part)).join('.');
}

/** Whether `layout` reveals a marker at `path` (relative to `props`). */
export function isSteppablePropPath(layout: string, path: readonly (string | number)[]): boolean {
  const allowed = (DECK_LAYOUT_STEPPABLE as Readonly<Record<string, readonly string[]>>)[layout];
  return allowed?.includes(steppablePattern(path)) ?? false;
}

/**
 * Step markers in a catalog slide's props that its layout does not reveal,
 * as paths relative to `props` (`[['spec', 'series', 0]]`). Empty for free
 * slides and for slides whose markers all sit on revealed props.
 */
export function stepMarkersOutsideLayout(slide: DeckSlide): (string | number)[][] {
  if (!('props' in slide)) return [];
  return slideFragments(slideSteps(slide))
    .filter((fragment) => fragment.source.kind === 'prop')
    .map((fragment) => fragment.source.path.slice(1))
    .filter((path) => !isSteppablePropPath(slide.layout, path));
}
