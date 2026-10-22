/**
 * Presenting tools for DeckApp: blackout, full screen, laser pointer, copy a
 * slide reference and the keyboard help. Part of the deck entry (small); the
 * help dialog and laser render only while open.
 */
export { default as BlackoutScreen } from './BlackoutScreen.svelte';
export { default as ChromeToast, TOAST_DURATION_MS, type ToastTone } from './ChromeToast.svelte';
export { default as ChromeTooltip } from './ChromeTooltip.svelte';
export { copyText } from './clipboard.ts';
export { default as DeckToolbar } from './DeckToolbar.svelte';
export {
  claimFirstRunHint,
  default as FirstRunHint,
  FIRST_RUN_HINT_MS,
  firstRunHintAllowed,
  firstRunHintKey,
  firstRunHintSeen,
} from './FirstRunHint.svelte';
export { default as FullscreenOverlay } from './FullscreenOverlay.svelte';
export {
  createDeckFullscreen,
  type DeckFullscreen,
  type DeckFullscreenMode,
  FULLSCREEN_OVERLAY_IDLE_MS,
  FULLSCREEN_WINDOW_DESCRIPTION,
  fullscreenAvailable,
  isFullscreen,
  onFullscreenChange,
  toggleFullscreen,
} from './fullscreen.ts';
export { default as KeyboardHelp } from './KeyboardHelp.svelte';
export { default as LaserPointer } from './LaserPointer.svelte';
export { cleanReferenceText, type SlideReferenceInput, slideReference } from './reference.ts';
export {
  controlTooltip,
  createDeckTooltip,
  createTooltipController,
  type DeckTooltip,
  type DeckTooltipView,
  placeTooltip,
  shortcutText,
  TOOLTIP_HOVER_DELAY_MS,
  TOOLTIP_LINGER_MS,
  TOOLTIP_LONG_PRESS_MS,
  type TooltipContent,
  type TooltipController,
} from './tooltip.ts';
export type { DeckToolAction } from './types.ts';
