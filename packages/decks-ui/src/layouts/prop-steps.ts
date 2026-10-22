import { getContext } from 'svelte';
import type { PropFragmentAttributes } from './steps.ts';

/**
 * The reading side of a slide's prop steps, for designed layouts. It is its
 * own module, apart from `step-context.ts` (which the DeckApp entry loads for
 * `SlideStepHost`): when every lazy layout family imports a module that lives
 * in the entry chunk, the bundler splits the Svelte runtime into a shared chunk,
 * which measured +841 B gzip of initial JavaScript. Both modules use the same
 * global symbol, so a host's `setPropSteps` reaches every reader.
 */
const PROP_STEPS = Symbol.for('@protoyard/decks-ui/prop-steps');

/** Reads a catalog item's step attributes from the nearest slide step host. */
export type PropSteps = (path: readonly (string | number)[]) => PropFragmentAttributes;

const NONE: PropSteps = () => ({});

/**
 * For designed layouts: spread the result on a stepped item
 * (`<li {...steps(['cards', index])}>`). Outside a deck slide it is a no-op.
 */
export function getPropSteps(): PropSteps {
  return getContext<PropSteps>(PROP_STEPS) ?? NONE;
}
