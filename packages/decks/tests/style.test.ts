import { DEFAULT_THEME_ID, FONT_CATALOG, THEME_LIBRARY_META } from '@protoyard/themes';
import { describe, expect, it } from 'vitest';
import { resolveDeckStyle } from '../src/style/index.ts';

describe('resolveDeckStyle', () => {
  it('resolves built-in and library themes into appearance variables', async () => {
    const builtin = await resolveDeckStyle({ theme: DEFAULT_THEME_ID });
    expect(builtin.appearance.theme.id).toBe(DEFAULT_THEME_ID);
    expect(builtin.variables['--py-background']).toBeTruthy();

    const libraryId = THEME_LIBRARY_META[0]?.id;
    expect(libraryId).toBeDefined();
    const library = await resolveDeckStyle({ theme: libraryId });
    expect(library.appearance.theme.id).toBe(libraryId);
  });

  it('creates deterministic palette themes from unsigned seeds', async () => {
    const first = await resolveDeckStyle({ paletteSeed: 0x12ab34 });
    const second = await resolveDeckStyle({ paletteSeed: 0x12ab34 });
    expect(first.appearance.theme.light).toEqual(second.appearance.theme.light);
    expect(first.appearance.theme.id).toBe('deck-seed-12ab34');
  });

  it('applies font pairings, density, radius, aspect and motion tokens', async () => {
    const font = FONT_CATALOG.find((entry) => entry.id === 'editorial');
    expect(font).toBeDefined();
    const resolved = await resolveDeckStyle({
      fontPair: 'editorial',
      density: 'spacious',
      radius: 'large',
      aspect: '9:16',
      motion: 'none',
    });
    expect(resolved.variables['--py-font-heading']).toBe(font?.fontFamilyHeading);
    expect(resolved.variables['--py-deck-density']).toBe('1.25');
    expect(resolved.variables['--py-deck-radius']).toBe('1rem');
    expect(resolved.variables['--py-deck-aspect-ratio']).toBe('9 / 16');
    expect(resolved.appearance.reducedMotion).toBe(true);
  });

  it('merges slide overrides without losing deck-level settings', async () => {
    const resolved = await resolveDeckStyle(
      {
        theme: DEFAULT_THEME_ID,
        footer: 'Deck footer',
        logo: 'mark.svg',
        slideNumbers: true,
        progress: 'top',
        transition: 'fade',
      },
      {
        footer: 'Slide footer',
        background: 'gradient',
        progress: 'none',
        slideNumbers: false,
        transition: 'zoom',
      }
    );
    expect(resolved.style).toMatchObject({
      theme: DEFAULT_THEME_ID,
      footer: 'Slide footer',
      logo: 'mark.svg',
      background: 'gradient',
      progress: 'none',
      slideNumbers: false,
      transition: 'zoom',
    });
    expect(resolved.variables['--py-deck-progress']).toBe('none');
    expect(resolved.variables['--py-deck-background']).toBe('gradient');
    expect(resolved.variables['--py-deck-transition']).toBe('zoom');
    expect(resolved.variables['--py-deck-slide-numbers']).toBe('0');
  });

  it('falls back with warnings for unknown theme and font ids', async () => {
    const resolved = await resolveDeckStyle({ theme: 'missing-theme', fontPair: 'missing-font' });
    expect(resolved.appearance.theme.id).toBe(DEFAULT_THEME_ID);
    expect(resolved.warnings.map(({ code }) => code)).toEqual([
      'unknown-theme',
      'unknown-font-pair',
    ]);
  });

  it('allows the host to choose appearance mode and reduced motion', async () => {
    const resolved = await resolveDeckStyle({}, undefined, { mode: 'dark', reducedMotion: true });
    expect(resolved.appearance.resolvedMode).toBe('dark');
    expect(resolved.variables['--py-deck-slide-numbers']).toBe('1');
    expect(resolved.variables['--py-motion']).toBe('0');
  });
});
