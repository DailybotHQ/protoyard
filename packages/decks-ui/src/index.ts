/*
 * `@protoyard/decks-ui` root: small, eager helpers only. DeckApp, Deck Studio
 * and the debug panel live on their own subpaths (`./app`, `./studio`,
 * `./debug`) so each loads lazily (ADR-038). The stage itself is
 * `@texuli/slides` (Texuli ADR-009).
 */
export { type CanvasFit as DeckCanvasFit, fitDeckCanvas } from '@texuli/deck/engine';
