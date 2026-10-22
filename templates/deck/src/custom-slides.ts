import type { DeckSlide } from '@protoyard/decks/schema';
import type { Component } from 'svelte';

/** Components owned by this generated prototype can be catalogued here by stable slide id. */
export type CustomSlideComponent = Component<{ slide: DeckSlide }>;

/**
 * The shared DeckApp currently renders the data-only layout catalog. Keep this
 * typed registry as the template's extension point for future owned slide hosts.
 */
export const customSlides: Readonly<Record<string, CustomSlideComponent>> = Object.freeze({});
