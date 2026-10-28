import { ThemeSchema } from '@protoyard/core';
import { SEMANTIC_ROLES, validateTheme } from '@texuli/tokens';
import { runAaGateOnContractTheme } from '@texuli/tokens/aa-gate';
import { loadFullLibraryTheme, loadFullLibraryThemeCharts } from '@texuli/tokens/library-expand';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { contrastRatio, hoverFill } from '../src/contrast.ts';
import {
  appearanceCacheKey,
  applyAppearance,
  clearAppearance,
  noFlashScript,
  oceanTheme,
  violetTheme,
} from '../src/index.ts';
import { disableFullThemeLibrary, enableFullThemeLibrary } from '../src/library/full.ts';
import {
  loadAllFullLibraryThemes,
  loadFullLibraryMeta,
  loadLibraryTheme,
} from '../src/library/index.ts';
import { BUILTIN_THEMES } from '../src/presets.ts';
import {
  deriveTexuliRoles,
  disableTexuliAppearance,
  enableTexuliAppearance,
  fromTexuliTheme,
  SHARED_PALETTE_ROLES,
  toTexuliTheme,
} from '../src/texuli.ts';

// These suites cover the full library (204 themes); the default is the catalog.
beforeAll(() => enableFullThemeLibrary());
afterAll(() => disableFullThemeLibrary());

const root = document.documentElement;

afterEach(() => {
  clearAppearance(root);
  localStorage.clear();
});

const txVars = (target: HTMLElement) =>
  [...Array(target.style.length).keys()]
    .map((index) => target.style.item(index))
    .filter((name) => name.startsWith('--tx-'));

describe('Protoyard themes as Texuli themes (toTexuliTheme)', () => {
  it('completes every built-in and library theme into a valid Texuli theme with all roles', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllFullLibraryThemes())];
    expect(themes.length).toBeGreaterThanOrEqual(200);
    for (const theme of themes) {
      const converted = toTexuliTheme(theme);
      const result = validateTheme(converted);
      expect(result.ok, `${theme.id}: ${JSON.stringify(result).slice(0, 300)}`).toBe(true);
      for (const mode of ['light', 'dark'] as const) {
        expect(Object.keys(converted[mode]).sort()).toEqual([...SEMANTIC_ROLES].sort());
        // The shared roles pass through unchanged: --py-<role> and --tx-<role> agree.
        for (const role of SHARED_PALETTE_ROLES) {
          expect(converted[mode][role].default, `${theme.id}/${mode}/${role}`).toBe(
            theme[mode][role]
          );
        }
      }
    }
  }, 30_000); // heavy: every library theme through Texuli and back

  it("passes Texuli's AA gate for every library theme, at the level the theme claims", async () => {
    const level = new Map(
      (await loadFullLibraryMeta()).map((meta) => [meta.id, meta.contrastLevel])
    );
    const failing: string[] = [];
    for (const theme of await loadAllFullLibraryThemes()) {
      const report = runAaGateOnContractTheme(toTexuliTheme(theme), {
        contrastLevel: level.get(theme.id) ?? 'AA',
      });
      if (!report.pass) failing.push(theme.id);
    }
    expect(failing).toEqual([]);
  });

  it("reports the built-ins' one known gap exactly: light-mode input borders under 3:1", () => {
    // A pre-existing Protoyard defect, not a derived role: the six built-ins draw
    // `input` borders at about 1.4:1 in light mode, which WCAG 1.4.11 (3:1) and
    // Texuli's gate refuse. Darkening them restyles every prototype, so it is a
    // separate decision; this list is exact, so nothing else may fail.
    const failures: string[] = [];
    for (const theme of BUILTIN_THEMES) {
      const report = runAaGateOnContractTheme(toTexuliTheme(theme));
      for (const mode of report.modes) {
        for (const pair of mode.pairs) {
          if (!pair.pass) failures.push(`${theme.id}/${mode.mode} ${pair.pairId}`);
        }
      }
    }
    expect(failures).toEqual(
      BUILTIN_THEMES.flatMap((theme) => [
        `${theme.id}/light ui:input/background`,
        `${theme.id}/light ui:input/surface`,
      ])
    );
  });

  it("derives each extra role from the first candidate that meets Texuli's pairs", () => {
    const palette = {
      ...violetTheme.light,
      // A muted fill that `foreground` cannot read on pushes the soft tones to `background`.
      muted: '#3f3f46',
      mutedForeground: '#fafafa',
      // A faint border falls through to the next candidate that reaches 3:1.
      border: '#f4f4f5',
      input: '#e4e4e7',
      ring: '#71717a',
    };
    const roles = deriveTexuliRoles(palette);
    expect(roles.primarySoft).toBe(palette.background);
    expect(contrastRatio(palette.foreground, roles.primarySoft as string)).toBeGreaterThanOrEqual(
      4.5
    );
    expect(roles.borderStrong).toBe('#71717a');
    expect(roles.canvas).toBe(palette.background);
    expect(roles.selection).toBe(palette.primary);
    expect(roles.selectionForeground).toBe(palette.primaryForeground);
    // Without any qualifying candidate, the strongest one is used.
    const none = deriveTexuliRoles({
      ...palette,
      border: '#fafafa',
      input: '#fafafa',
      ring: '#fafafa',
      mutedForeground: '#fafafa',
    });
    expect(none.borderStrong).toBe('#fafafa');
  });

  it("carries Protoyard's hover fills as Texuli states and caches per theme object", () => {
    const converted = toTexuliTheme(violetTheme);
    expect(converted.light.primary.hover).toBe(
      hoverFill(violetTheme.light.primary, violetTheme.light.primaryForeground)
    );
    expect(converted.dark.destructive.hover).toBe(
      hoverFill(violetTheme.dark.destructive, violetTheme.dark.destructiveForeground)
    );
    expect(toTexuliTheme(violetTheme)).toBe(converted);
  });
});

describe('Texuli themes as Protoyard themes (fromTexuliTheme)', () => {
  it('round-trips: the shared roles survive Texuli → Protoyard → Texuli', async () => {
    for (const id of [
      'fintech-ledger',
      'glass-frost',
      (await loadFullLibraryMeta()).at(-1)?.id as string,
    ]) {
      const [source, charts] = await Promise.all([
        loadFullLibraryTheme(id),
        loadFullLibraryThemeCharts(id),
      ]);
      const protoyard = fromTexuliTheme(source, charts);
      expect(ThemeSchema.parse(protoyard)).toEqual(protoyard);
      expect(await loadLibraryTheme(id)).toEqual(protoyard);
      const back = toTexuliTheme(protoyard);
      for (const mode of ['light', 'dark'] as const) {
        for (const role of SHARED_PALETTE_ROLES) {
          expect(back[mode][role].default, `${id}/${mode}/${role}`).toBe(
            source[mode][role].default
          );
        }
      }
    }
  });

  it('fills chart roles from the categorical chart colors, or primary without charts', async () => {
    const source = await loadFullLibraryTheme('fintech-ledger');
    const plain = fromTexuliTheme({ ...source, charts: undefined }, undefined);
    expect(plain.light.chart1).toBe(source.light.primary.default);
    expect(plain.charts).toBeUndefined();
  });
});

describe('--py-* names are aliases of the --tx-* variables', () => {
  beforeAll(() => enableTexuliAppearance());
  afterAll(() => disableTexuliAppearance());

  it('writes both families, with equal values for every shared role and style token', async () => {
    const applied = applyAppearance(root, { theme: oceanTheme, resolvedMode: 'dark' });

    const style = root.style;
    for (const role of SHARED_PALETTE_ROLES) {
      const name = role.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
      expect(style.getPropertyValue(`--tx-${name}`), role).toBe(oceanTheme.dark[role]);
      expect(style.getPropertyValue(`--py-${name}`), role).toBe(oceanTheme.dark[role]);
    }
    for (const token of [
      'primary-hover',
      'destructive-hover',
      'radius',
      'font-sans',
      'font-mono',
      'density',
      'motion-base',
      'motion-easing',
      'shadow-soft',
      'focus-ring-width',
      'border-width',
    ]) {
      // Values that reference other tokens point at their own family's names.
      expect(style.getPropertyValue(`--py-${token}`).replaceAll('--py-', '--tx-'), token).toBe(
        style.getPropertyValue(`--tx-${token}`)
      );
      expect(style.getPropertyValue(`--py-${token}`), token).not.toBe('');
    }
    expect(root.dataset.txTheme).toBe('ocean');
    expect(root.dataset.txMode).toBe('dark');
    expect(root.dataset.pyTheme).toBe('ocean');
    // Both families reach the no-flash cache.
    expect(applied.vars['--tx-primary']).toBe(oceanTheme.dark.primary);
    expect(applied.vars['--py-primary']).toBe(oceanTheme.dark.primary);
    expect(JSON.parse(JSON.stringify(applied.vars))).toEqual(applied.vars);
  });

  it('follows mode, density and reduced motion like the --py-* names', async () => {
    applyAppearance(root, {
      theme: violetTheme,
      resolvedMode: 'light',
      density: 'compact',
      reducedMotion: true,
    });
    expect(root.style.getPropertyValue('--tx-background')).toBe(violetTheme.light.background);
    expect(root.style.getPropertyValue('--tx-density')).toBe(
      root.style.getPropertyValue('--py-density')
    );
    expect(root.style.getPropertyValue('--tx-motion-base')).toBe('0ms');
    expect(root.dataset.txMotion).toBe('reduce');
  });

  it('clears every --tx-* variable and data-tx-* attribute', async () => {
    applyAppearance(root, { theme: violetTheme, resolvedMode: 'dark' });
    expect(txVars(root).length).toBeGreaterThan(50);
    clearAppearance(root);
    expect(txVars(root)).toEqual([]);
    expect(root.dataset.txTheme).toBeUndefined();
    expect(root.dataset.txMode).toBeUndefined();
  });

  it('scopes both families to a preview element', async () => {
    const preview = document.createElement('div');
    applyAppearance(preview, { theme: oceanTheme, resolvedMode: 'light' });
    expect(preview.style.getPropertyValue('--tx-primary')).toBe(oceanTheme.light.primary);
    expect(root.style.getPropertyValue('--tx-primary')).toBe('');
    clearAppearance(preview);
    expect(txVars(preview)).toEqual([]);
  });
});

describe('Texuli-only appearance metadata is opt-in per page', () => {
  afterEach(() => disableTexuliAppearance());

  it('writes canonical --tx-* theme tokens while keeping Texuli metadata opt-in', () => {
    const applied = applyAppearance(root, { theme: violetTheme, resolvedMode: 'light' });
    expect(txVars(root).length).toBeGreaterThan(0);
    expect(root.dataset.txTheme).toBeUndefined();
    expect(applied.vars['--tx-primary']).toBe(violetTheme.light.primary);
    expect(root.style.getPropertyValue('--py-primary')).toBe(violetTheme.light.primary);
  });

  it('re-applies the current appearance when enabled, and keeps writing after', () => {
    applyAppearance(root, { theme: oceanTheme, resolvedMode: 'dark' });
    enableTexuliAppearance();
    expect(root.style.getPropertyValue('--tx-primary')).toBe(oceanTheme.dark.primary);
    expect(root.dataset.txMode).toBe('dark');
    applyAppearance(root, { theme: violetTheme, resolvedMode: 'light' });
    expect(root.style.getPropertyValue('--tx-primary')).toBe(violetTheme.light.primary);
    // A cleared target is not re-applied by a later enable.
    clearAppearance(root);
    enableTexuliAppearance();
    expect(txVars(root)).toEqual([]);
  });
});

describe('no-flash replays the --tx-* variables too', () => {
  it('replays cached --tx-* and --py-* names and the data-tx-* attributes, nothing else', () => {
    localStorage.setItem(
      appearanceCacheKey('crm-demo'),
      JSON.stringify({
        v: 1,
        mode: 'dark',
        themeId: 'ocean',
        reducedMotion: false,
        vars: {
          '--tx-primary': '#123456',
          '--py-primary': '#123456',
          color: 'red',
          '--tx-bad;name': 'x',
          '--evil-primary': '#000000',
        },
      })
    );
    new Function(noFlashScript('crm-demo'))();
    expect(root.style.getPropertyValue('--tx-primary')).toBe('#123456');
    expect(root.style.getPropertyValue('--py-primary')).toBe('#123456');
    expect(root.style.getPropertyValue('color')).toBe('');
    expect(root.style.getPropertyValue('--evil-primary')).toBe('');
    expect(root.dataset.txMode).toBe('dark');
    expect(root.dataset.txTheme).toBe('ocean');
    root.style.removeProperty('--tx-primary');
    root.style.removeProperty('--py-primary');
  });
});
