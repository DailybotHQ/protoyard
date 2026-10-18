import { BUILTIN_THEMES, THEME_LIBRARY_META } from '@protoyard/themes';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import ThemePreview from '../src/components/ThemePreview.svelte';
import {
  activateTheme,
  exportThemeJson,
  filterLibraryThemes,
  listThemeCategories,
} from '../src/lib/theme-lab.ts';

afterEach(() => cleanup());

describe('theme lab catalog', () => {
  it('offers sorted product categories and filters library metadata', () => {
    const categories = listThemeCategories(THEME_LIBRARY_META);
    expect(categories.length).toBeGreaterThan(1);
    expect(categories).toEqual([...categories].sort((a, b) => a.localeCompare(b)));
    expect(
      filterLibraryThemes(THEME_LIBRARY_META, 'fintech').every(
        (theme) => theme.category === 'fintech'
      )
    ).toBe(true);
    expect(filterLibraryThemes(THEME_LIBRARY_META, 'all')).toEqual(THEME_LIBRARY_META);
  });

  it('uses the runtime export path, with a compatible envelope for lazy library themes', () => {
    const theme = BUILTIN_THEMES[0];
    if (!theme) throw new Error('expected a built-in theme');
    const exportFromRuntime = vi.fn(() => '{"format":"protoyard-theme/v1"}');
    expect(exportThemeJson(theme, exportFromRuntime)).toBe('{"format":"protoyard-theme/v1"}');
    expect(exportFromRuntime).toHaveBeenCalledWith(theme.id);

    const fallback = JSON.parse(
      exportThemeJson(theme, () => {
        throw new Error('not loaded');
      })
    );
    expect(fallback).toMatchObject({ format: 'protoyard-theme/v1', theme: { id: theme.id } });
  });

  it('registers a lazy library theme before selecting it in the runtime', async () => {
    const theme = BUILTIN_THEMES[0];
    if (!theme) throw new Error('expected a built-in theme');
    const saveCustom = vi.fn(async () => theme);
    const setOverride = vi.fn(async () => {});
    const controller = { themes: () => [], setOverride };
    await activateTheme(theme, controller, saveCustom);
    expect(saveCustom).toHaveBeenCalledWith(theme);
    expect(setOverride).toHaveBeenCalledWith({ themeId: theme.id });
  });
});

describe('theme previews', () => {
  it('shows every button and badge variant beside the scoped light or dark tokens', () => {
    const theme = BUILTIN_THEMES[0];
    if (!theme) throw new Error('expected a built-in theme');
    render(ThemePreview, { props: { theme, mode: 'light', compact: true } });
    for (const variant of ['Default', 'Secondary', 'Destructive', 'Outline', 'Ghost', 'Link']) {
      expect(screen.getByRole('button', { name: variant })).toBeTruthy();
    }
    for (const variant of [
      'Default',
      'Secondary',
      'Outline',
      'Success',
      'Warning',
      'Info',
      'Destructive',
    ]) {
      expect(screen.getByText(variant, { selector: 'span' })).toBeTruthy();
    }
  });
});
