import { type FragmentEffect, fragmentPhase, slideFragments, slideSteps } from '@protoyard/decks';
import type { DeckSlide } from '@protoyard/decks/schema';

/**
 * The step model of one slide, from the engine's `slideSteps`: authors write
 * any step numbers (a block's `step`, code highlights, catalog code props),
 * and the slide plays them densely as steps 1, 2, 3… after its initial state.
 */
export interface SlideStepModel {
  /** Advances on the slide; positions are 0 … count. */
  count: number;
  /** The dense step an authored step number plays at (0 for the initial state). */
  dense(authored: number): number;
  /** A catalog prop fragment by its path inside `props` (`['cards', 1]`), if any. */
  prop(path: readonly (string | number)[]): { index: number; effect: FragmentEffect } | null;
}

export function slideStepModel(slide: DeckSlide): SlideStepModel {
  const steps = slideSteps(slide);
  const byAuthored = new Map<number, number>();
  const props = new Map<string, { index: number; effect: FragmentEffect }>();
  for (const fragment of slideFragments(steps)) {
    if (!byAuthored.has(fragment.authored)) byAuthored.set(fragment.authored, fragment.index);
    if (fragment.source.kind === 'prop' && fragment.source.path[0] === 'props') {
      props.set(JSON.stringify(fragment.source.path.slice(1)), {
        index: fragment.index,
        effect: fragment.effect,
      });
    }
  }
  const authored = [...byAuthored.keys()].filter((n) => n > 0).sort((a, b) => a - b);
  return {
    count: steps.count,
    dense(value: number): number {
      if (!Number.isFinite(value) || value <= 0) return 0;
      const known = byAuthored.get(value);
      if (known !== undefined) return known;
      // Not seen by the engine (it should be): play it after every lower authored step.
      const rank = authored.filter((n) => n < value).length + 1;
      return Math.min(Math.max(1, steps.count), rank);
    },
    prop(path) {
      return props.get(JSON.stringify(path)) ?? null;
    },
  };
}

/** The block contract's `reveal` vocabulary in fragment terms (`fade` is a plain `in`). */
const REVEAL_EFFECT: Readonly<Record<string, FragmentEffect>> = {
  fade: 'in',
  'fade-up': 'fade-up',
  grow: 'grow',
  highlight: 'highlight',
  strike: 'strike',
};

/** How a block looks at `current`, or `null` when it is part of the initial state. */
export function blockFragment(
  model: SlideStepModel,
  block: { step?: number; reveal?: string },
  current: number
): { visible: boolean; active: boolean } | null {
  if (typeof block.step !== 'number' || block.step <= 0) return null;
  const effect = REVEAL_EFFECT[block.reveal ?? 'fade'] ?? 'in';
  return fragmentPhase({ index: model.dense(block.step), effect }, current);
}

/**
 * The code highlight shown at `current`: highlight `i` plays at the block's
 * step plus `i` (authored), so the latest one reached wins; −1 before the first.
 */
export function codeHighlightIndex(
  model: SlideStepModel,
  block: { step?: number; highlights?: readonly string[] },
  current: number
): number {
  const highlights = block.highlights ?? [];
  const base = typeof block.step === 'number' && block.step > 0 ? block.step : 0;
  let shown = -1;
  highlights.forEach((_, i) => {
    if (model.dense(base + i) <= current) shown = i;
  });
  return shown;
}

/** Attributes a designed layout spreads on one stepped item. */
export type PropFragmentAttributes = Record<string, string | boolean | undefined>;

/**
 * Attributes for a stepped catalog item at `current`, or `{}` when the item is
 * not stepped. The slide frame's CSS hides `data-py-fragment="hidden"` items
 * while keeping their space, so layout classes stay untouched.
 */
export function propFragmentAttributes(
  model: SlideStepModel,
  path: readonly (string | number)[],
  current: number
): PropFragmentAttributes {
  const fragment = model.prop(path);
  if (!fragment) return {};
  const phase = fragmentPhase(fragment, current);
  return {
    'data-py-fragment-kind': 'prop',
    'data-py-fragment': phase.visible ? 'shown' : 'hidden',
    'data-py-fragment-active': phase.active ? 'true' : undefined,
    'data-py-fragment-reveal': fragment.effect,
    'aria-hidden': phase.visible ? undefined : 'true',
    inert: !phase.visible,
  };
}
