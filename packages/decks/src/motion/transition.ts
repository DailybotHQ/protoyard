import type { DeckSlide, DeckStyle } from '../schema/index.ts';
import type { FragmentEffect } from './steps.ts';

/**
 * Slide transitions and fragment motion under a motion level.
 *
 * - The deck's `style.motion` (`full` | `subtle` | `none`) sets the ceiling.
 * - The viewer's reduced-motion preference (OS setting or the prototype's own
 *   toggle) can only lower it, never raise it: with it, every transition is
 *   `none` or a short fade, and moving fragments become plain fades.
 * - Durations are opacity/transform only and never exceed 400 ms.
 */

export const DECK_TRANSITIONS = ['none', 'fade', 'slide', 'zoom', 'morph'] as const;
export type DeckTransition = (typeof DECK_TRANSITIONS)[number];
export type MotionLevel = NonNullable<DeckStyle['motion']>;

export const MAX_MOTION_MS = 400;
export const DEFAULT_TRANSITION: DeckTransition = 'fade';
export const DEFAULT_MOTION: MotionLevel = 'full';

const FULL_MS: Record<DeckTransition, number> = {
  none: 0,
  fade: 300,
  slide: 400,
  zoom: 350,
  morph: 400,
};
/** A reduced-motion fade: short enough to read as a cut, long enough not to flash. */
export const REDUCED_FADE_MS = 150;
const SUBTLE_SCALE = 0.6;

export interface MotionContext {
  /** From the OS (`prefers-reduced-motion`) or the prototype's reduced-motion toggle. */
  prefersReducedMotion?: boolean;
}

export type TransitionReason =
  | 'motion-none'
  | 'reduced-motion'
  | 'subtle'
  | 'slide-override'
  | 'deck-default'
  | 'engine-default';

export interface ResolvedTransition {
  transition: DeckTransition;
  durationMs: number;
  /** The level after the viewer's preference was applied. */
  motion: MotionLevel;
  /** What the author asked for before the motion level applied. */
  requested: DeckTransition;
  /** Why the result is what it is, for DevTools and tests. */
  reason: TransitionReason;
}

/** The effective motion level: the deck's level, lowered (never raised) by reduced motion. */
export function effectiveMotion(
  style: Pick<DeckStyle, 'motion'>,
  context: MotionContext = {}
): MotionLevel {
  const level = style.motion ?? DEFAULT_MOTION;
  if (level === 'none') return 'none';
  return context.prefersReducedMotion ? 'subtle' : level;
}

function clampMs(ms: number): number {
  return Math.max(0, Math.min(MAX_MOTION_MS, Math.round(ms)));
}

/** The transition into `slide`, from the slide override, the deck default and the motion level. */
export function resolveSlideTransition(
  style: Pick<DeckStyle, 'motion' | 'transition'>,
  slide: Pick<DeckSlide, 'transition'> | undefined,
  context: MotionContext = {}
): ResolvedTransition {
  const requested = slide?.transition ?? style.transition ?? DEFAULT_TRANSITION;
  const source: TransitionReason = slide?.transition
    ? 'slide-override'
    : style.transition
      ? 'deck-default'
      : 'engine-default';
  const motion = effectiveMotion(style, context);

  if (motion === 'none' || requested === 'none') {
    return {
      transition: 'none',
      durationMs: 0,
      motion,
      requested,
      reason: motion === 'none' ? 'motion-none' : source,
    };
  }
  if (context.prefersReducedMotion) {
    return {
      transition: 'fade',
      durationMs: REDUCED_FADE_MS,
      motion,
      requested,
      reason: 'reduced-motion',
    };
  }
  if (motion === 'subtle') {
    // Subtle keeps direction (slide, morph) but drops scaling and shortens everything.
    const transition = requested === 'zoom' ? 'fade' : requested;
    return {
      transition,
      durationMs: clampMs(FULL_MS[transition] * SUBTLE_SCALE),
      motion,
      requested,
      reason: 'subtle',
    };
  }
  return {
    transition: requested,
    durationMs: clampMs(FULL_MS[requested]),
    motion,
    requested,
    reason: source,
  };
}

/** Transitions for every slide of a deck, in order. */
export function resolveDeckTransitions(
  deck: { style: Pick<DeckStyle, 'motion' | 'transition'>; slides: readonly DeckSlide[] },
  context: MotionContext = {}
): { slideId: string; transition: ResolvedTransition }[] {
  return deck.slides.map((slide) => ({
    slideId: slide.id,
    transition: resolveSlideTransition(deck.style, slide, context),
  }));
}

export interface ResolvedFragmentMotion {
  /** The effect to animate; state effects (highlight, strike) keep theirs with no motion. */
  effect: FragmentEffect;
  durationMs: number;
}

const MOVING: ReadonlySet<FragmentEffect> = new Set(['fade-up', 'grow', 'shrink']);
const FRAGMENT_MS = 300;

/**
 * How a fragment animates under the motion level. Visibility never changes
 * (that is `fragmentPhase`); only the effect and its duration do.
 */
export function resolveFragmentMotion(
  effect: FragmentEffect,
  style: Pick<DeckStyle, 'motion'>,
  context: MotionContext = {}
): ResolvedFragmentMotion {
  const motion = effectiveMotion(style, context);
  if (motion === 'none') return { effect: MOVING.has(effect) ? 'in' : effect, durationMs: 0 };
  if (context.prefersReducedMotion) {
    return { effect: MOVING.has(effect) ? 'in' : effect, durationMs: REDUCED_FADE_MS };
  }
  if (motion === 'subtle') return { effect, durationMs: clampMs(FRAGMENT_MS * SUBTLE_SCALE) };
  return { effect, durationMs: FRAGMENT_MS };
}

interface ReducedMotionEnv {
  matchMedia?: (query: string) => { matches: boolean };
  document?: { documentElement?: { dataset?: Record<string, string | undefined> } };
}

/**
 * Reads the viewer's reduced-motion preference: the OS setting or the
 * prototype's own toggle (`<html data-py-motion="reduce">`). Safe without a DOM.
 */
export function prefersReducedMotion(
  env: ReducedMotionEnv = globalThis as unknown as ReducedMotionEnv
): boolean {
  if (env.document?.documentElement?.dataset?.pyMotion === 'reduce') return true;
  try {
    return typeof env.matchMedia === 'function'
      ? env.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false;
  } catch {
    return false;
  }
}
