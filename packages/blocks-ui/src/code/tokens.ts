/**
 * Code token styles — roles from `@texuli/blocks/code`, with Protoyard
 * Tailwind class names so existing contrast tests stay green. Highlight index
 * keeps the Protoyard host-step signature (decks pass hostStep − block.step).
 */
import type { CodeTokenKind } from '@protoyard/blocks/code';
import {
  CODE_TOKEN_STYLES as TEXULI_TOKEN_STYLES,
  type CodeColorRole as TexuliColorRole,
} from '@texuli/blocks/code';

export type CodeColorRole = TexuliColorRole;

export interface CodeTokenStyle {
  color: CodeColorRole;
  /** Tailwind classes: the color, plus a non-color cue where it helps. */
  className: string;
}

const COLOR_CLASS: Record<CodeColorRole, string> = {
  surfaceForeground: 'text-surface-foreground',
  mutedForeground: 'text-muted-foreground',
  primary: 'text-primary',
  success: 'text-success',
  info: 'text-info',
  destructive: 'text-destructive',
};

const EMPHASIS_CLASS = {
  bold: 'font-semibold',
  italic: 'italic',
} as const;

/** One style per token kind; keywords and tags are also bold, comments italic. */
export const CODE_TOKEN_STYLES: Readonly<Record<CodeTokenKind, CodeTokenStyle>> = Object.freeze(
  Object.fromEntries(
    (Object.keys(TEXULI_TOKEN_STYLES) as CodeTokenKind[]).map((kind) => {
      const style = TEXULI_TOKEN_STYLES[kind];
      const extra =
        'emphasis' in style && style.emphasis
          ? EMPHASIS_CLASS[style.emphasis as 'bold' | 'italic']
          : '';
      const colorClass = COLOR_CLASS[style.color];
      return [
        kind,
        {
          color: style.color,
          className: extra ? `${colorClass} ${extra}` : colorClass,
        } satisfies CodeTokenStyle,
      ];
    })
  ) as Record<CodeTokenKind, CodeTokenStyle>
);

/**
 * Which highlight step a block shows for a deck host step.
 * `hostStep - blockStep`, clamped; no host step → first step; empty → none.
 */
export function activeHighlightIndex(
  stepCount: number,
  hostStep: number | undefined,
  blockStep = 0
): number {
  if (stepCount <= 0) return -1;
  if (hostStep === undefined || !Number.isFinite(hostStep)) return 0;
  return Math.min(stepCount - 1, Math.max(0, Math.floor(hostStep) - blockStep));
}
