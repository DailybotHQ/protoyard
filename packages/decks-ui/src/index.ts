/*
 * `@protoyard/decks-ui` root: small, eager helpers only. DeckApp, the
 * presenter, print and Deck Studio live on their own subpaths (`./app`,
 * `./presenter`, `./print`, `./studio`) so each loads lazily (ADR-038).
 */
export { type DeckCanvasFit, fitDeckCanvas } from './canvas/fit.ts';
