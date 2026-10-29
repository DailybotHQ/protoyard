/**
 * `@protoyard/decks-ui/app` — DeckApp, the one deck component that the
 * player's deck entry and generated deck prototypes both mount (ADR-038).
 */

export type {
  CustomSlideComponent,
  CustomSlideLoader,
  CustomSlideProps,
  CustomSlideRegistry,
} from '../layouts/custom-slides.ts';
export { default as DeckApp } from './DeckApp.svelte';
