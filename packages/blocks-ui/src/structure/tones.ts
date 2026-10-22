import type { BlockTone } from '@protoyard/blocks';

/** Theme-token classes for structure accents (never raw CSS colors). */
export const TONE_ICON: Record<BlockTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  accent: 'bg-primary/15 text-primary',
  info: 'bg-info/15 text-info',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  danger: 'bg-destructive/15 text-destructive',
};

export const TONE_BORDER: Record<BlockTone, string> = {
  neutral: 'border-border',
  accent: 'border-primary/40',
  info: 'border-info/40',
  success: 'border-success/40',
  warning: 'border-warning/40',
  danger: 'border-destructive/40',
};

export function toneIcon(tone: BlockTone | undefined): string {
  return TONE_ICON[tone ?? 'neutral'];
}

export function toneBorder(tone: BlockTone | undefined): string {
  return TONE_BORDER[tone ?? 'neutral'];
}
