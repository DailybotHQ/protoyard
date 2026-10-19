import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineTheme, tokenToCssVar } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appearanceCacheKey,
  applyAppearance,
  BUILTIN_THEMES,
  cacheAppearance,
  clearAppearance,
  getTheme,
  mergeThemes,
  noFlashScript,
  oceanTheme,
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
    expect(root.style.getPropertyValue('--py-density')).toBe('0.875');
    expect(applied.density).toBe(0.875);

    applyAppearance(root, { theme: oceanTheme, resolvedMode: 'light' });
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--py-primary')).toBe(oceanTheme.light.primary);
    expect(root.dataset.pyMotion).toBe('full');
  });

  it('can scope a theme to one element without touching the document', () => {
    const preview = document.createElement('div');
    document.body.append(preview);
    applyAppearance(preview, { theme: violetTheme, resolvedMode: 'dark' });
    expect(preview.classList.contains('dark')).toBe(true);
    expect(preview.style.getPropertyValue('--py-background')).toBe(violetTheme.dark.background);
    expect(root.classList.contains('dark')).toBe(false);
    expect(root.style.getPropertyValue('--py-background')).toBe('');
    clearAppearance(preview);
    expect(preview.style.getPropertyValue('--py-background')).toBe('');
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
      '--py-font-size-base': '1rem',
      '--py-font-size-lg': '1.25rem',
      '--py-font-weight-body': '450',
      '--py-font-weight-heading': '650',
      '--py-letter-spacing-body': '0.01em',
      '--py-radius-scale': '1.5',
      '--py-border-width': '2px',
      '--py-elevation-style': 'glow',
      '--py-shadow-soft': '0 0 12px color-mix(in oklab, var(--py-primary) 24%, transparent)',
      '--py-surface-style': 'glass',
      '--py-motion-fast': '100ms',
      '--py-motion-base': '250ms',
      '--py-motion-easing': 'ease-out',
    });

    const applied = applyAppearance(root, { theme: styledTheme, resolvedMode: 'light' });
    expect(root.dataset.pySurface).toBe('glass');
    expect(applied.vars['--py-font-size-lg']).toBe('1.25rem');
    clearAppearance(root);
    expect(root.style.getPropertyValue('--py-font-size-lg')).toBe('');
    expect(root.dataset.pySurface).toBeUndefined();
  });

  it('zeros motion tokens for an explicit reduced-motion preference', () => {
    const styleTheme = defineTheme({
      ...oceanTheme,
      style: { motion: { durations: { fast: 100, base: 250, slow: 500 }, easing: 'ease-out' } },
    });
    expect(themeVariables({ theme: styleTheme, resolvedMode: 'light' })).toMatchObject({
      '--py-motion-fast': '100ms',
      '--py-motion-base': '250ms',
      '--py-motion-slow': '500ms',
      '--py-motion-easing': 'ease-out',
    });
    expect(
      themeVariables({ theme: styleTheme, resolvedMode: 'light', reducedMotion: true })
    ).toMatchObject({
      '--py-motion-fast': '0ms',
      '--py-motion-base': '0ms',
      '--py-motion-slow': '0ms',
      '--py-motion-easing': 'linear',
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
    expect(root.style.getPropertyValue('--py-primary')).toBe(oceanTheme.dark.primary);
  });

  it('ignores injected property names from a tampered cache', () => {
    localStorage.setItem(
      appearanceCacheKey('x'),
      JSON.stringify({ v: 1, mode: 'light', vars: { color: 'red', '--py-primary': '#123456' } })
    );
    new Function(noFlashScript('x'))();
    expect(root.style.getPropertyValue('color')).toBe('');
    expect(root.style.getPropertyValue('--py-primary')).toBe('#123456');
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
      const twName = cssVar.replace('--py-', '').replace(/^chart(\d)$/, 'chart-$1');
      const mapping =
        token === 'surface'
          ? `--color-${twName}: var(--py-surface-fill, var(${cssVar}));`
          : token === 'elevated'
            ? `--color-${twName}: var(--py-elevated-fill, var(${cssVar}));`
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
    for (const name of ['--py-primary-hover', '--py-destructive-hover']) {
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
    expect(css).toContain('height: var(--py-app-height, 100dvh);');
    expect(css).toContain('min-height: var(--py-app-height, 100dvh);');
    expect(css).toContain('max-height: var(--py-app-height, 100dvh);');

    for (const [side, inset] of [
      ['top', 'top'],
      ['bottom', 'bottom'],
      ['left', 'left'],
      ['right', 'right'],
    ]) {
      expect(css).toContain(`max(env(safe-area-inset-${inset}, 0px), var(--py-safe-${side}, 0px))`);
    }
  });

  it('maps style dimensions and progressive glass surfaces into CSS tokens', () => {
    for (const token of [
      '--font-weight-normal: var(--py-font-weight-body, 400);',
      '--text-base: var(--py-font-size-base, 1rem);',
      '--default-border-width: var(--py-border-width, 1px);',
      '--shadow-soft: var(--py-shadow-soft,',
      '--duration-fast: var(--py-motion-fast, 150ms);',
      '--tracking-heading: var(--py-letter-spacing-heading, 0);',
    ]) {
      expect(css).toContain(token);
    }
    expect(css).toContain('@media (prefers-reduced-motion: reduce)');
    expect(css).toContain('--py-motion-fast: 0ms !important;');
    expect(css).toContain('[data-py-surface="glass"]');
    expect(css).toContain(
      '@supports (backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))'
    );
  });

  it('keeps the original appearance variables byte-identical for every built-in preset', () => {
    const legacyNames = [
      ...Object.keys(violetTheme.light).map(tokenToCssVar),
      '--py-primary-hover',
      '--py-destructive-hover',
      '--py-radius',
      '--py-font-sans',
      '--py-font-heading',
      '--py-font-mono',
      '--py-density',
      '--py-motion',
    ];
    const snapshots = BUILTIN_THEMES.flatMap((theme) =>
      (['light', 'dark'] as const).map((resolvedMode) => {
        const variables = themeVariables({ theme, resolvedMode });
        return `${theme.id}/${resolvedMode}: ${JSON.stringify(
          Object.fromEntries(legacyNames.map((name) => [name, variables[name]]))
        )}`;
      })
    );
    // chart2…chart5 moved deliberately (PLAN_003 Task 57): they now pass the chart rules in tests/charts.test.ts.
    expect(snapshots).toMatchInlineSnapshot(`
      [
        "violet/light: {"--py-background":"#fafafa","--py-foreground":"#09090b","--py-surface":"#ffffff","--py-surface-foreground":"#09090b","--py-elevated":"#ffffff","--py-muted":"#f4f4f5","--py-muted-foreground":"#52525b","--py-border":"#e4e4e7","--py-input":"#d4d4d8","--py-ring":"#8b5cf6","--py-primary":"#7c3aed","--py-primary-foreground":"#ffffff","--py-secondary":"#f4f4f5","--py-secondary-foreground":"#18181b","--py-accent":"#f5f3ff","--py-accent-foreground":"#4c1d95","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f4f4f5","--py-sidebar-foreground":"#27272a","--py-sidebar-border":"#e4e4e7","--py-chart1":"#7c3aed","--py-chart2":"#0284c7","--py-chart3":"#27a094","--py-chart4":"#c88000","--py-chart5":"#f43f5e","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#6b32cc","--py-destructive-hover":"#9f1818","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "violet/dark: {"--py-background":"#09090b","--py-foreground":"#fafafa","--py-surface":"#18181b","--py-surface-foreground":"#fafafa","--py-elevated":"#27272a","--py-muted":"#27272a","--py-muted-foreground":"#a1a1aa","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#a78bfa","--py-primary":"#a78bfa","--py-primary-foreground":"#2e1065","--py-secondary":"#27272a","--py-secondary-foreground":"#fafafa","--py-accent":"#2e1065","--py-accent-foreground":"#ede9fe","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#18181b","--py-sidebar-foreground":"#e4e4e7","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#a78bfa","--py-chart2":"#38bdf8","--py-chart3":"#42e1cc","--py-chart4":"#fbbf24","--py-chart5":"#fb7185","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#b39bfb","--py-destructive-hover":"#f98585","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "ocean/light: {"--py-background":"#f8fafc","--py-foreground":"#020617","--py-surface":"#ffffff","--py-surface-foreground":"#020617","--py-elevated":"#ffffff","--py-muted":"#f1f5f9","--py-muted-foreground":"#475569","--py-border":"#e2e8f0","--py-input":"#cbd5e1","--py-ring":"#3b82f6","--py-primary":"#2563eb","--py-primary-foreground":"#ffffff","--py-secondary":"#f1f5f9","--py-secondary-foreground":"#0f172a","--py-accent":"#eff6ff","--py-accent-foreground":"#1e3a8a","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f1f5f9","--py-sidebar-foreground":"#1e293b","--py-sidebar-border":"#e2e8f0","--py-chart1":"#2563eb","--py-chart2":"#0891b2","--py-chart3":"#4637d7","--py-chart4":"#00885f","--py-chart5":"#c88000","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#2055ca","--py-destructive-hover":"#9f1818","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "ocean/dark: {"--py-background":"#020617","--py-foreground":"#f8fafc","--py-surface":"#0f172a","--py-surface-foreground":"#f8fafc","--py-elevated":"#1e293b","--py-muted":"#1e293b","--py-muted-foreground":"#94a3b8","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#60a5fa","--py-primary":"#60a5fa","--py-primary-foreground":"#172554","--py-secondary":"#1e293b","--py-secondary-foreground":"#f8fafc","--py-accent":"#172554","--py-accent-foreground":"#dbeafe","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#0f172a","--py-sidebar-foreground":"#e2e8f0","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#60a5fa","--py-chart2":"#22d3ee","--py-chart3":"#767fea","--py-chart4":"#34d399","--py-chart5":"#fbbf24","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#76b2fb","--py-destructive-hover":"#f98585","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "emerald/light: {"--py-background":"#f9fafb","--py-foreground":"#030712","--py-surface":"#ffffff","--py-surface-foreground":"#030712","--py-elevated":"#ffffff","--py-muted":"#f3f4f6","--py-muted-foreground":"#4b5563","--py-border":"#e5e7eb","--py-input":"#d1d5db","--py-ring":"#059669","--py-primary":"#047857","--py-primary-foreground":"#ffffff","--py-secondary":"#f3f4f6","--py-secondary-foreground":"#111827","--py-accent":"#ecfdf5","--py-accent-foreground":"#064e3b","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f3f4f6","--py-sidebar-foreground":"#1f2937","--py-sidebar-border":"#e5e7eb","--py-chart1":"#059669","--py-chart2":"#007a70","--py-chart3":"#2090d4","--py-chart4":"#62a003","--py-chart5":"#a86b00","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#03674b","--py-destructive-hover":"#9f1818","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "emerald/dark: {"--py-background":"#030712","--py-foreground":"#f9fafb","--py-surface":"#111827","--py-surface-foreground":"#f9fafb","--py-elevated":"#1f2937","--py-muted":"#1f2937","--py-muted-foreground":"#9ca3af","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#34d399","--py-primary":"#34d399","--py-primary-foreground":"#022c22","--py-secondary":"#1f2937","--py-secondary-foreground":"#f9fafb","--py-accent":"#022c22","--py-accent-foreground":"#d1fae5","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#111827","--py-sidebar-foreground":"#e5e7eb","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#34d399","--py-chart2":"#54efd9","--py-chart3":"#23b0ea","--py-chart4":"#a3e635","--py-chart5":"#edb200","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#50d9a7","--py-destructive-hover":"#f98585","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "rose/light: {"--py-background":"#fafaf9","--py-foreground":"#0c0a09","--py-surface":"#ffffff","--py-surface-foreground":"#0c0a09","--py-elevated":"#ffffff","--py-muted":"#f5f5f4","--py-muted-foreground":"#57534e","--py-border":"#e7e5e4","--py-input":"#d6d3d1","--py-ring":"#f43f5e","--py-primary":"#be123c","--py-primary-foreground":"#ffffff","--py-secondary":"#f5f5f4","--py-secondary-foreground":"#1c1917","--py-accent":"#fff1f2","--py-accent-foreground":"#881337","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f5f5f4","--py-sidebar-foreground":"#292524","--py-sidebar-border":"#e7e5e4","--py-chart1":"#e11d48","--py-chart2":"#ea3983","--py-chart3":"#ea6730","--py-chart4":"#7c3aed","--py-chart5":"#986000","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#a30f34","--py-destructive-hover":"#9f1818","--py-radius":"0.875rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "rose/dark: {"--py-background":"#0c0a09","--py-foreground":"#fafaf9","--py-surface":"#1c1917","--py-surface-foreground":"#fafaf9","--py-elevated":"#292524","--py-muted":"#292524","--py-muted-foreground":"#a8a29e","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#fb7185","--py-primary":"#fb7185","--py-primary-foreground":"#4c0519","--py-secondary":"#292524","--py-secondary-foreground":"#fafaf9","--py-accent":"#4c0519","--py-accent-foreground":"#ffe4e6","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#1c1917","--py-sidebar-foreground":"#e7e5e4","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#fb7185","--py-chart2":"#ff82c2","--py-chart3":"#ffa461","--py-chart4":"#a78bfa","--py-chart5":"#fbbf24","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#fc8596","--py-destructive-hover":"#f98585","--py-radius":"0.875rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "amber/light: {"--py-background":"#fafaf9","--py-foreground":"#0c0a09","--py-surface":"#ffffff","--py-surface-foreground":"#0c0a09","--py-elevated":"#ffffff","--py-muted":"#f5f5f4","--py-muted-foreground":"#57534e","--py-border":"#e7e5e4","--py-input":"#d6d3d1","--py-ring":"#d97706","--py-primary":"#b45309","--py-primary-foreground":"#ffffff","--py-secondary":"#f5f5f4","--py-secondary-foreground":"#1c1917","--py-accent":"#fffbeb","--py-accent-foreground":"#78350f","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f5f5f4","--py-sidebar-foreground":"#292524","--py-sidebar-border":"#e7e5e4","--py-chart1":"#d97706","--py-chart2":"#d84e00","--py-chart3":"#bd0037","--py-chart4":"#059669","--py-chart5":"#2090d4","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#9b4708","--py-destructive-hover":"#9f1818","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "amber/dark: {"--py-background":"#0c0a09","--py-foreground":"#fafaf9","--py-surface":"#1c1917","--py-surface-foreground":"#fafaf9","--py-elevated":"#292524","--py-muted":"#292524","--py-muted-foreground":"#a8a29e","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#fbbf24","--py-primary":"#fbbf24","--py-primary-foreground":"#451a03","--py-secondary":"#292524","--py-secondary-foreground":"#fafaf9","--py-accent":"#451a03","--py-accent-foreground":"#fef3c7","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#1c1917","--py-sidebar-foreground":"#e7e5e4","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#fbbf24","--py-chart2":"#fb923c","--py-chart3":"#fb7185","--py-chart4":"#34d399","--py-chart5":"#23b0ea","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#fcc843","--py-destructive-hover":"#f98585","--py-radius":"0.625rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "monochrome/light: {"--py-background":"#fafafa","--py-foreground":"#09090b","--py-surface":"#ffffff","--py-surface-foreground":"#09090b","--py-elevated":"#ffffff","--py-muted":"#f4f4f5","--py-muted-foreground":"#52525b","--py-border":"#e4e4e7","--py-input":"#d4d4d8","--py-ring":"#71717a","--py-primary":"#18181b","--py-primary-foreground":"#fafafa","--py-secondary":"#f4f4f5","--py-secondary-foreground":"#18181b","--py-accent":"#e4e4e7","--py-accent-foreground":"#18181b","--py-destructive":"#b91c1c","--py-destructive-foreground":"#ffffff","--py-success":"#15803d","--py-success-foreground":"#ffffff","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#0369a1","--py-info-foreground":"#ffffff","--py-sidebar":"#f4f4f5","--py-sidebar-foreground":"#27272a","--py-sidebar-border":"#e4e4e7","--py-chart1":"#18181b","--py-chart2":"#3f3f46","--py-chart3":"#71717a","--py-chart4":"#8f8f97","--py-chart5":"#555559","--py-shadow":"rgb(15 23 42 / 0.08)","--py-primary-hover":"#38383b","--py-destructive-hover":"#9f1818","--py-radius":"0.375rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
        "monochrome/dark: {"--py-background":"#09090b","--py-foreground":"#fafafa","--py-surface":"#18181b","--py-surface-foreground":"#fafafa","--py-elevated":"#27272a","--py-muted":"#27272a","--py-muted-foreground":"#a1a1aa","--py-border":"rgb(255 255 255 / 0.1)","--py-input":"rgb(255 255 255 / 0.16)","--py-ring":"#a1a1aa","--py-primary":"#fafafa","--py-primary-foreground":"#18181b","--py-secondary":"#27272a","--py-secondary-foreground":"#fafafa","--py-accent":"#27272a","--py-accent-foreground":"#f4f4f5","--py-destructive":"#f87171","--py-destructive-foreground":"#450a0a","--py-success":"#4ade80","--py-success-foreground":"#052e16","--py-warning":"#fbbf24","--py-warning-foreground":"#451a03","--py-info":"#38bdf8","--py-info-foreground":"#082f49","--py-sidebar":"#18181b","--py-sidebar-foreground":"#e4e4e7","--py-sidebar-border":"rgb(255 255 255 / 0.08)","--py-chart1":"#fafafa","--py-chart2":"#d2d2d6","--py-chart3":"#888891","--py-chart4":"#65656e","--py-chart5":"#acacb7","--py-shadow":"rgb(0 0 0 / 0.45)","--py-primary-hover":"#d7d7d7","--py-destructive-hover":"#f98585","--py-radius":"0.375rem","--py-font-sans":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-heading":"'Inter Variable', Inter, ui-sans-serif, system-ui, sans-serif","--py-font-mono":"'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace","--py-density":"1","--py-motion":"1"}",
      ]
    `);
  });

  it('keeps glass fills solid when backdrop-filter is unsupported', () => {
    const supportStart = css.indexOf('@supports (backdrop-filter: blur(1px))');
    expect(supportStart).toBeGreaterThan(-1);
    const glassRules = css.slice(supportStart);
    expect(glassRules).toMatch(/--py-surface-fill: color-mix\(\s*in srgb,\s*var\(--py-surface\)/);
    expect(glassRules).toContain('backdrop-filter: blur(var(--py-glass-blur, 16px));');
  });
});
