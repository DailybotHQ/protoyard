import { PermissionDeniedError } from '@protoyard/core';
import type { ThemeControllerExtras } from '@protoyard/runtime';
import {
  BUILTIN_THEMES,
  createThemeFromSeed,
  loadLibraryTheme,
  THEME_LIBRARY_META,
} from '@protoyard/themes';
import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHarness } from '../../../tests/support/runtime.ts';
import ThemePreview from '../src/components/ThemePreview.svelte';
import type { UiKitDatabase } from '../src/database/schema.ts';
import { createThemeLabServices } from '../src/domain/themes.ts';
import {
  activateTheme,
  auditThemeContrast,
  auditThemesContrast,
  exportThemeJson,
  filterLibraryThemes,
  listThemeCategories,
} from '../src/lib/theme-lab.ts';
import { definition } from '../src/prototype.ts';

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

  it('registers a lazy library theme through the Theme Lab service', async () => {
    const theme = BUILTIN_THEMES[0];
    if (!theme) throw new Error('expected a built-in theme');
    const activate = vi.fn(async () => theme);
    await activateTheme(theme, { activate });
    expect(activate).toHaveBeenCalledWith(theme);
  });

  it('audits built-in, library and custom themes for WCAG pairs', async () => {
    const library = await loadLibraryTheme(THEME_LIBRARY_META[0]!.id);
    const custom = createThemeFromSeed({
      id: 'lab-custom-audit',
      name: 'Lab Custom',
      seed: '#0f766e',
    });
    for (const theme of [BUILTIN_THEMES[0]!, library, custom]) {
      for (const mode of ['light', 'dark'] as const) {
        const row = auditThemeContrast(theme, mode);
        expect(row.failing, `${theme.id} ${mode}`).toEqual([]);
        expect(row.lowest, `${theme.id} ${mode}`).toBeGreaterThanOrEqual(3);
      }
    }
    const sweep = auditThemesContrast([library, custom]);
    expect(sweep).toHaveLength(4);
    expect(sweep.every((row) => row.failing.length === 0)).toBe(true);
  });
});

describe('theme lab services', () => {
  let harness = createHarness<UiKitDatabase>(definition);
  afterEach(() => {
    harness.closeAll();
    harness = createHarness<UiKitDatabase>(definition);
  });

  it('saves custom themes through assert and environment.run and surfaces the 24-theme limit', async () => {
    const runtime = await harness.boot();
    const extras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;
    const services = createThemeLabServices(runtime, extras);
    const draft = createThemeFromSeed({
      id: 'ui-kit-lab-one',
      name: 'UI Kit Lab One',
      seed: '#2563eb',
    });
    const saved = await services.saveCustom(draft);
    expect(saved.id).toBe('ui-kit-lab-one');
    expect(extras.customThemes().some((theme) => theme.id === 'ui-kit-lab-one')).toBe(true);

    // Fill remaining slots to the 24-theme cap, then expect a validation error.
    const already = extras.customThemes().length;
    for (let i = already; i < 24; i += 1) {
      await services.saveCustom(
        createThemeFromSeed({
          id: `ui-kit-fill-${i}`,
          name: `Fill ${i}`,
          seed: '#111827',
        })
      );
    }
    await expect(
      services.saveCustom(
        createThemeFromSeed({
          id: 'ui-kit-overflow',
          name: 'Overflow',
          seed: '#b91c1c',
        })
      )
    ).rejects.toMatchObject({
      name: 'ValidationError',
      issues: expect.objectContaining({
        form: expect.stringMatching(/24 custom themes/i),
      }),
    });
  });

  it('denies theme saves for the viewer role', async () => {
    const runtime = await harness.boot('dark-viewer');
    const extras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;
    const services = createThemeLabServices(runtime, extras);
    await expect(
      services.saveCustom(
        createThemeFromSeed({ id: 'viewer-theme', name: 'Viewer', seed: '#7c3aed' })
      )
    ).rejects.toBeInstanceOf(PermissionDeniedError);
  });

  it('lets a viewer apply a library theme that is not yet registered', async () => {
    const runtime = await harness.boot('dark-viewer');
    const extras = runtime.theme as typeof runtime.theme & ThemeControllerExtras;
    const services = createThemeLabServices(runtime, extras);
    const library = await loadLibraryTheme(THEME_LIBRARY_META[0]!.id);
    expect(runtime.theme.themes().some((theme) => theme.id === library.id)).toBe(false);
    const applied = await services.activate(library);
    expect(applied.id).toBe(library.id);
    expect(runtime.theme.appearance().theme.value).toBe(library.id);
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
