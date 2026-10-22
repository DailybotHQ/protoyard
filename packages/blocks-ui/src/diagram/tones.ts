import type { BlockTone } from '@protoyard/blocks';
import { TONE_BORDER as SHARED_BORDER, toneBorder as sharedToneBorder } from '../lib/tones.ts';

/** Diagram pad around SVG/HTML layout boxes. */
export const DIAGRAM_PAD = 16;

export const TONE_BORDER: Readonly<Record<BlockTone, string>> = SHARED_BORDER;

export function toneBorder(tone: string | undefined): string {
  return sharedToneBorder(tone as BlockTone | undefined);
}
