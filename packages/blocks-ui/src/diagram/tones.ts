import type { BlockTone } from '@protoyard/blocks';

/** Border accent per block tone; emphasis only, so meaning never rests on color. */
export const TONE_BORDER: Readonly<Record<BlockTone, string>> = Object.freeze({
  neutral: 'border-border',
  accent: 'border-primary',
  info: 'border-info',
  success: 'border-success',
  warning: 'border-warning',
  danger: 'border-destructive',
});

export function toneBorder(tone: string | undefined): string {
  return (tone && TONE_BORDER[tone as BlockTone]) || TONE_BORDER.neutral;
}

/** Room around the layout so strokes and arrowheads are not clipped. */
export const DIAGRAM_PAD = 8;
