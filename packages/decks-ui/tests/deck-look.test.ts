import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadDeckTheme } from '@protoyard/decks/style';
import { describe, expect, it } from 'vitest';

/**
 * The deck look on the `@texuli/slides` stage reaches Texuli components:
 * the font pair through the theme the stage applies (`--tx-font-*`), and the
 * radius choice, which the stage writes only to `--tx-deck-radius`, through
 * the slide renderers (`--tx-radius`).
 */
describe('deck font pair and radius reach canonical --tx-* tokens', () => {
  it('the deck font pair is in the Texuli theme the stage writes as --tx-font-*', async () => {
    const plain = await loadDeckTheme('aurora-analytics');
    const paired = await loadDeckTheme('aurora-analytics', 'humanist');
    expect(paired.warnings).toEqual([]);
    expect(paired.theme.fontFamily).toMatch(/--tx-font-stack-humanist-sans/);
    expect(paired.theme.fontFamily).not.toBe(plain.theme.fontFamily);
    expect(paired.theme.fontFamilyHeading).toBeTruthy();
    expect(paired.theme.fontFamilyMono).toBeTruthy();
  });

  it('free and custom slides map --tx-radius to the deck radius without legacy aliases', () => {
    for (const file of ['FreeSlide.svelte', 'CustomSlide.svelte']) {
      const source = readFileSync(resolve(import.meta.dirname, '../src/app', file), 'utf8');
      expect(source, file).toContain('--tx-radius: var(--tx-deck-radius);');
      expect(source, file).not.toMatch(/^\s*--py-[a-z0-9-]+\s*:/m);
    }
  });

  it('free slides use the stage font tokens directly', () => {
    const source = readFileSync(
      resolve(import.meta.dirname, '../src/app/FreeSlide.svelte'),
      'utf8'
    );
    for (const role of ['font-sans', 'font-heading']) {
      expect(source).toContain(`var(--tx-${role})`);
    }
    expect(source).not.toMatch(/^\s*--py-[a-z0-9-]+\s*:/m);
  });
});
