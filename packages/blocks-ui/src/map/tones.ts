import type { BlockTone } from '@protoyard/blocks';
import type { MapTone } from '@protoyard/views-ui/map';

/**
 * Block tones (the shared content vocabulary) on the simulated map's tones.
 * The map has no `accent`: it is the brand emphasis, which the map draws as
 * `primary`. Without this table an `accent` place got no fill class at all.
 */
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
