import { describe, expect, it } from 'vitest';
import {
  CHART_TOKENS,
  downsampleThreshold,
  extent,
  MAX_DOWNSAMPLE_POINTS,
  MIN_DOWNSAMPLE_POINTS,
  plotArea,
  roundCoord,
  seriesColor,
} from '../src/index.ts';

describe('@protoyard/charts scaffold', () => {
  it('extent ignores gaps and non-finite values', () => {
    expect(extent([3, null, -2, Number.NaN, 7, undefined, Number.POSITIVE_INFINITY])).toEqual([
      -2, 7,
    ]);
    expect(extent([])).toBeNull();
    expect(extent([null, Number.NaN])).toBeNull();
  });

  it('roundCoord keeps two decimals and never returns -0', () => {
    expect(roundCoord(12.3456)).toBe(12.35);
    expect(Object.is(roundCoord(-0.001), 0)).toBe(true);
  });

  it('downsampleThreshold scales with width inside its bounds', () => {
    expect(downsampleThreshold(600)).toBe(1200);
    expect(downsampleThreshold(10)).toBe(MIN_DOWNSAMPLE_POINTS);
    expect(downsampleThreshold(100_000)).toBe(MAX_DOWNSAMPLE_POINTS);
    expect(downsampleThreshold(Number.NaN)).toBe(MIN_DOWNSAMPLE_POINTS);
  });

  it('plotArea subtracts margins and never goes negative', () => {
    const margin = { top: 8, right: 12, bottom: 24, left: 40 };
    expect(plotArea(400, 200, margin)).toEqual({ x: 40, y: 8, width: 348, height: 168 });
    expect(plotArea(20, 10, margin)).toMatchObject({ width: 0, height: 0 });
  });

  it('seriesColor cycles the theme chart tokens', () => {
    expect(seriesColor(0)).toBe('var(--py-chart1)');
    expect(seriesColor(CHART_TOKENS.length)).toBe('var(--py-chart1)');
    expect(seriesColor(-1)).toBe('var(--py-chart5)');
  });

  it('every subpath export resolves to a module', async () => {
    const subpaths = await Promise.all([
      import('../src/scales/index.ts'),
      import('../src/shapes.ts'),
      import('../src/downsample/index.ts'),
      import('../src/layout.ts'),
      import('../src/palette.ts'),
    ]);
    for (const mod of subpaths) expect(Object.keys(mod).length).toBeGreaterThan(0);
  });
});

describe('@protoyard/charts package exports', () => {
  it('every export target exists', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const root = join(import.meta.dirname, '..');
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
      exports: Record<string, string>;
    };
    expect(Object.keys(pkg.exports)).toEqual([
      '.',
      './scales',
      './shapes',
      './downsample',
      './layout',
      './palette',
    ]);
    for (const target of Object.values(pkg.exports)) {
      expect(existsSync(join(root, target))).toBe(true);
    }
  });
});
