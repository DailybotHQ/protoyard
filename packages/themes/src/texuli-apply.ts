import { applyTheme } from '@texuli/tokens';
import { type AppearanceInput, densityScale, setTexuliAppearanceWriter } from './apply.ts';
import { toTexuliTheme } from './texuli.ts';

/**
 * Writes Texuli's `--tx-*` variables (the canonical names; `--py-*` are their
 * aliases) with `@texuli/tokens` itself.
 */
export function writeTexuliAppearance(
  target: HTMLElement,
  input: AppearanceInput
): Record<string, string> {
  return applyTheme(target, {
    theme: toTexuliTheme(input.theme),
    mode: input.resolvedMode,
    density: densityScale(input.density, input.theme),
    reducedMotion: input.reducedMotion ?? false,
  }).vars;
}

/**
 * Turns on Texuli's variables for every later `applyAppearance()`, and
 * re-applies the current appearance of `targets` (the document root by
 * default). Call it from a page that renders Texuli components; pages that
 * do not never load `@texuli/tokens`.
 */
export function enableTexuliAppearance(
  targets: readonly HTMLElement[] = typeof document === 'undefined'
    ? []
    : [document.documentElement]
): void {
  setTexuliAppearanceWriter(writeTexuliAppearance, targets);
}

/** Turns Texuli's variables off again (tests); written ones stay until the next clear. */
export function disableTexuliAppearance(): void {
  setTexuliAppearanceWriter(undefined);
}
