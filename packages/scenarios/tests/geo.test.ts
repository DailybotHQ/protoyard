import { parseScenario, type Scenario } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import { GEO_REGION_IDS, GEO_REGIONS, geoPoints, inGeoRegion } from '../src/index.ts';

const scenario = (overrides: Record<string, unknown> = {}): Scenario =>
  parseScenario({
    id: 'demo',
    name: 'Demo',
    seed: 42,
    referenceTime: '2026-06-01T09:00:00.000Z',
    ...overrides,
  });
const ctx = { scenario: scenario() };

describe('geoPoints', () => {
  it('is deterministic per seed and key', () => {
    const points = geoPoints({ ctx, region: 'harbor-bay', count: 50 });
    expect(geoPoints({ ctx, region: 'harbor-bay', count: 50 })).toEqual(points);
    expect(
      geoPoints({ ctx: { scenario: scenario({ seed: 1 }) }, region: 'harbor-bay', count: 50 })
    ).not.toEqual(points);
    expect(geoPoints({ ctx, region: 'harbor-bay', count: 50, key: 'stops' })).not.toEqual(points);
  });

  it('is count-stable: more points keep the earlier ones', () => {
    const few = geoPoints({ ctx, region: 'metro-grid', count: 20, key: 'stores' });
    const many = geoPoints({ ctx, region: 'metro-grid', count: 500, key: 'stores' });
    expect(many.slice(0, 20)).toEqual(few);
    expect(new Set(many.map((p) => p.id)).size).toBe(500);
  });

  it('stays inside every region and clusters around its anchors', () => {
    for (const region of GEO_REGION_IDS) {
      const points = geoPoints({ ctx, region, count: 400, spread: 0.5 });
      expect(points.every((p) => inGeoRegion(p, region))).toBe(true);
      const anchors = new Set(GEO_REGIONS[region].anchors.map((a) => a.id));
      expect(points.every((p) => anchors.has(p.anchorId))).toBe(true);
      for (const p of points) {
        expect(p.lat).toBe(Math.round(p.lat * 1e5) / 1e5);
      }
    }
  });

  it('weights anchors and limits clusters', () => {
    const points = geoPoints({ ctx, region: 'metro-grid', count: 2000 });
    const count = (id: string) => points.filter((p) => p.anchorId === id).length;
    expect(count('central')).toBeGreaterThan(count('airfield'));
    const two = geoPoints({ ctx, region: 'metro-grid', count: 200, clusters: 2 });
    expect(new Set(two.map((p) => p.anchorId))).toEqual(new Set(['central', 'east-yards']));
  });

  it('keeps every region bbox valid and its anchors inside it', () => {
    for (const region of Object.values(GEO_REGIONS)) {
      const [minLng, minLat, maxLng, maxLat] = region.bbox;
      expect(minLng).toBeLessThan(maxLng);
      expect(minLat).toBeLessThan(maxLat);
      for (const a of region.anchors) expect(inGeoRegion(a, region.id as never)).toBe(true);
    }
  });

  it('rejects an invalid count or region', () => {
    expect(() => geoPoints({ ctx, region: 'harbor-bay', count: -1 })).toThrow(/count/);
    expect(() => geoPoints({ ctx, region: 'atlantis' as never, count: 1 })).toThrow(/region/);
    expect(geoPoints({ ctx, region: 'harbor-bay', count: 0 })).toEqual([]);
  });
});
