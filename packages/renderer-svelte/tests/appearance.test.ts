import type { AppearanceState, PrototypeRuntime } from '@protoyard/core';
import {
  applyStylePresets,
  BUILTIN_THEMES,
  clearAppearance,
  readCachedAppearance,
  type StylePresetSelection,
} from '@protoyard/themes';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { bindAppearance } from '../src/appearance.ts';
import { styledTheme } from '../src/style-presets.ts';

const base: AppearanceState = {
  theme: { value: 'violet', source: 'default' },
  mode: { value: 'light', source: 'default' },
  resolvedMode: 'light',
  reducedMotion: { value: false, source: 'default' },
  density: { value: 1, source: 'default' },
  viewport: { value: 'desktop', source: 'default' },
  shell: { value: 'browser', source: 'default' },
  device: { value: 'desktop-window', source: 'default' },
  orientation: { value: 'landscape', source: 'default' },
  layout: { value: 'custom', source: 'default' },
};

/** The slice of a runtime `bindAppearance` reads, with a settable appearance. */
function stubRuntime() {
  let state = base;
  const listeners = new Set<(s: AppearanceState) => void>();
  const runtime = {
    manifest: { storage: { namespace: 'appearance-test' } },
    theme: {
      appearance: () => state,
      themes: () => BUILTIN_THEMES,
      subscribe(listener: (s: AppearanceState) => void) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      },
    },
  } as unknown as PrototypeRuntime;
  const set = (next: Partial<AppearanceState>) => {
    state = { ...base, ...next };
    for (const listener of listeners) listener(state);
  };
  return { runtime, set };
}

const root = document.documentElement;

describe('bindAppearance style presets', () => {
  afterEach(() => {
    clearAppearance(root);
    root.removeAttribute('style');
    localStorage.clear();
  });

  it('applies and reverts live radius, elevation, font and motion presets without a reload', async () => {
    const { runtime, set } = stubRuntime();
    const stop = bindAppearance(runtime, BUILTIN_THEMES, root);
    const themeRadius = root.style.getPropertyValue('--py-radius');

    set({
      radius: { value: 'pill', source: 'override' },
      elevation: { value: 'flat', source: 'override' },
      font: { value: 'mono', source: 'scenario' },
      motion: { value: 'none', source: 'override' },
    });
    // The presets load on first use; until then the document keeps what it shows.
    expect(root.style.getPropertyValue('--py-radius')).toBe(themeRadius);
    await vi.waitFor(() => expect(root.style.getPropertyValue('--py-radius')).toBe('9999px'));
    expect(root.style.getPropertyValue('--py-shadow-soft')).toBe('none');
    expect(root.style.getPropertyValue('--py-motion-base')).toBe('0ms');
    expect(root.dataset.pyButtonStyle).toBe('pill');
    expect(root.dataset.pyTheme).toBe('violet');
    // The no-flash cache holds the overridden look, so a reload paints it first.
    expect(readCachedAppearance('appearance-test')?.vars['--py-radius']).toBe('9999px');

    set({ radius: { value: null, source: 'default' } });
    expect(root.style.getPropertyValue('--py-radius')).toBe(themeRadius);
    expect(root.dataset.pyButtonStyle).toBeUndefined();
    stop();
  });

  it('merges presets exactly like applyStylePresets, without re-parsing the theme', () => {
    const selections: StylePresetSelection[] = [
      {},
      { radius: 'square' },
      { elevation: 'glow', motion: 'none' },
      { radius: 'round', elevation: 'layered', font: 'editorial', motion: 'subtle' },
    ];
    for (const theme of BUILTIN_THEMES) {
      for (const selection of selections) {
        expect(styledTheme(theme, selection)).toEqual(applyStylePresets(theme, selection));
      }
    }
  });
});
