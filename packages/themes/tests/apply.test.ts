import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  defineTheme,
  ELEVATION_STYLES,
  FONT_PAIRING_IDS,
  MOTION_PRESET_IDS,
  RADIUS_PRESET_IDS,
  tokenToCssVar,
} from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appearanceCacheKey,
  applyAppearance,
  applyStylePresets,
  BUILTIN_THEMES,
  cacheAppearance,
  clearAppearance,
  ELEVATION_PRESETS,
  FONT_CATALOG,
  FONT_PRESETS,
  getFontPairing,
  getTheme,
  MOTION_PRESETS,
  mergeThemes,
  noFlashScript,
  oceanTheme,
  RADIUS_PRESETS,
  readCachedAppearance,
  resolveMode,
  themeVariables,
  violetTheme,
} from '../src/index.ts';

const root = document.documentElement;

function resetRoot() {
  clearAppearance(root);
  root.removeAttribute('style');
  localStorage.clear();
}

describe('theme lookup', () => {
  it('falls back to violet and lets prototype themes override by id', () => {
    expect(getTheme('nope').id).toBe('violet');
    expect(getTheme(undefined).id).toBe('violet');
    const custom = { ...oceanTheme, name: 'My Ocean' };
    expect(getTheme('ocean', [custom]).name).toBe('My Ocean');
    expect(mergeThemes(BUILTIN_THEMES, [custom])).toHaveLength(BUILTIN_THEMES.length);
  });

  it('resolves system mode through matchMedia', () => {
    const dark = () => ({ matches: true });
    const light = () => ({ matches: false });
    expect(resolveMode('system', dark)).toBe('dark');
    expect(resolveMode('system', light)).toBe('light');
    expect(resolveMode('light', dark)).toBe('light');
  });
});

describe('applyAppearance', () => {
  beforeEach(resetRoot);
  afterEach(resetRoot);

  it('writes every token, data attributes, dark class and color-scheme on the root', () => {
    const applied = applyAppearance(root, {
      theme: oceanTheme,
      resolvedMode: 'dark',
      reducedMotion: true,
      density: 'compact',
    });
    for (const [token, value] of Object.entries(oceanTheme.dark)) {
      expect(root.style.getPropertyValue(tokenToCssVar(token))).toBe(value);
    }
    expect(root.dataset.pyTheme).toBe('ocean');
    expect(root.dataset.pyMode).toBe('dark');
    expect(root.dataset.pyMotion).toBe('reduce');
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.style.colorScheme).toBe('dark');
    expect(root.style.getPropertyValue('--tx-density')).toBe('0.875');
    expect(applied.density).toBe(0.875);

    applyAppearance(root, { theme: oceanTheme, resolvedMode: 'light' });
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--tx-primary')).toBe(oceanTheme.light.primary);
    expect(root.dataset.pyMotion).toBe('full');
  });

  it('writes only canonical theme variables in light and dark mode', () => {
    for (const mode of ['light', 'dark'] as const) {
      const applied = applyAppearance(root, { theme: oceanTheme, resolvedMode: mode });
      expect(Object.keys(applied.vars).every((name) => name.startsWith('--tx-'))).toBe(true);
      const tokens = {
        background: oceanTheme[mode].background,
        foreground: oceanTheme[mode].foreground,
        primary: oceanTheme[mode].primary,
        'primary-foreground': oceanTheme[mode].primaryForeground,
        'chart-1': oceanTheme[mode].chart1,
      };
      for (const [token, value] of Object.entries(tokens)) {
        expect(root.style.getPropertyValue(`--tx-${token}`), `${mode}/${token}`).toBe(value);
        expect(root.style.getPropertyValue(`--py-${token}`), `${mode}/${token} legacy token`).toBe(
          ''
        );
      }
    }
  });

  it('can scope a theme to one element without touching the document', () => {
    const preview = document.createElement('div');
    document.body.append(preview);
    applyAppearance(preview, { theme: violetTheme, resolvedMode: 'dark' });
    expect(preview.classList.contains('dark')).toBe(true);
    expect(preview.style.getPropertyValue('--tx-background')).toBe(violetTheme.dark.background);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--tx-background')).toBe('');
    clearAppearance(preview);
    expect(preview.style.getPropertyValue('--tx-background')).toBe('');
    expect(preview.dataset.pyTheme).toBeUndefined();
    preview.remove();
  });

  it('maps style dimensions to CSS variables and Tailwind tokens', () => {
    const styledTheme = defineTheme({
      ...violetTheme,
      style: {
        typography: {
          scaleRatio: 1.25,
          weights: { body: 450, medium: 550, heading: 650, bold: 750 },
          tracking: { body: '0.01em', heading: '-0.02em' },
        },
        shape: { radiusScale: 1.5, borderWidth: '2px' },
        elevation: 'glow',
        surface: 'glass',
        motion: { durations: { fast: 100, base: 250, slow: 500 }, easing: 'ease-out' },
      },
    });
    const vars = themeVariables({ theme: styledTheme, resolvedMode: 'light' });

    expect(vars).toMatchObject({
      '--tx-font-size-base': '1rem',
      '--tx-font-size-lg': '1.25rem',
      '--tx-font-weight-body': '450',
      '--tx-font-weight-heading': '650',
      '--tx-letter-spacing-body': '0.01em',
      '--tx-radius-scale': '1.5',
      '--tx-border-width': '2px',
      '--tx-elevation-style': 'glow',
      '--tx-shadow-soft': '0 0 12px color-mix(in oklab, var(--tx-primary) 24%, transparent)',
      '--tx-surface-style': 'glass',
      '--tx-motion-fast': '100ms',
      '--tx-motion-base': '250ms',
      '--tx-motion-easing': 'ease-out',
    });

    const applied = applyAppearance(root, { theme: styledTheme, resolvedMode: 'light' });
    expect(root.dataset.pySurface).toBe('glass');
    expect(applied.vars['--tx-font-size-lg']).toBe('1.25rem');
    clearAppearance(root);
    expect(root.style.getPropertyValue('--tx-font-size-lg')).toBe('');
    expect(root.dataset.pySurface).toBeUndefined();
  });

  it('zeros motion tokens for an explicit reduced-motion preference', () => {
    const styleTheme = defineTheme({
      ...oceanTheme,
      style: { motion: { durations: { fast: 100, base: 250, slow: 500 }, easing: 'ease-out' } },
    });
    expect(themeVariables({ theme: styleTheme, resolvedMode: 'light' })).toMatchObject({
      '--tx-motion-fast': '100ms',
      '--tx-motion-base': '250ms',
      '--tx-motion-slow': '500ms',
      '--tx-motion-easing': 'ease-out',
    });
    expect(
      themeVariables({ theme: styleTheme, resolvedMode: 'light', reducedMotion: true })
    ).toMatchObject({
      '--tx-motion-fast': '0ms',
      '--tx-motion-base': '0ms',
      '--tx-motion-slow': '0ms',
      '--tx-motion-easing': 'linear',
    });
  });
});

describe('no-flash cache', () => {
  beforeEach(resetRoot);
  afterEach(resetRoot);

  it('round-trips the cache and survives broken storage', () => {
    const applied = applyAppearance(root, { theme: oceanTheme, resolvedMode: 'dark' });
    expect(cacheAppearance('crm-demo', applied)).toBe(true);
    expect(readCachedAppearance('crm-demo')?.themeId).toBe('ocean');
    const broken = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(cacheAppearance('crm-demo', applied, broken)).toBe(false);
    expect(readCachedAppearance('crm-demo', broken)).toBeNull();
    localStorage.setItem(appearanceCacheKey('crm-demo'), '{not json');
    expect(readCachedAppearance('crm-demo')).toBeNull();
  });

  it('replays the cached appearance before the runtime boots', () => {
    const glassTheme = {
      ...oceanTheme,
      style: { ...oceanTheme.style, surface: 'glass' as const },
    };
    const applied = applyAppearance(root, { theme: glassTheme, resolvedMode: 'dark' });
    expect(applied.surface).toBe('glass');
    cacheAppearance('crm-demo', applied);
    resetRootStyleOnly();
    new Function(noFlashScript('crm-demo'))();
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.pyTheme).toBe('ocean');
    expect(root.dataset.pySurface).toBe('glass');
    expect(root.style.getPropertyValue('--tx-primary')).toBe(oceanTheme.dark.primary);
  });

  it('ignores injected property names from a tampered cache', () => {
    localStorage.setItem(
      appearanceCacheKey('x'),
      JSON.stringify({
        v: 1,
        mode: 'light',
        vars: { color: 'red', '--py-primary': '#123456', '--tx-bad;name': 'x' },
      })
    );
    new Function(noFlashScript('x'))();
    expect(root.style.getPropertyValue('color')).toBe('');
    expect(root.style.getPropertyValue('--py-primary')).toBe('');
    expect(root.style.getPropertyValue('--tx-bad;name')).toBe('');
  });

  it('replays chart colors cached under the pre-Texuli names as Texuli’s canonical ones (one release)', () => {
    localStorage.setItem(
      appearanceCacheKey('old-export'),
      JSON.stringify({
        v: 1,
        mode: 'dark',
        vars: {
          '--tx-chart1': '#a78bfa',
          '--tx-chart8': '#123456',
          '--tx-seq-1': '#eeeeee',
          '--tx-div-9': '#111111',
          '--tx-chart-grid': '#222222',
        },
      })
    );
    new Function(noFlashScript('old-export'))();
    expect(root.style.getPropertyValue('--tx-chart-1')).toBe('#a78bfa');
    expect(root.style.getPropertyValue('--tx-chart-8')).toBe('#123456');
    expect(root.style.getPropertyValue('--tx-chart-sequential-1')).toBe('#eeeeee');
    expect(root.style.getPropertyValue('--tx-chart-diverging-9')).toBe('#111111');
    expect(root.style.getPropertyValue('--tx-chart-grid')).toBe('#222222');
    // The old names are never written.
    expect(root.style.getPropertyValue('--tx-chart1')).toBe('');
    expect(root.style.getPropertyValue('--tx-seq-1')).toBe('');
  });

  it('writes Texuli’s canonical chart names and clears legacy ones left on the root', () => {
    root.style.setProperty('--tx-chart1', '#000000');
    root.style.setProperty('--tx-seq-3', '#000000');
    const theme = getTheme('ocean');
    applyAppearance(root, { theme, resolvedMode: 'dark' });
    expect(tokenToCssVar('chart1')).toBe('--tx-chart-1');
    expect(tokenToCssVar('primaryForeground')).toBe('--tx-primary-foreground');
    expect(root.style.getPropertyValue('--tx-chart-1')).toBe(theme.dark.chart1);
    expect(root.style.getPropertyValue('--tx-chart-5')).toBe(theme.dark.chart5);
    expect(root.style.getPropertyValue('--tx-chart1')).toBe('');
    expect(root.style.getPropertyValue('--tx-seq-3')).toBe('');
  });
});

describe('style preset overrides', () => {
  beforeEach(resetRoot);
  afterEach(resetRoot);

  it('keeps the core override ids in sync with the theme presets', () => {
    expect(RADIUS_PRESET_IDS).toEqual(RADIUS_PRESETS.map((p) => p.id));
    expect(MOTION_PRESET_IDS).toEqual(MOTION_PRESETS.map((p) => p.id));
    expect(ELEVATION_STYLES).toEqual(ELEVATION_PRESETS.map((p) => p.id));
    expect(FONT_PAIRING_IDS).toEqual(FONT_PRESETS.map((p) => p.id));
    expect(FONT_PAIRING_IDS).toEqual(FONT_CATALOG.map((p) => p.id));
  });

  it('applies radius, elevation, font and motion on top of the theme', () => {
    const applied = applyAppearance(root, {
      theme: applyStylePresets(violetTheme, {
        radius: 'pill',
        elevation: 'flat',
        font: 'editorial',
        motion: 'expressive',
      }),
      resolvedMode: 'light',
    });
    const editorial = getFontPairing('editorial');
    expect(root.dataset.pyTheme).toBe('violet');
    expect(root.style.getPropertyValue('--tx-radius')).toBe('9999px');
    expect(root.style.getPropertyValue('--tx-elevation-style')).toBe('flat');
    expect(root.style.getPropertyValue('--tx-shadow-soft')).toBe('none');
    expect(root.style.getPropertyValue('--tx-font-heading')).toBe(
      editorial?.fontFamilyHeading.replaceAll('--tx-', '--tx-')
    );
    expect(root.style.getPropertyValue('--tx-motion-base')).toBe('300ms');
    expect(root.style.getPropertyValue('--tx-motion-easing')).toBe(
      'cubic-bezier(0.34, 1.56, 0.64, 1)'
    );
    // Component profiles follow the merged theme (pill buttons, bordered flat cards).
    expect(applied.components).toEqual({ button: 'pill', card: 'bordered' });
    expect(root.dataset.pyButtonStyle).toBe('pill');
    // The theme's colors are untouched.
    expect(root.style.getPropertyValue('--tx-primary')).toBe(violetTheme.light.primary);
  });

  it('keeps reduced motion and the density override above the presets', () => {
    applyAppearance(root, {
      theme: applyStylePresets(violetTheme, { motion: 'expressive', density: 'spacious' }),
      resolvedMode: 'light',
      reducedMotion: true,
      density: 0.75,
    });
    expect(root.style.getPropertyValue('--tx-motion-base')).toBe('0ms');
    expect(root.style.getPropertyValue('--tx-density')).toBe('0.75');
  });

  it('writes exactly the theme variables for an empty selection and reverts when cleared', () => {
    const plain = themeVariables({ theme: violetTheme, resolvedMode: 'light' });
    expect(
      themeVariables({ theme: applyStylePresets(violetTheme, {}), resolvedMode: 'light' })
    ).toEqual(plain);
    applyAppearance(root, {
      theme: applyStylePresets(violetTheme, { radius: 'square', elevation: 'glow' }),
      resolvedMode: 'light',
    });
    expect(root.dataset.pyButtonStyle).toBe('square');
    applyAppearance(root, { theme: violetTheme, resolvedMode: 'light' });
    expect(root.style.getPropertyValue('--tx-radius')).toBe(plain['--tx-radius']);
    expect(root.style.getPropertyValue('--tx-shadow-float')).toBe(plain['--tx-shadow-float']);
    expect(root.dataset.pyButtonStyle).toBeUndefined();
  });

  it('replays the overridden style through the no-flash script', () => {
    const applied = applyAppearance(root, {
      theme: applyStylePresets(violetTheme, { radius: 'pill', elevation: 'flat' }),
      resolvedMode: 'light',
    });
    cacheAppearance('styled', applied);
    resetRootStyleOnly();
    new Function(noFlashScript('styled'))();
    expect(root.style.getPropertyValue('--tx-radius')).toBe('9999px');
    expect(root.style.getPropertyValue('--tx-shadow-soft')).toBe('none');
    expect(root.dataset.pyButtonStyle).toBe('pill');
    expect(root.dataset.pyCardStyle).toBe('bordered');
  });
});

function resetRootStyleOnly() {
  clearAppearance(root);
  root.removeAttribute('style');
}

describe('base.css', () => {
  const css = readFileSync(resolve(import.meta.dirname, '../src/base.css'), 'utf8');

  it('maps every palette token into the Tailwind theme', () => {
    for (const token of Object.keys(violetTheme.light)) {
      const cssVar = tokenToCssVar(token);
      const twName = cssVar.replace('--tx-', '').replace(/^chart(\d)$/, 'chart-$1');
      const mapping =
        token === 'surface'
          ? `--color-${twName}: var(--tx-surface-fill, var(${cssVar}));`
          : token === 'elevated'
            ? `--color-${twName}: var(--tx-elevated-fill, var(${cssVar}));`
            : `--color-${twName}: var(${cssVar});`;
      expect(css, token).toContain(mapping);
    }
    expect(css).toContain('@custom-variant dark (&:where(.dark, .dark *));');
  });

  it('ships Violet defaults that match the preset (first paint before boot)', () => {
    for (const [token, value] of Object.entries(violetTheme.light)) {
      expect(css).toContain(`${tokenToCssVar(token)}: ${value};`);
    }
    const lightVars = themeVariables({ theme: violetTheme, resolvedMode: 'light' });
    const darkVars = themeVariables({ theme: violetTheme, resolvedMode: 'dark' });
    for (const name of ['--tx-primary-hover', '--tx-destructive-hover']) {
      expect(css).toContain(`${name}: ${lightVars[name]};`);
      expect(css.slice(css.indexOf(':root.dark'))).toContain(`${name}: ${darkVars[name]};`);
    }
    const darkBlock = css.slice(css.indexOf(':root.dark'));
    for (const [token, value] of Object.entries(violetTheme.dark)) {
      expect(darkBlock).toContain(`${tokenToCssVar(token)}: ${value};`);
    }
  });

  it('provides app-height and simulated safe-area utilities', () => {
    for (const utility of [
      'h-app',
      'min-h-app',
      'max-h-app',
      'pt-safe',
      'pb-safe',
      'pl-safe',
      'pr-safe',
      'px-safe',
    ]) {
      expect(css).toContain(`@utility ${utility} {`);
    }
    expect(css).toContain('--py-app-height: 100dvh;');
    expect(css).toContain('height: var(--tx-app-height, 100dvh);');
    expect(css).toContain('min-height: var(--tx-app-height, 100dvh);');
    expect(css).toContain('max-height: var(--tx-app-height, 100dvh);');

    for (const [side, inset] of [
      ['top', 'top'],
      ['bottom', 'bottom'],
      ['left', 'left'],
      ['right', 'right'],
    ]) {
      expect(css).toContain(`max(env(safe-area-inset-${inset}, 0px), var(--tx-safe-${side}, 0px))`);
    }
  });

  it('maps style dimensions and progressive glass surfaces into CSS tokens', () => {
    for (const token of [
      '--font-weight-normal: var(--tx-font-weight-body, 400);',
      '--text-base: var(--tx-font-size-base, 1rem);',
      '--default-border-width: var(--tx-border-width, 1px);',
      '--shadow-soft: var(--tx-shadow-soft,',
      '--duration-fast: var(--tx-motion-fast, 150ms);',
      '--tracking-heading: var(--tx-letter-spacing-heading, 0);',
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).not.toMatch(/^\s*--py-(?!app-height\b)[a-z0-9-]+\s*:/m);
    expect(css).toContain('[data-py-surface="glass"]');
    expect(css).toContain(
      '@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))'
    );
  });

  it('keeps the original appearance variables byte-identical for every built-in preset', () => {
    const canonicalNames = [
      ...Object.keys(violetTheme.light).map(tokenToCssVar),
      '--tx-primary-hover',
      '--tx-destructive-hover',
      '--tx-radius',
      '--tx-font-sans',
      '--tx-font-heading',
      '--tx-font-mono',
      '--tx-density',
      '--tx-motion',
    ];
    const snapshots = BUILTIN_THEMES.flatMap((theme) =>
      (['light', 'dark'] as const).map((resolvedMode) => {
        const variables = themeVariables({ theme, resolvedMode });
        return `${theme.id}/${resolvedMode}: ${JSON.stringify(
          Object.fromEntries(canonicalNames.map((name) => [name, variables[name]]))
        )}`;
      })
    );
    // chart2…chart5 moved deliberately (PLAN_003 Task 57): they now pass the chart rules in tests/charts.test.ts.
    expect(snapshots).toMatchInlineSnapshot(`
      [
        "violet/light: {"--tx-background":"#fafafa","--tx-foreground":"#09090b","--tx-surface":"#ffffff","--tx-surface-foreground":"#09090b","--tx-elevated":"#ffffff","--tx-muted":"#f4f4f5","--tx-muted-foreground":"#52525b","--tx-border":"#e4e4e7","--tx-input":"#d4d4d8","--tx-ring":"#8b5cf6","--tx-primary":"#7c3aed","--tx-primary-foreground":"#ffffff","--tx-secondary":"#f4f4f5","--tx-secondary-foreground":"#18181b","--tx-accent":"#f5f3ff","--tx-accent-foreground":"#4c1d95","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f4f4f5","--tx-sidebar-foreground":"#27272a","--tx-sidebar-border":"#e4e4e7","--tx-chart-1":"#7c3aed","--tx-chart-2":"#0284c7","--tx-chart-3":"#27a094","--tx-chart-4":"#c88000","--tx-chart-5":"#f43f5e","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#6b32cc","--tx-destructive-hover":"#9f1818","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "violet/dark: {"--tx-background":"#09090b","--tx-foreground":"#fafafa","--tx-surface":"#18181b","--tx-surface-foreground":"#fafafa","--tx-elevated":"#27272a","--tx-muted":"#27272a","--tx-muted-foreground":"#a1a1aa","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#a78bfa","--tx-primary":"#a78bfa","--tx-primary-foreground":"#2e1065","--tx-secondary":"#27272a","--tx-secondary-foreground":"#fafafa","--tx-accent":"#2e1065","--tx-accent-foreground":"#ede9fe","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#18181b","--tx-sidebar-foreground":"#e4e4e7","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#a78bfa","--tx-chart-2":"#38bdf8","--tx-chart-3":"#42e1cc","--tx-chart-4":"#fbbf24","--tx-chart-5":"#fb7185","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#b39bfb","--tx-destructive-hover":"#f98585","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "ocean/light: {"--tx-background":"#f8fafc","--tx-foreground":"#020617","--tx-surface":"#ffffff","--tx-surface-foreground":"#020617","--tx-elevated":"#ffffff","--tx-muted":"#f1f5f9","--tx-muted-foreground":"#475569","--tx-border":"#e2e8f0","--tx-input":"#cbd5e1","--tx-ring":"#3b82f6","--tx-primary":"#2563eb","--tx-primary-foreground":"#ffffff","--tx-secondary":"#f1f5f9","--tx-secondary-foreground":"#0f172a","--tx-accent":"#eff6ff","--tx-accent-foreground":"#1e3a8a","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f1f5f9","--tx-sidebar-foreground":"#1e293b","--tx-sidebar-border":"#e2e8f0","--tx-chart-1":"#2563eb","--tx-chart-2":"#0891b2","--tx-chart-3":"#4637d7","--tx-chart-4":"#00885f","--tx-chart-5":"#c88000","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#2055ca","--tx-destructive-hover":"#9f1818","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "ocean/dark: {"--tx-background":"#020617","--tx-foreground":"#f8fafc","--tx-surface":"#0f172a","--tx-surface-foreground":"#f8fafc","--tx-elevated":"#1e293b","--tx-muted":"#1e293b","--tx-muted-foreground":"#94a3b8","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#60a5fa","--tx-primary":"#60a5fa","--tx-primary-foreground":"#172554","--tx-secondary":"#1e293b","--tx-secondary-foreground":"#f8fafc","--tx-accent":"#172554","--tx-accent-foreground":"#dbeafe","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#0f172a","--tx-sidebar-foreground":"#e2e8f0","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#60a5fa","--tx-chart-2":"#22d3ee","--tx-chart-3":"#767fea","--tx-chart-4":"#34d399","--tx-chart-5":"#fbbf24","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#76b2fb","--tx-destructive-hover":"#f98585","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "emerald/light: {"--tx-background":"#f9fafb","--tx-foreground":"#030712","--tx-surface":"#ffffff","--tx-surface-foreground":"#030712","--tx-elevated":"#ffffff","--tx-muted":"#f3f4f6","--tx-muted-foreground":"#4b5563","--tx-border":"#e5e7eb","--tx-input":"#d1d5db","--tx-ring":"#059669","--tx-primary":"#047857","--tx-primary-foreground":"#ffffff","--tx-secondary":"#f3f4f6","--tx-secondary-foreground":"#111827","--tx-accent":"#ecfdf5","--tx-accent-foreground":"#064e3b","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f3f4f6","--tx-sidebar-foreground":"#1f2937","--tx-sidebar-border":"#e5e7eb","--tx-chart-1":"#059669","--tx-chart-2":"#007a70","--tx-chart-3":"#2090d4","--tx-chart-4":"#62a003","--tx-chart-5":"#a86b00","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#03674b","--tx-destructive-hover":"#9f1818","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "emerald/dark: {"--tx-background":"#030712","--tx-foreground":"#f9fafb","--tx-surface":"#111827","--tx-surface-foreground":"#f9fafb","--tx-elevated":"#1f2937","--tx-muted":"#1f2937","--tx-muted-foreground":"#9ca3af","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#34d399","--tx-primary":"#34d399","--tx-primary-foreground":"#022c22","--tx-secondary":"#1f2937","--tx-secondary-foreground":"#f9fafb","--tx-accent":"#022c22","--tx-accent-foreground":"#d1fae5","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#111827","--tx-sidebar-foreground":"#e5e7eb","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#34d399","--tx-chart-2":"#54efd9","--tx-chart-3":"#23b0ea","--tx-chart-4":"#a3e635","--tx-chart-5":"#edb200","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#50d9a7","--tx-destructive-hover":"#f98585","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "rose/light: {"--tx-background":"#fafaf9","--tx-foreground":"#0c0a09","--tx-surface":"#ffffff","--tx-surface-foreground":"#0c0a09","--tx-elevated":"#ffffff","--tx-muted":"#f5f5f4","--tx-muted-foreground":"#57534e","--tx-border":"#e7e5e4","--tx-input":"#d6d3d1","--tx-ring":"#f43f5e","--tx-primary":"#be123c","--tx-primary-foreground":"#ffffff","--tx-secondary":"#f5f5f4","--tx-secondary-foreground":"#1c1917","--tx-accent":"#fff1f2","--tx-accent-foreground":"#881337","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f5f5f4","--tx-sidebar-foreground":"#292524","--tx-sidebar-border":"#e7e5e4","--tx-chart-1":"#e11d48","--tx-chart-2":"#ea3983","--tx-chart-3":"#ea6730","--tx-chart-4":"#7c3aed","--tx-chart-5":"#986000","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#a30f34","--tx-destructive-hover":"#9f1818","--tx-radius":"0.875rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "rose/dark: {"--tx-background":"#0c0a09","--tx-foreground":"#fafaf9","--tx-surface":"#1c1917","--tx-surface-foreground":"#fafaf9","--tx-elevated":"#292524","--tx-muted":"#292524","--tx-muted-foreground":"#a8a29e","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#fb7185","--tx-primary":"#fb7185","--tx-primary-foreground":"#4c0519","--tx-secondary":"#292524","--tx-secondary-foreground":"#fafaf9","--tx-accent":"#4c0519","--tx-accent-foreground":"#ffe4e6","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#1c1917","--tx-sidebar-foreground":"#e7e5e4","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#fb7185","--tx-chart-2":"#ff82c2","--tx-chart-3":"#ffa461","--tx-chart-4":"#a78bfa","--tx-chart-5":"#fbbf24","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#fc8596","--tx-destructive-hover":"#f98585","--tx-radius":"0.875rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "amber/light: {"--tx-background":"#fafaf9","--tx-foreground":"#0c0a09","--tx-surface":"#ffffff","--tx-surface-foreground":"#0c0a09","--tx-elevated":"#ffffff","--tx-muted":"#f5f5f4","--tx-muted-foreground":"#57534e","--tx-border":"#e7e5e4","--tx-input":"#d6d3d1","--tx-ring":"#d97706","--tx-primary":"#b45309","--tx-primary-foreground":"#ffffff","--tx-secondary":"#f5f5f4","--tx-secondary-foreground":"#1c1917","--tx-accent":"#fffbeb","--tx-accent-foreground":"#78350f","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f5f5f4","--tx-sidebar-foreground":"#292524","--tx-sidebar-border":"#e7e5e4","--tx-chart-1":"#d97706","--tx-chart-2":"#d84e00","--tx-chart-3":"#bd0037","--tx-chart-4":"#059669","--tx-chart-5":"#2090d4","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#9b4708","--tx-destructive-hover":"#9f1818","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "amber/dark: {"--tx-background":"#0c0a09","--tx-foreground":"#fafaf9","--tx-surface":"#1c1917","--tx-surface-foreground":"#fafaf9","--tx-elevated":"#292524","--tx-muted":"#292524","--tx-muted-foreground":"#a8a29e","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#fbbf24","--tx-primary":"#fbbf24","--tx-primary-foreground":"#451a03","--tx-secondary":"#292524","--tx-secondary-foreground":"#fafaf9","--tx-accent":"#451a03","--tx-accent-foreground":"#fef3c7","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#1c1917","--tx-sidebar-foreground":"#e7e5e4","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#fbbf24","--tx-chart-2":"#fb923c","--tx-chart-3":"#fb7185","--tx-chart-4":"#34d399","--tx-chart-5":"#23b0ea","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#fcc843","--tx-destructive-hover":"#f98585","--tx-radius":"0.625rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "monochrome/light: {"--tx-background":"#fafafa","--tx-foreground":"#09090b","--tx-surface":"#ffffff","--tx-surface-foreground":"#09090b","--tx-elevated":"#ffffff","--tx-muted":"#f4f4f5","--tx-muted-foreground":"#52525b","--tx-border":"#e4e4e7","--tx-input":"#d4d4d8","--tx-ring":"#71717a","--tx-primary":"#18181b","--tx-primary-foreground":"#fafafa","--tx-secondary":"#f4f4f5","--tx-secondary-foreground":"#18181b","--tx-accent":"#e4e4e7","--tx-accent-foreground":"#18181b","--tx-destructive":"#b91c1c","--tx-destructive-foreground":"#ffffff","--tx-success":"#15803d","--tx-success-foreground":"#ffffff","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#0369a1","--tx-info-foreground":"#ffffff","--tx-sidebar":"#f4f4f5","--tx-sidebar-foreground":"#27272a","--tx-sidebar-border":"#e4e4e7","--tx-chart-1":"#18181b","--tx-chart-2":"#3f3f46","--tx-chart-3":"#71717a","--tx-chart-4":"#8f8f97","--tx-chart-5":"#555559","--tx-shadow":"rgb(15 23 42 / 0.08)","--tx-primary-hover":"#38383b","--tx-destructive-hover":"#9f1818","--tx-radius":"0.375rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
        "monochrome/dark: {"--tx-background":"#09090b","--tx-foreground":"#fafafa","--tx-surface":"#18181b","--tx-surface-foreground":"#fafafa","--tx-elevated":"#27272a","--tx-muted":"#27272a","--tx-muted-foreground":"#a1a1aa","--tx-border":"rgb(255 255 255 / 0.1)","--tx-input":"rgb(255 255 255 / 0.16)","--tx-ring":"#a1a1aa","--tx-primary":"#fafafa","--tx-primary-foreground":"#18181b","--tx-secondary":"#27272a","--tx-secondary-foreground":"#fafafa","--tx-accent":"#27272a","--tx-accent-foreground":"#f4f4f5","--tx-destructive":"#f87171","--tx-destructive-foreground":"#450a0a","--tx-success":"#4ade80","--tx-success-foreground":"#052e16","--tx-warning":"#fbbf24","--tx-warning-foreground":"#451a03","--tx-info":"#38bdf8","--tx-info-foreground":"#082f49","--tx-sidebar":"#18181b","--tx-sidebar-foreground":"#e4e4e7","--tx-sidebar-border":"rgb(255 255 255 / 0.08)","--tx-chart-1":"#fafafa","--tx-chart-2":"#d2d2d6","--tx-chart-3":"#888891","--tx-chart-4":"#65656e","--tx-chart-5":"#acacb7","--tx-shadow":"rgb(0 0 0 / 0.45)","--tx-primary-hover":"#d7d7d7","--tx-destructive-hover":"#f98585","--tx-radius":"0.375rem","--tx-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--tx-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--tx-density":"1","--tx-motion":"1"}",
      ]
    `);
  });

  it('keeps glass fills solid when backdrop-filter is unsupported', () => {
    const supportStart = css.indexOf('@supports (backdrop-filter: blur(1px))');
    expect(supportStart).toBeGreaterThan(-1);
    const glassRules = css.slice(supportStart);
    expect(glassRules).toMatch(/--tx-surface-fill: color-mix\(\s*in srgb,\s*var\(--tx-surface\)/);
    expect(glassRules).toContain('backdrop-filter: blur(var(--tx-glass-blur, 16px));');
  });
});
