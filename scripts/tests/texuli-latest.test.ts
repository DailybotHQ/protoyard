// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { checkLatest, checkPins, type Pin } from '../check-texuli-latest.ts';

const pin = (manifest: string, name: string, spec: string): Pin => ({ manifest, name, spec });

describe('checkPins', () => {
  it('refuses anything but an exact npm version', () => {
    for (const spec of [
      'link:../texuli/packages/texuli',
      'file:../texuli.tgz',
      'workspace:*',
      '^0.8.0',
      '~0.8.0',
      'latest',
      'github:DailybotHQ/texuli',
    ]) {
      const report = checkPins([pin('packages/ui/package.json', 'texuli', spec)]);
      expect(report.ok, spec).toBe(false);
      expect(report.problems[0]).toContain('is not an exact npm version');
    }
  });

  it('refuses one package pinned to two versions', () => {
    const report = checkPins([
      pin('packages/ui/package.json', '@texuli/data', '0.8.0'),
      pin('packages/views/package.json', '@texuli/data', '0.7.0'),
    ]);
    expect(report.problems).toEqual(['@texuli/data is pinned differently: 0.7.0, 0.8.0']);
  });

  it('compares pins with npm latest when the registry answered', () => {
    const pins = [
      pin('package.json', 'texuli', '0.8.0'),
      pin('package.json', '@texuli/slides', '0.8.0'),
    ];
    const report = checkPins(
      pins,
      new Map([
        ['texuli', '0.8.0'],
        ['@texuli/slides', '0.8.1'],
      ])
    );
    expect(report.problems).toEqual(['@texuli/slides: pinned 0.8.0, npm latest is 0.8.1']);
  });

  it('fails when the registry could not answer, instead of passing silently', () => {
    const report = checkPins(
      [pin('package.json', 'texuli', '0.8.0')],
      new Map([['texuli', undefined]])
    );
    expect(report.problems).toEqual(['texuli: npm latest is unknown']);
  });
});

describe('this repository (offline)', () => {
  it('pins every Texuli package exactly and consistently', () => {
    const report = checkLatest();
    expect(report.problems).toEqual([]);
    expect(report.packages.length).toBeGreaterThan(10);
  });
});
