import { tokenToCssVar } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appearanceCacheKey,
  applyAppearance,
  applyStylePresets,
  BUILTIN_THEMES,
  cacheAppearance,
  clearAppearance,
  getFontPairing,
  getTheme,
  mergeThemes,
  noFlashScript,
  oceanTheme,
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

  it('writes a unitless zero radius from any theme as a length, so calc() radius steps stay valid', () => {
    applyAppearance(root, { theme: { ...oceanTheme, radius: '0' }, resolvedMode: 'light' });
    expect(root.style.getPropertyValue('--tx-radius')).toBe('0px');
    applyAppearance(root, { theme: oceanTheme, resolvedMode: 'light' });
    expect(root.style.getPropertyValue('--tx-radius')).toBe(oceanTheme.radius);
  });
});

describe('no-flash cache', () => {
  beforeEach(resetRoot);
  afterEach(resetRoot);

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
});

describe('style preset overrides', () => {
  beforeEach(resetRoot);
  afterEach(resetRoot);

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
});

function resetRootStyleOnly() {
  clearAppearance(root);
  root.removeAttribute('style');
}
