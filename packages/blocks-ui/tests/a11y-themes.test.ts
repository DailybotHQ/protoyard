import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Block, BlockType } from '@protoyard/blocks';
import { BLOCK_CATALOG, RICH_EXAMPLES } from '@protoyard/blocks/catalog';
import type { ThemePalette } from '@protoyard/core';
import { DECK_INTERACTIVE_ATTRIBUTE } from '@protoyard/decks';
import { cleanup, configure, render, waitFor } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { contrastRatio } from '../../themes/src/contrast.ts';
import { BUILTIN_THEMES } from '../../themes/src/presets.ts';
import {
  BLOCK_TONES,
  TONE_BORDER,
  TONE_CONTRAST_PAIRS,
  TONE_ICON,
  TONE_INDICATOR,
  TONE_LABELS,
} from '../src/lib/tones.ts';
import A11yHarness from './fixtures/A11yHarness.svelte';

// Block families load lazily; under the full parallel suite the first import of a
// family can take longer than testing-library's 1 s default.
configure({ asyncUtilTimeout: 15_000 });

const MODES = ['light', 'dark'] as const;
const SRC = join(import.meta.dirname, '..', 'src');
const long = { timeout: 20_000 };

const palettes = BUILTIN_THEMES.flatMap((theme) =>
  MODES.map((mode) => ({
    themeId: theme.id,
    mode,
    label: `${theme.id}/${mode}`,
    palette: theme[mode] as ThemePalette,
    theme,
  }))
);

const richEntries = Object.entries(RICH_EXAMPLES) as [BlockType, Block][];

afterEach(() => cleanup());

describe('tone maps (lib/tones)', () => {
  it('covers every BlockTone for icon, border, indicator and labels', () => {
    expect(Object.keys(TONE_ICON).sort()).toEqual([...BLOCK_TONES].sort());
    expect(Object.keys(TONE_BORDER).sort()).toEqual([...BLOCK_TONES].sort());
    expect(Object.keys(TONE_INDICATOR).sort()).toEqual([...BLOCK_TONES].sort());
    expect(Object.keys(TONE_LABELS).sort()).toEqual([...BLOCK_TONES].sort());
  });

  it('uses theme-token Tailwind classes, never raw hex', () => {
    const all = [
      ...Object.values(TONE_ICON),
      ...Object.values(TONE_BORDER),
      ...Object.values(TONE_INDICATOR),
    ].join(' ');
    expect(all).not.toMatch(/#[0-9a-fA-F]{3,8}/);
    expect(all).toMatch(/primary|info|success|warning|destructive|muted|border/);
  });
});

describe('tone contrast across built-in themes', () => {
  it('covers six built-ins × light/dark', () => {
    expect(BUILTIN_THEMES).toHaveLength(6);
    expect(palettes).toHaveLength(12);
  });

  it.each(palettes)(
    'every tone pair reaches AA (or UI 3:1) on its surfaces: $label',
    ({ label, palette }) => {
      const failures: string[] = [];
      for (const pair of TONE_CONTRAST_PAIRS) {
        const fg = palette[pair.foreground];
        for (const bgName of pair.backgrounds) {
          const bg = palette[bgName];
          const ratio = contrastRatio(fg, bg);
          if (ratio < pair.minimum) {
            failures.push(
              `${label} · ${pair.tone}/${pair.label}: ${pair.foreground} on ${bgName} = ${ratio.toFixed(2)} (need ≥ ${pair.minimum})`
            );
          }
        }
      }
      expect(failures, failures.join('\n')).toEqual([]);
    }
  );
});

describe('catalog rich examples — a11y structure', () => {
  it('ships a rich example for every catalog type', () => {
    const catalogTypes = Object.keys(BLOCK_CATALOG).sort();
    const richTypes = Object.keys(RICH_EXAMPLES).sort();
    expect(richTypes).toEqual(catalogTypes);
    expect(richEntries.length).toBeGreaterThan(20);
  });

  it.each(richEntries.map(([type, block]) => [type, block] as const))(
    'renders %s with accessible names, ordered headings, focus rings and image alts',
    async (type, block) => {
      const theme = BUILTIN_THEMES[0]!;
      const { container } = render(A11yHarness, {
        props: { blocks: [block], theme, mode: 'light' },
      });

      await waitFor(() => {
        // Finished loading (no infinite skeleton for the single block).
        const loading = container.querySelectorAll('[aria-label="Loading block"]');
        expect(loading.length, `${type} still loading`).toBe(0);
      }, long);

      // Headings inside the block never skip levels (h1→h3 forbidden when both present).
      const headings = [...container.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((el) =>
        Number(el.tagName.slice(1))
      );
      for (let i = 1; i < headings.length; i++) {
        const prev = headings[i - 1] as number;
        const next = headings[i] as number;
        expect(next - prev, `${type}: heading jump ${prev} → ${next}`).toBeLessThanOrEqual(1);
      }

      // Images that are not decorative expose alt.
      for (const img of container.querySelectorAll('img')) {
        expect(img.hasAttribute('alt'), `${type}: img missing alt`).toBe(true);
      }

      // Interactive / focusable controls expose a name and a visible focus ring class.
      const focusables = container.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      for (const el of focusables) {
        const name =
          el.getAttribute('aria-label') ||
          el.getAttribute('aria-labelledby') ||
          el.getAttribute('title') ||
          (el.textContent ?? '').trim() ||
          el.getAttribute('alt') ||
          el.getAttribute('placeholder');
        expect(name, `${type}: focusable without accessible name`).toBeTruthy();
        const className = el.getAttribute('class') ?? '';
        const hasFocusRing =
          /focus-visible:ring|focus-visible:outline|focus:ring|focus:outline|ring-ring|ring-1|ring-2/.test(
            className
          ) ||
          el.tagName === 'INPUT' ||
          el.tagName === 'TEXTAREA' ||
          el.tagName === 'SELECT' ||
          // ui Button ships focus rings via buttonVariants (class may be hashed in build).
          el.classList.contains('inline-flex') ||
          // Texuli code/diagram paint :focus-visible in their own CSS (tx-code, tx-diagram).
          Boolean(
            el.closest(
              '[data-tx-blocks], [data-tx-block], [data-tx-diagram], .tx-code, .tx-diagram'
            )
          );
        expect(hasFocusRing, `${type}: ${el.tagName} missing focus-visible ring class`).toBe(true);
      }

      // Block root is present (family-specific data-py-block or region).
      expect(
        container.querySelector('[data-py-block], [data-py-embed-app], [data-a11y-harness]'),
        `${type}: no block root`
      ).toBeTruthy();
    },
    30_000
  );

  it('renders every rich example under each built-in theme × mode without crashing', async () => {
    // Smoke: one block per theme/mode is enough to catch token wiring; full
    // matrix of all types × 12 is covered by contrast pairs + single-theme DOM.
    const sample = RICH_EXAMPLES.heading;
    for (const { theme, mode, label } of palettes) {
      cleanup();
      const { container } = render(A11yHarness, {
        props: { blocks: [sample], theme, mode },
      });
      await waitFor(() => {
        expect(
          container.querySelector('[data-a11y-harness]')?.getAttribute('data-theme-id'),
          label
        ).toBe(theme.id);
        expect(container.querySelectorAll('[aria-label="Loading block"]').length).toBe(0);
      }, long);
      const root = container.querySelector('[data-a11y-harness]') as HTMLElement;
      expect(root.style.getPropertyValue('--py-background')).toMatch(/^#/);
      expect(root.style.getPropertyValue('--py-foreground')).toMatch(/^#/);
    }
  }, 60_000);
});

describe('deck-interactive roots (follow-up)', () => {
  it('marks interactive, map and embed roots so deck clicks do not advance', async () => {
    expect(DECK_INTERACTIVE_ATTRIBUTE).toBe('data-py-deck-interactive');
    const interactiveTypes: BlockType[] = [
      'poll',
      'quiz',
      'calculator',
      'counter',
      'tabs',
      'reveal',
      'chart-controls',
      'form',
      'map',
      'embed-app',
    ];
    const blocks = interactiveTypes.map(
      (type) => RICH_EXAMPLES[type] ?? BLOCK_CATALOG[type].exampleMinimal
    );
    const { container } = render(A11yHarness, {
      props: { blocks, theme: BUILTIN_THEMES[0]!, mode: 'light' },
    });
    await waitFor(() => {
      const roots = container.querySelectorAll(`[${DECK_INTERACTIVE_ATTRIBUTE}]`);
      expect(roots.length).toBeGreaterThanOrEqual(interactiveTypes.length - 1);
    }, long);
    await waitFor(() => {
      const types = [
        ...container.querySelectorAll(`[data-py-block][${DECK_INTERACTIVE_ATTRIBUTE}]`),
      ].map((el) => el.getAttribute('data-py-block'));
      for (const type of interactiveTypes) {
        expect(types, `missing data-py-deck-interactive on ${type}`).toContain(type);
      }
    }, long);
  }, 60_000);

  it('notes form is a placeholder until pages FormBlock owns responses', () => {
    const formSrc = readFileSync(join(SRC, 'interactive', 'FormBlockView.svelte'), 'utf8');
    expect(formSrc).toMatch(/page host|form runtime|pages/i);
    expect(formSrc).toMatch(/DECK_INTERACTIVE_ATTRIBUTE|data-py-deck-interactive/);
  });
});

describe('focus ring presence in family sources', () => {
  it('interactive and structure sources use focus-visible ring utilities', () => {
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (/\.svelte$/.test(entry.name)) files.push(path);
      }
    };
    for (const family of ['interactive', 'structure', 'embed', 'data', 'code']) {
      walk(join(SRC, family));
    }
    const withControls = files.filter((file) => {
      const text = readFileSync(file, 'utf8');
      return /<button|<a |type="range"|type="checkbox"/.test(text);
    });
    expect(withControls.length).toBeGreaterThan(5);
    for (const file of withControls) {
      const text = readFileSync(file, 'utf8');
      // Buttons from @protoyard/ui already ring; local controls must declare focus-visible.
      if (text.includes('<Button') && !text.includes('<button') && !text.includes('type="range"'))
        continue;
      if (!/type="range"|type="checkbox"|<button|<a /.test(text)) continue;
      if (text.includes('<Button') && text.includes('type="range"')) {
        expect(text, file).toMatch(/focus-visible:|aria-valuetext/);
        continue;
      }
      if (text.includes('<button') || text.includes('<a ') || text.includes('type="checkbox"')) {
        expect(text, file).toMatch(
          /focus-visible:ring|focus-visible:outline|Button |from '@protoyard\/ui'/
        );
      }
    }
  });
});
