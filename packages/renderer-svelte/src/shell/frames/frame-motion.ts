import type { Attachment } from 'svelte/attachments';
import {
  type ComponentMotion,
  createPresenceMotion,
  getMotionSettings,
  loadMotionRuntime,
  type MotionSettings,
} from 'texuli/motion';

/** The bezel pops in: Texuli's `scale` preset on the `fast` duration token. */
export const FRAME_ENTER_MOTION: ComponentMotion = { enter: 'scale', duration: 'fast' };

/**
 * The provider's level and reduced-motion override, else the prototype's own
 * reduced-motion toggle (`data-py-motion="reduce"`), else the reader's
 * `prefers-reduced-motion` (Texuli reads it).
 */
export function frameMotionSettings(node: Element, provider: MotionSettings): MotionSettings {
  const toggle = node.closest('[data-py-motion]')?.getAttribute('data-py-motion');
  return {
    level: provider.level,
    reducedMotion: provider.reducedMotion ?? (toggle === 'reduce' ? true : undefined),
  };
}

/**
 * An attachment for a frame's bezel (call during component init). Like every
 * Texuli presence, nothing plays until the motion runtime has loaded, so the
 * first paint shows the frame at rest; a frame shown later (a shell switch or
 * a rotation) pops in. Reduced motion commits at once.
 */
export function frameEnter(): Attachment<HTMLElement> {
  const provider = getMotionSettings();
  void loadMotionRuntime();
  return (node) => {
    const hold = createPresenceMotion({
      motion: () => undefined,
      defaults: FRAME_ENTER_MOTION,
      settings: frameMotionSettings(node, provider),
    }).enter(node);
    return () => hold?.cancel();
  };
}
