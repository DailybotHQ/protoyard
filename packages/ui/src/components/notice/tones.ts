import { BadgeCheck, CircleAlert, Info, Sparkles, TriangleAlert } from '@lucide/svelte';
import type { IconComponent } from '../../lib/types.ts';

/** Five inline-notice tones (generic English; theme-token colors). */
export const NOTICE_TONES = ['info', 'success', 'warning', 'error', 'brand'] as const;
export type NoticeTone = (typeof NOTICE_TONES)[number];

/**
 * Lucide glyphs per tone, for callers that render a tone icon themselves
 * (through `Icon` from `texuli/icons`). Notice uses Texuli's own tone glyphs.
 */
export const NOTICE_DEFAULT_ICONS: Record<NoticeTone, IconComponent> = {
  info: Info,
  success: BadgeCheck,
  warning: TriangleAlert,
  error: CircleAlert,
  brand: Sparkles,
};

/**
 * @deprecated Notice renders Texuli's `Alert`, which styles each tone itself;
 * these Tailwind classes are kept for callers that styled their own boxes.
 * Box and title classes per tone — tinted fills with readable title color.
 */
export const NOTICE_TONE_CLASSES: Record<NoticeTone, { box: string; title: string }> = {
  info: {
    box: 'border border-info/30 bg-info/10',
    title: 'text-info',
  },
  success: {
    box: 'border border-success/30 bg-success/10',
    title: 'text-success',
  },
  warning: {
    box: 'border border-warning/40 bg-warning/20',
    title: 'text-warning-foreground',
  },
  error: {
    box: 'border border-destructive/40 bg-destructive/10',
    title: 'text-destructive',
  },
  brand: {
    box: 'border border-primary/30 bg-primary/10',
    title: 'text-primary',
  },
};
