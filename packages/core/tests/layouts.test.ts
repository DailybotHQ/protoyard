import { describe, expect, it } from 'vitest';
import {
  buildScenarioLink,
  DEFAULT_LAYOUT,
  getLayout,
  LAYOUT_IDS,
  LAYOUTS,
  LayoutIdSchema,
  LayoutSettingsSchema,
  layoutChoices,
  layoutForWidth,
  OverridesSchema,
  parseManifest,
  parseScenario,
  parseScenarioLink,
} from '../src/index.ts';

const baseManifest = {
  id: 'example.layout-demo',
  slug: 'layout-demo',
  name: 'Layout demo',
  version: '0.1.0',
  storage: { namespace: 'layout-demo', schemaVersion: 1 },
};

describe('layout ids and catalog', () => {
  it('lists every layout id from the contract, with custom as the default', () => {
    expect([...LAYOUT_IDS].sort()).toEqual(
      [
        'auth-split',
        'custom',
        'dashboard-grid',
        'docs',
        'dual-sidebar',
        'marketing',
        'master-detail',
        'mobile-drawer',
        'mobile-tabs',
        'rail',
        'sidebar',
        'top-nav',
        'wizard',
      ].sort()
    );
    expect(DEFAULT_LAYOUT).toBe('custom');
    expect(LayoutIdSchema.safeParse('holy-grail').success).toBe(false);
  });

  it('has one frozen entry per id, in picker order, with sane breakpoints', () => {
    expect(LAYOUTS.map((l) => l.id)).toEqual([...LAYOUT_IDS]);
    expect(Object.isFrozen(LAYOUTS)).toBe(true);
    for (const layout of LAYOUTS) {
      expect(Object.isFrozen(layout), layout.id).toBe(true);
      expect(layout.label.length, layout.id).toBeGreaterThan(0);
      expect(layout.platforms.length, layout.id).toBeGreaterThan(0);
      expect(layout.minWidth, layout.id).toBeGreaterThanOrEqual(0);
      if (layout.fallback) {
        expect(layout.fallback, layout.id).not.toBe(layout.id);
        // A fallback always works on narrower screens than the layout it replaces.
        expect(getLayout(layout.fallback)?.minWidth ?? 0).toBeLessThan(layout.minWidth);
      } else {
        expect(layout.minWidth, layout.id).toBe(0);
      }
    }
    expect(getLayout('sidebar')?.label).toBe('Sidebar');
    expect(getLayout('nope' as never)).toBeUndefined();
  });

  it('falls back below the breakpoint, following the chain', () => {
    expect(layoutForWidth('sidebar', 1280)).toBe('sidebar');
    expect(layoutForWidth('sidebar', 390)).toBe('mobile-drawer');
    // dual-sidebar → sidebar → mobile-drawer on a phone.
    expect(layoutForWidth('dual-sidebar', 900)).toBe('sidebar');
    expect(layoutForWidth('dual-sidebar', 390)).toBe('mobile-drawer');
    expect(layoutForWidth('custom', 320)).toBe('custom');
    expect(layoutForWidth('mobile-tabs', 0)).toBe('mobile-tabs');
  });

  it('keeps the catalog data under the 0.5 KB gzip budget', async () => {
    const stream = new Blob([JSON.stringify(LAYOUTS)])
      .stream()
      .pipeThrough(new CompressionStream('gzip'));
    const bytes = (await new Response(stream).arrayBuffer()).byteLength;
    expect(bytes).toBeLessThan(512);
  });
});

describe('manifest preview.layout', () => {
  it('stays absent for existing manifests, so nothing changes', () => {
    const manifest = parseManifest(baseManifest);
    expect(manifest.preview.layout).toBeUndefined();
    expect(layoutChoices(manifest.preview.layout)).toEqual(['custom']);
  });

  it('accepts an id, a supported list and data-only options', () => {
    const manifest = parseManifest({
      ...baseManifest,
      preview: {
        shell: 'browser',
        layout: {
          id: 'sidebar',
          supported: ['rail', 'top-nav'],
          options: { collapsible: true, width: 264, brand: 'Acme' },
        },
      },
    });
    expect(manifest.preview.layout).toEqual({
      id: 'sidebar',
      supported: ['rail', 'top-nav'],
      options: { collapsible: true, width: 264, brand: 'Acme' },
    });
    // The declared id is always a choice, listed first.
    expect(layoutChoices(manifest.preview.layout)).toEqual(['sidebar', 'rail', 'top-nav']);
  });

  it('defaults the id to custom and offers every host layout when no list is given', () => {
    expect(LayoutSettingsSchema.parse({})).toEqual({ id: 'custom' });
    const choices = layoutChoices({ id: 'top-nav' });
    expect(choices).toEqual(LAYOUT_IDS.filter((id) => id !== 'custom'));
  });

  it('rejects unknown ids, duplicates, unknown keys and non-scalar options', () => {
    const bad = [
      { id: 'holy-grail' },
      { id: 'sidebar', supported: [] },
      { id: 'sidebar', supported: ['rail', 'rail'] },
      { id: 'sidebar', supported: ['nope'] },
      { id: 'sidebar', extra: true },
      { id: 'sidebar', options: { nested: { a: 1 } } },
      { id: 'sidebar', options: { 'Bad Key': 1 } },
    ];
    for (const layout of bad) {
      expect(LayoutSettingsSchema.safeParse(layout).success, JSON.stringify(layout)).toBe(false);
    }
    expect(() =>
      parseManifest({ ...baseManifest, preview: { layout: { id: 'holy-grail' } } })
    ).toThrow();
  });
});

describe('layout override, scenario appearance and link', () => {
  it('is a valid override and scenario appearance key', () => {
    expect(OverridesSchema.parse({ layout: 'rail' })).toEqual({ layout: 'rail' });
    expect(OverridesSchema.safeParse({ layout: 'nope' }).success).toBe(false);
    const scenario = parseScenario({
      id: 'docs-view',
      name: 'Docs view',
      seed: 1,
      referenceTime: '2026-01-01T09:00:00.000Z',
      appearance: { layout: 'docs' },
    });
    expect(scenario.appearance.layout).toBe('docs');
  });

  it('parses ?layout= and ignores unknown values', () => {
    expect(parseScenarioLink('?layout=master-detail')).toEqual({ layout: 'master-detail' });
    expect(parseScenarioLink('?layout=holy-grail&shell=phone')).toEqual({ shell: 'phone' });
    expect(parseScenarioLink('?layout=')).toEqual({});
  });

  it('round-trips through buildScenarioLink', () => {
    const link = buildScenarioLink('/demo/', { scenario: 'active-month', layout: 'rail' });
    expect(link).toBe('/demo/?scenario=active-month&layout=rail');
    expect(parseScenarioLink(new URL(link, 'http://x.example').search)).toEqual({
      scenario: 'active-month',
      layout: 'rail',
    });
  });
});
