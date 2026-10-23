import { ThemeSchema, ThemeStyleSchema } from '@protoyard/core';
import { chartColorDistance, validateChartTokens } from '@texuli/tokens';
import {
  loadLibraryThemeDefinition as loadTexuliPortedDefinition,
  THEME_LIBRARY_META as TEXULI_PORTED_META,
} from '@texuli/tokens/library';
import {
  BUILTIN_PRESET_IDS,
  EXPAND_THEME_LIBRARY_META,
  loadFullLibraryTheme,
  loadFullLibraryThemeCharts,
} from '@texuli/tokens/library-expand';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  contrastRatio,
  parseHex,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '../src/contrast.ts';
import { FONT_CATALOG } from '../src/fonts.ts';
import { disableFullThemeLibrary, enableFullThemeLibrary } from '../src/library/full.ts';
import {
  clearLibraryThemeCache,
  findLibraryThemeMeta,
  getLibraryThemeMeta,
  isLibraryThemeId,
  LIBRARY_THEME_IDS,
  type LibraryThemeDefinition,
  listCollections,
  listThemeLibrary,
  loadAllFullLibraryThemes,
  loadAllLibraryThemes,
  loadFullLibraryMeta,
  loadLibraryTheme,
  loadLibraryThemeDefinition,
  searchThemeLibrary,
  THEME_COLLECTIONS,
  THEME_CONTRAST_LEVELS,
  THEME_LIBRARY_META,
  THEME_MOODS,
} from '../src/library/index.ts';
import { rgbToOklch } from '../src/oklch.ts';
import { NEUTRAL_FAMILIES } from '../src/palette.ts';
import { BUILTIN_THEMES } from '../src/presets.ts';
import { SHARED_PALETTE_ROLES } from '../src/texuli.ts';
import { LIBRARY_THEME_DEFINITIONS } from './fixtures/library-definitions.ts';

// These suites cover the full library (204 themes); the default is the catalog.
beforeAll(() => enableFullThemeLibrary());
afterAll(() => disableFullThemeLibrary());

afterEach(() => {
  clearLibraryThemeCache();
});

const loadDefinitions = async () =>
  Promise.all((await loadFullLibraryMeta()).map((meta) => loadLibraryThemeDefinition(meta.id)));

describe('the library comes from @texuli/tokens', () => {
  it('holds every Texuli library theme except the six Protoyard built-ins, each once', async () => {
    const builtins = new Set<string>(BUILTIN_PRESET_IDS);
    const texuli = [...TEXULI_PORTED_META, ...EXPAND_THEME_LIBRARY_META]
      .map((meta) => meta.id)
      .filter((id) => !builtins.has(id));
    const full = await loadFullLibraryMeta();
    expect(full.map((meta) => meta.id)).toEqual(texuli);
    expect(new Set(texuli).size).toBe(texuli.length);
    expect(await loadFullLibraryMeta()).toBe(full);
    // The synchronous catalog is the ported set, first in the full library.
    expect(THEME_LIBRARY_META.map((meta) => meta.id)).toEqual(
      TEXULI_PORTED_META.map((meta) => meta.id)
    );
    expect(full.slice(0, THEME_LIBRARY_META.length)).toEqual([...THEME_LIBRARY_META]);
    // Built-ins stay BUILTIN_THEMES: no picker shows an id twice.
    for (const theme of BUILTIN_THEMES) {
      expect(await findLibraryThemeMeta(theme.id)).toBeUndefined();
    }
    // 200+ themes are available to prototypes: the full library plus the built-ins.
    expect(full.length + BUILTIN_THEMES.length).toBeGreaterThanOrEqual(200);
  });

  it('serves the catalog from Texuli, field-identical to the 64 definitions Protoyard used to own', async () => {
    // Protoyard no longer ships these definitions: the catalog, its metadata
    // and its definitions are Texuli's port. The fixture is the last copy
    // Protoyard defined; any drift in Texuli's port fails here.
    expect(LIBRARY_THEME_DEFINITIONS.map((definition) => definition.id)).toEqual(
      TEXULI_PORTED_META.map((meta) => meta.id)
    );
    for (const definition of LIBRARY_THEME_DEFINITIONS) {
      expect(await loadTexuliPortedDefinition(definition.id), definition.id).toEqual(definition);
      expect(await loadLibraryThemeDefinition(definition.id), definition.id).toEqual(definition);
    }
    expect(THEME_LIBRARY_META).toBe(TEXULI_PORTED_META);
  });

  it('keeps the boot-path id list equal, in order, to the catalog Texuli ports', () => {
    expect(LIBRARY_THEME_IDS).toEqual(TEXULI_PORTED_META.map((meta) => meta.id));
    for (const meta of THEME_LIBRARY_META) expect(isLibraryThemeId(meta.id), meta.id).toBe(true);
    for (const theme of BUILTIN_THEMES) expect(isLibraryThemeId(theme.id), theme.id).toBe(false);
    expect(isLibraryThemeId('no-such-theme')).toBe(false);
  });

  it('offers only the catalog until a page enables the full library', async () => {
    disableFullThemeLibrary();
    clearLibraryThemeCache();
    try {
      const expandedId = EXPAND_THEME_LIBRARY_META.find(
        (meta) => !(BUILTIN_PRESET_IDS as readonly string[]).includes(meta.id)
      )?.id as string;
      expect(await loadFullLibraryMeta()).toBe(THEME_LIBRARY_META);
      expect(await findLibraryThemeMeta(expandedId)).toBeUndefined();
      await expect(loadLibraryTheme(expandedId)).rejects.toThrow(/Unknown library theme/);
      await expect(loadLibraryThemeDefinition(expandedId)).rejects.toThrow(/Unknown library theme/);
      // Catalog themes load as always, with tokens from @texuli/tokens.
      expect((await loadLibraryTheme('fintech-ledger')).id).toBe('fintech-ledger');
    } finally {
      enableFullThemeLibrary();
      clearLibraryThemeCache();
    }
  });

  it('finds and loads expanded themes on demand, by id', async () => {
    const expandedId = EXPAND_THEME_LIBRARY_META.find(
      (meta) => !(BUILTIN_PRESET_IDS as readonly string[]).includes(meta.id)
    )?.id as string;
    expect(getLibraryThemeMeta(expandedId)).toBeUndefined();
    expect((await findLibraryThemeMeta(expandedId))?.id).toBe(expandedId);
    const theme = await loadLibraryTheme(expandedId);
    expect(ThemeSchema.parse(theme).id).toBe(expandedId);
    expect((await loadLibraryThemeDefinition(expandedId)).id).toBe(expandedId);
  });

  it("converts each theme with Texuli's own values: shared roles, chart roles and chart tokens", async () => {
    const mismatches: string[] = [];
    for (const meta of await loadFullLibraryMeta()) {
      const [theme, source, charts] = await Promise.all([
        loadLibraryTheme(meta.id),
        loadFullLibraryTheme(meta.id),
        loadFullLibraryThemeCharts(meta.id),
      ]);
      for (const mode of ['light', 'dark'] as const) {
        for (const role of SHARED_PALETTE_ROLES) {
          if (theme[mode][role] !== source[mode][role].default) {
            mismatches.push(`${meta.id}/${mode}/${role}`);
          }
        }
        charts[mode].categorical.slice(0, 5).forEach((color, index) => {
          const role = `chart${index + 1}` as 'chart1';
          if (theme[mode][role] !== color) mismatches.push(`${meta.id}/${mode}/${role}`);
        });
        expect(theme.charts?.[mode].categorical, meta.id).toEqual([...charts[mode].categorical]);
      }
      expect(theme.radius).toBe(source.radius);
      expect(theme.fontFamily).toBe(source.fontFamily);
      expect(theme.style).toEqual(source.style);
    }
    expect(mismatches).toEqual([]);
  }, 30_000); // heavy: every library theme through Texuli and back
});

describe('theme library registry', () => {
  it('ships unique themes with category metadata', () => {
    const ids = THEME_LIBRARY_META.map((meta) => meta.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const meta of THEME_LIBRARY_META) {
      expect(meta.id).toMatch(/^[a-z][a-z0-9-]*$/);
      expect(meta.name.length).toBeGreaterThan(0);
      expect(meta.category.length).toBeGreaterThan(0);
      expect(meta.seed).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(meta.tags.length).toBeGreaterThan(0);
    }
    expect(getLibraryThemeMeta('fintech-ledger')?.category).toBe('fintech');
    expect(listThemeLibrary({ category: 'accessible' }).length).toBeGreaterThanOrEqual(2);
    expect(listThemeLibrary({ tag: 'neon' }).some((m) => m.id === 'gaming-neon')).toBe(true);
  });

  it('loads tokens lazily and caches the result', async () => {
    const first = await loadLibraryTheme('glass-frost');
    const second = await loadLibraryTheme('glass-frost');
    expect(first).toBe(second);
    expect(ThemeSchema.parse(first)).toEqual(first);
    expect(first.style.surface).toBe('glass');
    await expect(loadLibraryTheme('not-a-theme')).rejects.toThrow(/Unknown library theme/);
    await expect(loadLibraryTheme('violet')).rejects.toThrow(/Unknown library theme/);
    await expect(loadLibraryThemeDefinition('violet')).rejects.toThrow(/Unknown library theme/);
    await expect(loadLibraryThemeDefinition('not-a-theme')).rejects.toThrow(
      /Unknown library theme/
    );
  });

  it('every library theme × mode meets WCAG AA for text and UI pairs', async () => {
    const themes = await loadAllFullLibraryThemes();
    expect(themes.length).toBe((await loadFullLibraryMeta()).length);
    expect((await loadAllLibraryThemes()).length).toBe(THEME_LIBRARY_META.length);
    const failures: string[] = [];
    for (const theme of themes) {
      ThemeSchema.parse(theme);
      for (const mode of ['light', 'dark'] as const) {
        const palette = theme[mode];
        for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 4.5)
            failures.push(`${theme.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
        }
        for (const [fg, bg] of UI_CONTRAST_PAIRS) {
          const ratio = contrastRatio(palette[fg], palette[bg]);
          if (ratio < 3)
            failures.push(`${theme.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)} (UI)`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('theme values stay inside the hardened ThemeSchema', () => {
  it('every built-in and library theme passes the color, font and radius guards', async () => {
    const themes = [...BUILTIN_THEMES, ...(await loadAllFullLibraryThemes())];
    expect(themes.length).toBeGreaterThan(BUILTIN_THEMES.length);
    for (const theme of themes) {
      const result = ThemeSchema.safeParse(theme);
      expect(result.success, `${theme.id}: ${result.error?.message ?? ''}`).toBe(true);
    }
  });
});

/** Every rule a library definition must follow; the style profile goes through core's zod schema. */
function definitionIssues(definition: LibraryThemeDefinition): string[] {
  const issues: string[] = [];
  const hex = /^#[0-9a-f]{6}$/i;
  if (!/^[a-z][a-z0-9-]*$/.test(definition.id)) issues.push('id is not kebab-case');
  if (!definition.name || definition.name.length > 40) issues.push('name must be 1–40 characters');
  if (!definition.description) issues.push('description is empty');
  if (!definition.category) issues.push('category is empty');
  if (!definition.tags.length || definition.tags.some((tag) => tag !== tag.toLowerCase())) {
    issues.push('tags must be non-empty and lowercase');
  }
  if (!hex.test(definition.seed)) issues.push(`seed ${definition.seed} is not #rrggbb`);
  if (definition.secondary !== undefined && !hex.test(definition.secondary)) {
    issues.push(`secondary ${definition.secondary} is not #rrggbb`);
  }
  if (definition.font !== undefined && !FONT_CATALOG.some((font) => font.id === definition.font)) {
    issues.push(`unknown font ${definition.font}`);
  }
  if (definition.neutral !== undefined && !NEUTRAL_FAMILIES.includes(definition.neutral)) {
    issues.push(`unknown neutral ${definition.neutral}`);
  }
  if (definition.collection !== undefined && !THEME_COLLECTIONS.includes(definition.collection)) {
    issues.push(`unknown collection ${definition.collection}`);
  }
  for (const mood of definition.mood ?? []) {
    if (!THEME_MOODS.includes(mood)) issues.push(`unknown mood ${mood}`);
  }
  if (
    definition.contrastLevel !== undefined &&
    !THEME_CONTRAST_LEVELS.includes(definition.contrastLevel)
  ) {
    issues.push(`unknown contrast level ${definition.contrastLevel}`);
  }
  if (
    definition.density !== undefined &&
    (definition.density < 0.75 || definition.density > 1.25)
  ) {
    issues.push('density must be 0.75–1.25');
  }
  const style = ThemeStyleSchema.safeParse(definition.style ?? {});
  if (!style.success) issues.push(`style: ${style.error.message}`);
  return issues;
}

describe('library definitions', () => {
  it("validates every definition against Protoyard's rules: ids, seeds, fonts, neutrals, collections, moods and style", async () => {
    const definitions = await loadDefinitions();
    const failures = definitions.flatMap((definition) =>
      definitionIssues(definition).map((issue) => `${definition.id}: ${issue}`)
    );
    expect(failures).toEqual([]);
    expect(definitions.map((definition) => definition.id)).toEqual(
      (await loadFullLibraryMeta()).map((meta) => meta.id)
    );
  });

  it('catches malformed definitions', async () => {
    const base = await loadLibraryThemeDefinition('fintech-ledger');
    expect(
      definitionIssues({
        ...base,
        id: 'Bad Id',
        seed: 'teal',
        font: 'comic',
        collection: 'retro' as never,
        mood: ['grumpy' as never],
        contrastLevel: 'A' as never,
        style: { elevation: 'deep' as never },
      })
    ).toEqual([
      'id is not kebab-case',
      'seed teal is not #rrggbb',
      'unknown font comic',
      'unknown collection retro',
      'unknown mood grumpy',
      'unknown contrast level A',
      expect.stringMatching(/^style: /),
    ]);
  });

  it('keeps metadata in step with each definition, with the documented defaults', async () => {
    const definitions = await loadDefinitions();
    (await loadFullLibraryMeta()).forEach((meta, index) => {
      const definition = definitions[index] as LibraryThemeDefinition;
      expect(meta.collection, meta.id).toBe(definition.collection ?? 'industry');
      expect(meta.mood, meta.id).toEqual(definition.mood ?? []);
      expect(meta.darkFirst, meta.id).toBe(definition.darkFirst ?? false);
      expect(meta.contrastLevel, meta.id).toBe(definition.contrastLevel ?? 'AA');
      expect(meta.seed, meta.id).toBe(definition.seed);
      expect(meta.neutral, meta.id).toBe(definition.neutral);
    });
  });

  it('holds every theme that claims AAA to 7:1 text contrast in both modes', async () => {
    const failures: string[] = [];
    const aaa = (await loadFullLibraryMeta()).filter((entry) => entry.contrastLevel === 'AAA');
    expect(aaa.length).toBeGreaterThan(0);
    for (const meta of aaa) {
      const theme = await loadLibraryTheme(meta.id);
      for (const mode of ['light', 'dark'] as const) {
        for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
          const ratio = contrastRatio(theme[mode][fg], theme[mode][bg]);
          if (ratio < 7) failures.push(`${meta.id}/${mode}: ${fg} on ${bg} = ${ratio.toFixed(2)}`);
        }
      }
    }
    expect(failures).toEqual([]);
  });
});

describe('library search and browse', () => {
  it('searches case-insensitively, needs every word, and ranks name matches first', () => {
    expect(searchThemeLibrary('')).toBe(THEME_LIBRARY_META);
    expect(searchThemeLibrary('  ')).toBe(THEME_LIBRARY_META);
    expect(searchThemeLibrary('NEON')[0]?.id).toBe('gaming-neon');
    expect(searchThemeLibrary('dark contrast')[0]?.id).toBe('accessible-dark-contrast');
    expect(searchThemeLibrary('fintech')[0]?.id).toBe('fintech-ledger');
    expect(searchThemeLibrary('no-such-theme-anywhere')).toEqual([]);
    for (const result of searchThemeLibrary('ledger trust')) {
      const text = [
        result.name,
        result.id,
        result.description,
        result.category,
        result.collection,
        ...result.tags,
        ...result.mood,
      ]
        .join(' ')
        .toLowerCase();
      expect(text).toContain('ledger');
      expect(text).toContain('trust');
    }
    expect(searchThemeLibrary('studio').map((meta) => meta.id)).toEqual(
      searchThemeLibrary('Studio').map((meta) => meta.id)
    );
  });

  it('ranks a name match above a description-only match', () => {
    const results = searchThemeLibrary('ledger');
    const firstDescriptionOnly = results.findIndex(
      (meta) => !meta.name.toLowerCase().includes('ledger') && !meta.id.includes('ledger')
    );
    const lastNameMatch = results.reduce(
      (last, meta, index) =>
        meta.name.toLowerCase().includes('ledger') || meta.id.includes('ledger') ? index : last,
      -1
    );
    expect(lastNameMatch).toBeGreaterThanOrEqual(0);
    if (firstDescriptionOnly >= 0) expect(lastNameMatch).toBeLessThan(firstDescriptionOnly);
  });

  it('lists every collection in a fixed order with counts, and filters by collection and mood', () => {
    const collections = listCollections();
    expect(collections.map((entry) => entry.id)).toEqual([...THEME_COLLECTIONS]);
    expect(collections.reduce((sum, entry) => sum + entry.count, 0)).toBe(
      THEME_LIBRARY_META.length
    );
    expect(listThemeLibrary({ collection: 'industry' }).length).toBe(
      collections.find((entry) => entry.id === 'industry')?.count
    );
    for (const mood of THEME_MOODS) {
      expect(listThemeLibrary({ mood }).every((meta) => meta.mood.includes(mood))).toBe(true);
    }
  });
});

const oklab = (hex: string) => {
  const { l, c, h } = rgbToOklch(parseHex(hex) as [number, number, number]);
  const angle = (h * Math.PI) / 180;
  return [l, c * Math.cos(angle), c * Math.sin(angle)] as const;
};
const deltaE = (a: string, b: string) => {
  const [l1, a1, b1] = oklab(a);
  const [l2, a2, b2] = oklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2);
};
const hueGap = (a: string, b: string) => {
  const d =
    Math.abs(
      rgbToOklch(parseHex(a) as [number, number, number]).h -
        rgbToOklch(parseHex(b) as [number, number, number]).h
    ) % 360;
  return d > 180 ? 360 - d : d;
};

describe('the 200+ theme library', () => {
  it('spreads the library across every collection', () => {
    const count = (collection: string) =>
      listThemeLibrary({ collection: collection as never }).length;
    expect(count('industry')).toBeGreaterThanOrEqual(12);
    expect(count('brand-like')).toBeGreaterThanOrEqual(8);
    expect(count('high-contrast')).toBeGreaterThanOrEqual(4);
    expect(count('colorblind-safe')).toBeGreaterThanOrEqual(4);
    const highContrast = listThemeLibrary({ collection: 'high-contrast' });
    expect(highContrast.every((meta) => meta.contrastLevel === 'AAA')).toBe(true);
    expect(highContrast.some((meta) => meta.darkFirst)).toBe(true);
    expect(highContrast.some((meta) => !meta.darkFirst)).toBe(true);
    for (const mood of ['calm', 'bold', 'playful', 'corporate', 'editorial'] as const) {
      expect(listThemeLibrary({ mood }).length, mood).toBeGreaterThan(0);
    }
  });

  it('gives every ported theme its own neutral, font, radius and elevation combination', async () => {
    // The rule the 64 ported themes were curated to. Texuli's expanded set does
    // not follow it (reported to Texuli), so it is checked on the ported ones.
    const ported = await Promise.all(
      TEXULI_PORTED_META.map((meta) => loadLibraryThemeDefinition(meta.id))
    );
    const combos = ported.map((definition) =>
      [
        definition.neutral ?? 'original',
        definition.font ?? 'default',
        definition.radius ?? '0.625rem',
        definition.style?.elevation ?? 'soft',
      ].join(' | ')
    );
    const repeated = combos.filter((combo, index) => combos.indexOf(combo) !== index);
    expect(repeated).toEqual([]);
  });

  it('keeps ported primaries apart: same-neutral themes stay ΔE_OK 0.04 apart in a mode', async () => {
    // Texuli's port separates the two pairs that sat under ΔE 0.04 with its
    // builder by documented same-hue nudges (productivity-minimal in
    // FIX-port-seeds, climate-earth in FIX-port-identity). The list is exact,
    // so a new near-duplicate fails.
    const KNOWN_CLOSE: string[] = [];
    const ids = TEXULI_PORTED_META.map((meta) => meta.id);
    const themes = await Promise.all(ids.map((id) => loadLibraryTheme(id)));
    const definitions = await Promise.all(ids.map((id) => loadLibraryThemeDefinition(id)));
    const close: string[] = [];
    themes.forEach((a, i) => {
      themes.slice(0, i).forEach((b, j) => {
        const family = (index: number) => definitions[index]?.neutral ?? 'original';
        if (family(i) !== family(j)) return;
        const light = deltaE(a.light.primary, b.light.primary);
        const dark = deltaE(a.dark.primary, b.dark.primary);
        if (light < 0.04 && dark < 0.04) close.push(`${b.id} ~ ${a.id}`);
      });
    });
    expect(close).toEqual(KNOWN_CLOSE);
  });

  it('builds colorblind-safe chart palettes from Okabe-Ito seeds that pass the chart checks', async () => {
    const safe = listThemeLibrary({ collection: 'colorblind-safe' });
    expect(safe.length).toBeGreaterThanOrEqual(4);
    for (const meta of safe) {
      const definition = await loadLibraryThemeDefinition(meta.id);
      const seeds = definition.chartSeeds ?? [];
      expect(seeds, meta.id).toHaveLength(5);
      const theme = await loadLibraryTheme(meta.id);
      for (const mode of ['light', 'dark'] as const) {
        const charts = theme.charts?.[mode];
        if (!charts) throw new Error(`${meta.id} has no ${mode} charts`);
        expect(validateChartTokens(charts, theme[mode], mode), `${meta.id}/${mode}`).toEqual([]);
        charts.categorical.forEach((color, i) => {
          for (const other of charts.categorical.slice(0, i)) {
            expect(chartColorDistance(color, other, 'tritanopia')).toBeGreaterThanOrEqual(0.04);
          }
        });
        // Repair moves lightness only, so each series keeps its Okabe-Ito hue.
        seeds.forEach((seed, i) => {
          expect(
            hueGap(seed, charts.categorical[i] as string),
            `${meta.id}/${mode} series ${i + 1}`
          ).toBeLessThan(12);
        });
      }
    }
  });
});
