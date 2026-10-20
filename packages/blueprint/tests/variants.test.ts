import { describe, expect, it } from 'vitest';
import {
  type BlueprintInput,
  canonicalJson,
  deriveVariants,
  parseBlueprint,
  VARIANT_DENSITY_SCALE,
} from '../src/index.ts';

/** A fictional field-service team. */
function input(brand?: BlueprintInput['brand']): BlueprintInput {
  return {
    formatVersion: 1,
    name: 'Fieldline Inspections',
    ...(brand ? { brand } : {}),
    entities: [
      {
        name: 'site',
        plural: 'sites',
        fields: [{ name: 'name', kind: 'text', required: true }],
        titleField: 'name',
      },
      {
        name: 'inspection',
        plural: 'inspections',
        fields: [
          { name: 'title', kind: 'text', required: true },
          { name: 'site', kind: 'relation', to: 'site', cardinality: 'one' },
          { name: 'dueOn', kind: 'date' },
        ],
        titleField: 'title',
      },
      {
        name: 'technician',
        plural: 'technicians',
        fields: [{ name: 'name', kind: 'text', required: true }],
        titleField: 'name',
      },
    ],
    roles: [{ name: 'manager', permissions: { '*': ['*'] } }],
    screens: [
      { type: 'list', entity: 'site' },
      { type: 'calendar', entity: 'inspection', dateField: 'dueOn' },
    ],
  } as BlueprintInput;
}

const blueprint = parseBlueprint(input({ preset: 'violet' }));
const axes = {
  layouts: ['sidebar', 'rail', 'top-nav'] as const,
  themes: ['ocean', 'emerald', 'fintech-ledger'],
};

describe('deriveVariants', () => {
  it('returns N valid, distinct variants that differ from the original', () => {
    const variants = deriveVariants(blueprint, { count: 8, seed: 'idea-1', axes });
    expect(variants.map((variant) => variant.id)).toEqual([
      'v1',
      'v2',
      'v3',
      'v4',
      'v5',
      'v6',
      'v7',
      'v8',
    ]);
    const json = variants.map((variant) => canonicalJson(variant.blueprint));
    expect(new Set(json).size).toBe(8);
    expect(json).not.toContain(canonicalJson(blueprint));
    for (const variant of variants) {
      expect(parseBlueprint(variant.blueprint)).toEqual(variant.blueprint);
      expect(variant.blueprint.entities.map((entity) => entity.name).sort()).toEqual([
        'inspection',
        'site',
        'technician',
      ]);
      expect(variant.blueprint.roles).toEqual(blueprint.roles);
    }
  });

  it('is byte-deterministic for the same blueprint and seed, and seed-sensitive', () => {
    const run = () => JSON.stringify(deriveVariants(blueprint, { count: 6, seed: 'idea-1', axes }));
    expect(run()).toBe(run());
    const other = JSON.stringify(deriveVariants(blueprint, { count: 6, seed: 'idea-2', axes }));
    expect(other).not.toBe(run());
  });

  it('labels what changed and applies it', () => {
    for (const variant of deriveVariants(blueprint, { count: 8, seed: 's', axes })) {
      const { changes, blueprint: next } = variant;
      expect(variant.label.length).toBeGreaterThan(0);
      expect(variant.label.length).toBeLessThanOrEqual(160);
      if (changes.layout) {
        expect(next.layout?.id).toBe(changes.layout);
        expect(variant.label).toContain('layout');
      }
      if (changes.theme === 'fintech-ledger') {
        expect(next.brand).toEqual({ libraryTheme: 'fintech-ledger' });
        expect(changes.density).toBeUndefined();
      } else if (changes.theme) {
        expect(next.brand?.preset).toBe(changes.theme);
      }
      if (changes.density === 'comfortable') expect(next.brand?.density).toBeUndefined();
      else if (changes.density)
        expect(next.brand?.density).toBe(VARIANT_DENSITY_SCALE[changes.density]);
      if (changes.primaryEntity) {
        expect(next.entities[0]?.name).toBe(changes.primaryEntity);
        const first = next.screens[0];
        if (changes.primaryEntity !== 'technician' && first && 'entity' in first)
          expect(first.entity).toBe(changes.primaryEntity);
      }
    }
  });

  it('builds readable labels', () => {
    const [variant] = deriveVariants(blueprint, {
      count: 1,
      axes: { layouts: ['rail'], themes: ['ocean'], densities: ['compact'], emphasis: false },
    });
    expect(variant?.label).toBe('Rail layout · Ocean theme · Compact');
    const [emphasis] = deriveVariants(parseBlueprint(input()), { count: 1, seed: 'x', axes: {} });
    expect(emphasis?.label).toMatch(/^(Sites|Inspections|Technicians) first$/);
  });

  it('never mutates its input', () => {
    const before = canonicalJson(blueprint);
    deriveVariants(blueprint, { count: 4, axes });
    expect(canonicalJson(blueprint)).toBe(before);
  });

  it('varies density only where a brand can carry it', () => {
    const library = parseBlueprint(input({ libraryTheme: 'health-clinic' }));
    expect(() => deriveVariants(library, { count: 1, axes: { emphasis: false } })).toThrow(
      /Only 0/
    );
    const variants = deriveVariants(blueprint, { count: 2, axes: { emphasis: false } });
    expect(variants.map((variant) => variant.changes.density).sort()).toEqual(
      ['compact', 'spacious'].filter(Boolean)
    );
  });

  it('refuses bad counts, impossible requests and invalid catalog ids', () => {
    for (const count of [0, 9, 1.5, Number.NaN]) {
      expect(() => deriveVariants(blueprint, { count, axes }), String(count)).toThrow(RangeError);
    }
    expect(() =>
      deriveVariants(blueprint, {
        count: 3,
        axes: { layouts: ['rail'], emphasis: false, densities: [] },
      })
    ).toThrow(/Only 1 distinct/);
    expect(() =>
      deriveVariants(blueprint, { count: 1, axes: { layouts: ['nope' as never], emphasis: false } })
    ).toThrow();
    expect(() =>
      deriveVariants(blueprint, { count: 1, axes: { themes: ['Bad Theme'], emphasis: false } })
    ).toThrow(/libraryTheme/);
  });
});
