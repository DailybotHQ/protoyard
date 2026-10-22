import type { CodeTokenKind } from '@protoyard/blocks/code';

/**
 * Theme tokens a code token kind may be drawn in. Each is a pair the theme
 * presets already hold to WCAG AA (4.5:1) as text on `surface` (the code
 * background) and on `muted` (a highlighted line); `code-contrast.test.ts`
 * checks every built-in theme in light and dark.
 */
export type CodeColorRole =
  | 'surfaceForeground'
  | 'mutedForeground'
  | 'primary'
  | 'success'
  | 'info'
  | 'destructive';

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

function style(color: CodeColorRole, extra = ''): CodeTokenStyle {
  return { color, className: extra ? `${COLOR_CLASS[color]} ${extra}` : COLOR_CLASS[color] };
}

/** One style per token kind; keywords and tags are also bold, comments italic. */
export const CODE_TOKEN_STYLES: Readonly<Record<CodeTokenKind, CodeTokenStyle>> = Object.freeze({
  plain: style('surfaceForeground'),
  punctuation: style('surfaceForeground'),
  operator: style('surfaceForeground'),
  variable: style('surfaceForeground'),
  property: style('surfaceForeground'),
  keyword: style('primary', 'font-semibold'),
  tag: style('primary', 'font-semibold'),
  string: style('success'),
  attr: style('success'),
  number: style('destructive'),
  constant: style('destructive'),
  function: style('info'),
  type: style('info'),
  comment: style('mutedForeground', 'italic'),
});

/**
 * Which highlight step a code block shows. With a host step (a deck fragment
 * index), the block's own `step` is where its highlights start: step `s`
 * shows `highlights[s - blockStep]`, clamped to the first and last. Without
 * a host step (pages, docs), the first step is shown as static emphasis.
 * `-1` means no highlights.
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
