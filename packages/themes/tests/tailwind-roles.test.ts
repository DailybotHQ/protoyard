import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  TAILWIND_CHART_COLORS,
  TAILWIND_INTERACTION_COLORS,
  TAILWIND_SEMANTIC_COLORS,
  TAILWIND_SURFACE_ALIASES,
} from '@texuli/tokens/tailwind';
import { describe, expect, it } from 'vitest';
import { getTheme, themeVariables } from '../src/index.ts';

const css = readFileSync(join(import.meta.dirname, '../src/base.css'), 'utf8');
const themeBlock = css.slice(css.indexOf('@theme inline {'), css.indexOf('--radius-xs:'));

describe('Tailwind color roles (UG-16)', () => {
  it('base.css has a --color-* line for every color role in Texuli’s Tailwind theme map', () => {
    const entries = [
      ...TAILWIND_SEMANTIC_COLORS,
      ...TAILWIND_INTERACTION_COLORS,
      ...TAILWIND_SURFACE_ALIASES,
      ...TAILWIND_CHART_COLORS,
    ];
    const missing = entries
      .filter(
        (entry) =>
          !new RegExp(`\\n\\s*${entry.themeVar}:\\s*var\\(${entry.tokenVar}\\b`).test(themeBlock)
      )
      .map((entry) => entry.themeVar);
    expect(missing).toEqual([]);
  });

  it('every color utility resolves under a plain Protoyard theme (a written token or its fallback)', () => {
    const written = themeVariables({ theme: getTheme(undefined), resolvedMode: 'light' });
    const lines = [...themeBlock.matchAll(/\n\s*(--color-[a-z0-9-]+):([^;]+);/g)];
    expect(lines.length).toBeGreaterThan(70);
    const unresolved = lines
      .filter(
        ([, , value]) =>
          ![...(value as string).matchAll(/--tx-[a-z0-9-]+/g)].some(([v]) => v in written)
      )
      .map(([, name]) => name);
    expect(unresolved).toEqual([]);
  });

  it('a design system token still wins over the fallback', () => {
    expect(themeBlock).toMatch(
      /--color-primary-soft: var\(--tx-primary-soft, var\(--tx-muted\)\);/
    );
    expect(themeBlock).toMatch(
      /--color-border-strong: var\(--tx-border-strong, var\(--tx-input\)\);/
    );
    expect(themeBlock).toMatch(/--color-link: var\(--tx-link\);/);
  });
});
