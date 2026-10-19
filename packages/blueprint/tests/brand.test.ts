// @vitest-environment node

import type { Theme } from '@protoyard/core';
import { contrastRatio, TEXT_CONTRAST_PAIRS, UI_CONTRAST_PAIRS } from '@protoyard/themes';
import { describe, expect, it } from 'vitest';
import {
  BrandThemeError,
  brandLibraryThemeId,
  brandThemeExportName,
  brandThemeId,
  closestIds,
  emitBrandThemeModule,
  parseBlueprint,
  resolveBlueprintBrand,
  STYLE_PROFILES,
} from '../src/index.ts';

const baseBlueprint = {
  formatVersion: 1 as const,
  name: 'Acme Desk',
  entities: [
    {
      name: 'ticket',
      plural: 'tickets',
      fields: [{ name: 'subject', kind: 'text' as const, required: true }],
      titleField: 'subject',
    },
  ],
  roles: [{ name: 'owner', permissions: { '*': ['*'] as const } }],
};

function assertAa(theme: Theme) {
  for (const mode of ['light', 'dark'] as const) {
    const palette = theme[mode];
    for (const [fg, bg] of TEXT_CONTRAST_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg]), `${mode} ${fg}/${bg}`).toBeGreaterThanOrEqual(
        4.5
      );
    }
    for (const [fg, bg] of UI_CONTRAST_PAIRS) {
      expect(contrastRatio(palette[fg], palette[bg]), `${mode} ${fg}/${bg}`).toBeGreaterThanOrEqual(
        3
      );
    }
  }
}

describe('blueprint brand schema', () => {
  it('accepts an optional brand and rejects brand without seed or preset', () => {
    const withBrand = parseBlueprint({
      ...baseBlueprint,
      brand: { seed: '#0f766e', name: 'Acme Teal', styleProfile: 'soft', font: 'grotesk' },
    });
    expect(withBrand.brand?.seed).toBe('#0f766e');

    expect(() =>
      parseBlueprint({
        ...baseBlueprint,
        brand: { name: 'No color' },
      })
    ).toThrow(/seed color, a theme preset or a libraryTheme/i);

    const without = parseBlueprint(baseBlueprint);
    expect(without.brand).toBeUndefined();
  });

  it('accepts preset-only brand and validates hex / font ids', () => {
    const presetOnly = parseBlueprint({
      ...baseBlueprint,
      brand: { preset: 'ocean', font: 'humanist' },
    });
    expect(presetOnly.brand?.preset).toBe('ocean');

    expect(() =>
      parseBlueprint({
        ...baseBlueprint,
        brand: { seed: 'teal' },
      })
    ).toThrow(/#rgb|#rrggbb/i);

    expect(() =>
      parseBlueprint({
        ...baseBlueprint,
        brand: { seed: '#0f766e', font: 'comic-sans' },
      })
    ).toThrow();
  });
});

describe('resolveBlueprintBrand', () => {
  it('builds an AA theme from a seed + style profile + font', () => {
    const brand = parseBlueprint({
      ...baseBlueprint,
      brand: {
        id: 'acme-teal',
        name: 'Acme Teal',
        seed: '#0f766e',
        secondary: '#1d4ed8',
        styleProfile: 'soft',
        font: 'grotesk',
      },
    }).brand!;
    const theme = resolveBlueprintBrand(brand, { blueprintName: 'Acme Desk' });
    expect(theme.id).toBe('acme-teal');
    expect(theme.name).toBe('Acme Teal');
    expect(theme.radius).toBe('0.75rem');
    expect(theme.density).toBe(1.05);
    expect(theme.fontFamily).toMatch(/grotesk|Helvetica/i);
    assertAa(theme);
  });

  it('clones a built-in preset when seed is omitted', () => {
    const brand = parseBlueprint({
      ...baseBlueprint,
      brand: { preset: 'monochrome', styleProfile: 'crisp' },
    }).brand!;
    const theme = resolveBlueprintBrand(brand, { blueprintName: 'Wireframe Co' });
    expect(theme.id).toBe('wireframe-co');
    expect(theme.radius).toBe('0.375rem');
    assertAa(theme);
  });

  it('derives id and export name from the blueprint name', () => {
    expect(brandThemeId({ seed: '#2563eb' }, 'Help Desk')).toBe('help-desk');
    expect(brandThemeExportName('help-desk')).toBe('helpDeskTheme');
    expect(brandThemeExportName('acme')).toBe('acmeTheme');
  });

  it('emits a defineTheme module that round-trips the resolved theme', () => {
    const brand = parseBlueprint({
      ...baseBlueprint,
      brand: { seed: '#7c3aed', id: 'violet-brand' },
    }).brand!;
    const theme = resolveBlueprintBrand(brand);
    const source = emitBrandThemeModule(theme);
    expect(source).toContain('violetBrandTheme');
    expect(source).toContain('"id": "violet-brand"');
    expect(source).toContain('defineTheme');
  });

  it('lists every style profile id', () => {
    expect(STYLE_PROFILES.map((p) => p.id).sort()).toEqual(
      ['crisp', 'editorial', 'flat', 'mono', 'rounded', 'soft'].sort()
    );
  });
});

describe('brand across seed hues', () => {
  const seeds = ['#0f766e', '#1d4ed8', '#b91c1c', '#a16207', '#6b21a8', '#111827'];
  for (const seed of seeds) {
    it(`passes AA for seed ${seed}`, () => {
      const theme = resolveBlueprintBrand({ seed, id: 'seed-check', name: 'Seed Check' });
      assertAa(theme);
    });
  }
});

describe('blueprint brand libraryTheme', () => {
  it('accepts a library id and uses it as the theme id', () => {
    const blueprint = parseBlueprint({
      ...baseBlueprint,
      brand: { name: 'Acme Ledger', libraryTheme: 'fintech-ledger' },
    });
    const brand = blueprint.brand as NonNullable<typeof blueprint.brand>;
    expect(brandLibraryThemeId(brand)).toBe('fintech-ledger');
    expect(brandThemeId(brand, blueprint.name)).toBe('fintech-ledger');
    expect(() => resolveBlueprintBrand(brand)).toThrow(BrandThemeError);
  });

  it('rejects an unknown library id with the closest ids', () => {
    const brand = parseBlueprint({ ...baseBlueprint, brand: { libraryTheme: 'fintech-ledgr' } })
      .brand as NonNullable<ReturnType<typeof parseBlueprint>['brand']>;
    expect(() => brandLibraryThemeId(brand)).toThrow(BrandThemeError);
    expect(() => brandLibraryThemeId(brand)).toThrow(
      /Unknown library theme "fintech-ledgr" \(closest: fintech-ledger/
    );
  });

  it('is mutually exclusive with the fields that build a theme', () => {
    for (const extra of [
      { seed: '#0f766e' },
      { preset: 'ocean' },
      { secondary: '#c2410c' },
      { styleProfile: 'soft' },
      { font: 'grotesk' },
      { radius: '8px' },
      { density: 1 },
      { id: 'acme' },
    ]) {
      const key = Object.keys(extra)[0] as string;
      expect(() =>
        parseBlueprint({ ...baseBlueprint, brand: { libraryTheme: 'fintech-ledger', ...extra } })
      ).toThrow(new RegExp(`brand.${key} cannot be combined with libraryTheme`));
    }
  });

  it('builds brands without a libraryTheme exactly as before', () => {
    const brand = parseBlueprint({ ...baseBlueprint, brand: { preset: 'ocean' } }).brand;
    expect(brandLibraryThemeId(brand as NonNullable<typeof brand>)).toBeUndefined();
  });
});

describe('closestIds', () => {
  const known = ['violet', 'ocean', 'emerald', 'fintech-ledger', 'health-clinic'];

  it('ranks containing ids first, then by edit distance, in known order on ties', () => {
    expect(closestIds('ledger', known)).toEqual(['fintech-ledger']);
    expect(closestIds('ocaen', known)).toEqual(['ocean']);
    expect(closestIds('violett', known)).toEqual(['violet']);
  });

  it('suggests nothing for unrelated ids and honors the limit', () => {
    expect(closestIds('zzzzzzzz', known)).toEqual([]);
    expect(closestIds('e', known, 2)).toHaveLength(2);
  });
});
