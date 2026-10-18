import { describe, expect, it } from 'vitest';
import pkg from '../package.json' with { type: 'json' };
import * as blueprint from '../src/index.ts';

describe('@protoyard/blueprint package', () => {
  it('exposes the blueprint format version from its entry point', () => {
    expect(blueprint.BLUEPRINT_FORMAT_VERSION).toBe(1);
  });

  it('ships TypeScript source and stays framework-agnostic', () => {
    expect(pkg.name).toBe('@protoyard/blueprint');
    expect(pkg.exports['.']).toBe('./src/index.ts');
    expect(Object.keys(pkg.dependencies).sort()).toEqual([
      '@protoyard/core',
      '@protoyard/scenarios',
      '@protoyard/themes',
      'zod',
    ]);
    expect('peerDependencies' in pkg).toBe(false);
  });
});
