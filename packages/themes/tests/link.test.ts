import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { themeVariables } from '../src/apply.ts';
import { contrastRatio, LINK_SURFACES, linkStates } from '../src/contrast.ts';
import { disableFullThemeLibrary, enableFullThemeLibrary } from '../src/library/full.ts';
import { loadAllFullLibraryThemes } from '../src/library/index.ts';
import { BUILTIN_THEMES, DEFAULT_THEME_ID } from '../src/presets.ts';
import { toTexuliTheme } from '../src/texuli.ts';

/**
 * Texuli's link role (`--tx-link`, its hover, active, focus and disabled
 * states, and `--tx-link-visited`): every theme writes it, derived from its
 * palette, at AA on the surfaces Texuli's gate checks link text on.
 */
beforeAll(() => enableFullThemeLibrary());
afterAll(() => disableFullThemeLibrary());

const LINK_VARS = [
  '--tx-link',
  '--tx-link-hover',
  '--tx-link-active',
  '--tx-link-focus',
  '--tx-link-disabled',
  '--tx-link-visited',
] as const;
/** Readable link text; a disabled link is exempt from the contrast minimum (WCAG 1.4.3). */
const READABLE = LINK_VARS.filter((name) => name !== '--tx-link-disabled');

describe('link tokens', () => {
  it('every built-in and library theme reaches AA for link text on its surfaces, light and dark', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllFullLibraryThemes())];
    expect(themes.length).toBeGreaterThanOrEqual(200);
    const failures: string[] = [];
    for (const theme of themes) {
      for (const mode of ['light', 'dark'] as const) {
        const vars = themeVariables({ theme, resolvedMode: mode });
        for (const name of LINK_VARS) {
          expect(vars[name], `${theme.id}/${mode} writes ${name}`).toMatch(/^#[0-9a-f]{6}$/i);
          expect(
            vars[name.replace('--tx-', '--py-')],
            'does not write a legacy alias'
          ).toBeUndefined();
        }
        for (const name of READABLE) {
          for (const surface of LINK_SURFACES) {
            const ratio = contrastRatio(vars[name] as string, theme[mode][surface]);
            if (ratio < 4.5)
              failures.push(`${theme.id}/${mode}: ${name} on ${surface} = ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  });

  it('hover and active step visibly away from the default when the theme leaves room', () => {
    const violet = BUILTIN_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);
    if (!violet) throw new Error('missing the default theme');
    for (const mode of ['light', 'dark'] as const) {
      const link = linkStates(violet[mode]);
      expect(link.default).toBe(violet[mode].primary);
      expect(link.hover).not.toBe(link.default);
      expect(link.active).not.toBe(link.hover);
      expect(link.focus).toBe(link.hover);
      expect(link.visited).toBe(link.default);
      expect(link.disabled).toBe(violet[mode].mutedForeground);
    }
  });

  it('falls back to the foreground when the primary is too light to read as a link', () => {
    const palette = {
      background: '#ffffff',
      surface: '#ffffff',
      muted: '#f4f4f5',
      elevated: '#ffffff',
      primary: '#fde047',
      foreground: '#09090b',
      mutedForeground: '#52525b',
    };
    expect(linkStates(palette).default).toBe('#09090b');
  });

  it('the Texuli writer carries the same link states as the default writer', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllFullLibraryThemes()).slice(0, 24)];
    for (const theme of themes) {
      const converted = toTexuliTheme(theme);
      for (const mode of ['light', 'dark'] as const) {
        const vars = themeVariables({ theme, resolvedMode: mode });
        const link = converted[mode].link;
        expect(link.default, `${theme.id}/${mode}`).toBe(vars['--tx-link']);
        expect(link.hover).toBe(vars['--tx-link-hover']);
        expect(link.active).toBe(vars['--tx-link-active']);
        expect(link.focus).toBe(vars['--tx-link-focus']);
        expect(link.disabled).toBe(vars['--tx-link-disabled']);
        expect(converted[mode].linkVisited.default).toBe(vars['--tx-link-visited']);
      }
    }
  });

  it('the first-paint stylesheet carries the default theme link tokens, light and dark', () => {
    const css = readFileSync(resolve(import.meta.dirname, '../src/base.css'), 'utf8');
    const violet = BUILTIN_THEMES.find((theme) => theme.id === DEFAULT_THEME_ID);
    if (!violet) throw new Error('missing the default theme');
    for (const mode of ['light', 'dark'] as const) {
      const vars = themeVariables({ theme: violet, resolvedMode: mode });
      for (const name of LINK_VARS) {
        expect(css, `${mode} ${name}`).toContain(`${name}: ${vars[name]};`);
        expect(css).not.toContain(`${name.replace('--tx-', '--py-')}: var(${name});`);
      }
    }
  });
});
