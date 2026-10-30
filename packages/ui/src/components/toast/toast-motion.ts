import {
  type ComponentMotion,
  createPresenceMotion,
  loadMotionRuntime,
  type MotionHold,
  type MotionSettings,
} from 'texuli/motion';

/** A toast rises in, on Texuli's `rise` preset and `base` duration token. */
export const TOAST_ENTER_MOTION: ComponentMotion = { enter: 'rise', duration: 'base' };

/**
 * The settings one animation plays with: the enclosing MotionProvider's level
 * and reduced-motion override, else the prototype's own reduced-motion toggle
 * (`data-py-motion="reduce"`, set by @protoyard/themes), else the reader's
 * `prefers-reduced-motion`, which Texuli reads itself.
 */
export function motionSettingsFor(node: Element, provider: MotionSettings): MotionSettings {
  const toggle = node.closest('[data-py-motion]')?.getAttribute('data-py-motion');
  return {
    level: provider.level,
    reducedMotion: provider.reducedMotion ?? (toggle === 'reduce' ? true : undefined),
  };
}

/** Loads Texuli's motion runtime, so later toasts can animate (the first may commit at once). */
export function preloadToastMotion(): void {
  void loadMotionRuntime();
}

/**
 * Plays the enter motion on a toast that just appeared. Returns the running
 * hold, or `null` when it committed at once (reduced motion, level `none`, no
 * runtime yet, or no Web Animations).
 */
export function enterToast(node: Element, provider: MotionSettings): MotionHold | null {
  return createPresenceMotion({
    motion: () => undefined,
    defaults: TOAST_ENTER_MOTION,
    settings: motionSettingsFor(node, provider),
  }).enter(node);
}
