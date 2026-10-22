import type { CustomSlideRegistry } from '@protoyard/decks-ui/app';

/**
 * This deck's own slide components, for `layout: "custom"` slides:
 *
 *   { "id": "pricing", "layout": "custom",
 *     "props": { "component": "pricing-configurator", "data": { "seats": 25 } } }
 *
 * Register each component id with a lazy import, so its code loads only when
 * the slide shows:
 *
 *   'pricing-configurator': () => import('./slides/PricingConfigurator.svelte'),
 *
 * A component receives `{ slide, step, stepCount, data }` (`CustomSlideProps`),
 * never the whole deck or the runtime's services unless you pass them. The
 * player has no owned code and shows a labelled placeholder for these slides.
 * This file is yours: `protoyard generate` never rewrites it.
 */
export const customSlides: CustomSlideRegistry = Object.freeze({});
