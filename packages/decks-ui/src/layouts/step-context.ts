import { getContext, setContext } from 'svelte';
import type { PropFragmentAttributes } from './steps.ts';

const PROP_STEPS = Symbol.for('@protoyard/decks-ui/prop-steps');

/** Reads a catalog item's step attributes from the nearest slide step host. */
export type PropSteps = (path: readonly (string | number)[]) => PropFragmentAttributes;

const NONE: PropSteps = () => ({});

export function setPropSteps(read: PropSteps): void {
  setContext(PROP_STEPS, read);
}

/**
 * For designed layouts: spread the result on a stepped item
 * (`<li {...steps(['cards', index])}>`). Outside a deck slide it is a no-op.
 */
export function getPropSteps(): PropSteps {
  return getContext<PropSteps>(PROP_STEPS) ?? NONE;
}
