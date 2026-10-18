import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { tokenToCssVar } from '@protoyard/core';
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
    const applied = applyAppearance(root, { theme: oceanTheme, resolvedMode: 'dark' });
    cacheAppearance('crm-demo', applied);
    resetRootStyleOnly();
    new Function(noFlashScript('crm-demo'))();
    expect(root.classList.contains('dark')).toBe(true);
    expect(root.dataset.pyTheme).toBe('ocean');
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
      expect(css, token).toContain(`--color-${twName}: var(${cssVar});`);
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
});
