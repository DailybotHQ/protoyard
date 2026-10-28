// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CODE_TOKEN_KINDS } from '@protoyard/blocks/code';
import type { ThemePalette } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { contrastRatio } from '../../themes/src/contrast.ts';
import { BUILTIN_THEMES } from '../../themes/src/presets.ts';
import { CODE_TOKEN_STYLES } from '../src/code/tokens.ts';

/**
 * Code is drawn on `surface`; a highlighted line on `muted`. Every token
 * color must reach WCAG AA (4.5:1) on both, in every built-in theme and mode.
 */
const MODES = ['light', 'dark'] as const;
const SRC = join(import.meta.dirname, '..', 'src');
const AA = 4.5;

const palettes = BUILTIN_THEMES.flatMap((theme) =>
  MODES.map((mode) => ({ label: `${theme.id}/${mode}`, palette: theme[mode] as ThemePalette }))
);

describe('code token contrast', () => {
  it('covers the six built-in themes in both modes', () => {
    expect(BUILTIN_THEMES).toHaveLength(6);
    expect(palettes).toHaveLength(12);
  });

  it('styles every token kind with a theme token and its Tailwind class', () => {
    expect(Object.keys(CODE_TOKEN_STYLES).sort()).toEqual([...CODE_TOKEN_KINDS].sort());
    const classFor = {
      surfaceForeground: 'text-surface-foreground',
      mutedForeground: 'text-muted-foreground',
      primary: 'text-primary',
      success: 'text-success',
      info: 'text-info',
      destructive: 'text-destructive',
    } as const;
    for (const [kind, style] of Object.entries(CODE_TOKEN_STYLES)) {
      expect(style.className.split(' '), kind).toContain(classFor[style.color]);
    }
  });

  it.each(palettes)(
    'every token reaches AA on the code surface and a highlighted line: $label',
    ({ palette }) => {
      for (const [kind, style] of Object.entries(CODE_TOKEN_STYLES)) {
        const color = palette[style.color];
        expect(contrastRatio(color, palette.surface), `${kind} on surface`).toBeGreaterThanOrEqual(
          AA
        );
        expect(
          contrastRatio(color, palette.muted),
          `${kind} on a highlighted line`
        ).toBeGreaterThanOrEqual(AA);
      }
    }
  );

  it.each(palettes)('diagram text reaches AA on its surfaces: $label', ({ palette }) => {
    const pairs: [string, keyof ThemePalette, keyof ThemePalette][] = [
      ['node and card labels', 'surfaceForeground', 'surface'],
      ['terminal prompt', 'primary', 'surface'],
      ['terminal comments and empty states', 'mutedForeground', 'surface'],
      ['board column titles', 'foreground', 'muted'],
      ['board counts', 'mutedForeground', 'muted'],
    ];
    for (const [what, text, background] of pairs) {
      expect(contrastRatio(palette[text], palette[background]), what).toBeGreaterThanOrEqual(AA);
    }
  });

  it('draws code via the Texuli code family adapter (surface + muted highlights)', () => {
    const adapter = readFileSync(join(SRC, 'code', 'CodeBlock.svelte'), 'utf8');
    expect(adapter).toContain('@texuli/blocks/code/renderers');
    expect(adapter).toContain('CodeBlockView');
    // Texuli code.css paints tokens on surface and highlights on muted; no line dimming.
    const texuliCss = readFileSync(
      join(SRC, '..', 'node_modules', '@texuli', 'blocks', 'dist', 'code', 'code.css'),
      'utf8'
    );
    expect(texuliCss).toMatch(/surface|tx-code/);
    expect(texuliCss).not.toMatch(/opacity:\s*0\.\d/);
  });
});
