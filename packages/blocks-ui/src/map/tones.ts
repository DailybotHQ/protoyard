import type { BlockTone } from '@protoyard/blocks';

/**
 * Block tones on the map. Accent maps to primary (brand emphasis). Kept for
 * kit-styles and hosts that still read MAP_TONES; Texuli map applies its own
 * toneClass from the same vocabulary.
 */
export type MapTone = 'neutral' | 'primary' | 'info' | 'success' | 'warning' | 'danger';

export const MAP_TONES: Readonly<Record<BlockTone, MapTone>> = Object.freeze({
  neutral: 'neutral',
  accent: 'primary',
  info: 'info',
  success: 'success',
  warning: 'warning',
  danger: 'danger',
});

/** The map tone for a block point; untoned points use `primary`. */
export function mapTone(tone: BlockTone | undefined): MapTone {
  return tone ? MAP_TONES[tone] : 'primary';
}
