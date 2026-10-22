/**
 * Pure helpers for AdaptiveOverlay presentation selection.
 * Host/container width drives the default; `force` always wins.
 */

/** How the overlay is presented. */
export type AdaptiveOverlayPresentation = 'sheet' | 'dialog' | 'side-panel';

/** Desktop target when the host is wide enough for a non-sheet surface. */
export type AdaptiveOverlayWideKind = 'dialog' | 'side-panel';

/** Forced presentation, or `auto` to measure the host. */
export type AdaptiveOverlayMode = AdaptiveOverlayPresentation | 'auto';

/** Width at or above which the wide kind is used (CSS px). */
export const ADAPTIVE_OVERLAY_BREAKPOINT = 768;

export interface ResolveAdaptiveOverlayInput {
  /** Measured host/container width in CSS px. */
  width: number;
  /** Desktop presentation when wide. Default `dialog`. */
  kind?: AdaptiveOverlayWideKind;
  /** Force a presentation regardless of width. Default `auto`. */
  force?: AdaptiveOverlayMode;
  /** Breakpoint in CSS px. Default {@link ADAPTIVE_OVERLAY_BREAKPOINT}. */
  breakpoint?: number;
}

/**
 * Pick sheet / dialog / side-panel from host width and optional force.
 * Narrow hosts always get a sheet unless `force` names another presentation.
 */
export function resolveAdaptiveOverlayPresentation(
  input: ResolveAdaptiveOverlayInput
): AdaptiveOverlayPresentation {
  const force = input.force ?? 'auto';
  if (force !== 'auto') return force;
  const breakpoint = input.breakpoint ?? ADAPTIVE_OVERLAY_BREAKPOINT;
  const kind = input.kind ?? 'dialog';
  if (!(input.width >= breakpoint)) return 'sheet';
  return kind;
}
