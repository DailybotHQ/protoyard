/**
 * Presenting tools for DeckApp: blackout, full screen, laser pointer, copy a
 * slide reference and the keyboard help. Part of the deck entry (small); the
 * help dialog and laser render only while open.
 */
export { default as BlackoutScreen } from './BlackoutScreen.svelte';
export { copyText } from './clipboard.ts';
export { default as DeckToolbar } from './DeckToolbar.svelte';
export {
  fullscreenAvailable,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from './fullscreen.ts';
export { default as KeyboardHelp } from './KeyboardHelp.svelte';
export { default as LaserPointer } from './LaserPointer.svelte';
export { cleanReferenceText, type SlideReferenceInput, slideReference } from './reference.ts';
export type { DeckToolAction } from './types.ts';
