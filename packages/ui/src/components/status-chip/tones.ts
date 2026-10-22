export const STATUS_CHIP_TONES = [
  'neutral',
  'success',
  'warning',
  'error',
  'info',
  'brand',
] as const;
export type StatusChipTone = (typeof STATUS_CHIP_TONES)[number];

export const STATUS_CHIP_TONE_CLASSES: Record<StatusChipTone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  success: 'bg-success/15 text-success',
  warning: 'bg-warning/20 text-warning-foreground',
  error: 'bg-destructive/15 text-destructive',
  info: 'bg-info/15 text-info',
  brand: 'bg-primary/15 text-primary',
};
