import { setContext } from 'svelte';
import type { PropSteps } from './prop-steps.ts';

/** The same global symbol as `prop-steps.ts`, where designed layouts read it. */
const PROP_STEPS = Symbol.for('@protoyard/decks-ui/prop-steps');

export type { PropSteps } from './prop-steps.ts';

/** Gives the slide's prop steps to the designed layouts below (`getPropSteps`). */
export function setPropSteps(read: PropSteps): void {
  setContext(PROP_STEPS, read);
}
