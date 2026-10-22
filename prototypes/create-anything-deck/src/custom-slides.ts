import type { CustomSlideRegistry } from '@protoyard/decks-ui/app';

/**
 * This deck's own slide components, for `layout: "custom"` slides. Each id
 * loads its component lazily, the first time its slide shows. A component
 * receives `{ slide, step, stepCount, data }` and nothing else of the deck.
 * This file is yours: `protoyard generate` never rewrites it.
 */
export const customSlides: CustomSlideRegistry = Object.freeze({
  'pricing-configurator': () => import('./slides/PricingConfigurator.svelte'),
});
