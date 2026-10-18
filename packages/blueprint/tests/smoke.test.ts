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
    // Only framework-agnostic engine packages (never ui, renderer or Svelte) plus zod (ADR-002).
    const allowed = ['@protoyard/core', '@protoyard/scenarios', '@protoyard/themes', 'zod'];
    for (const dep of Object.keys(pkg.dependencies)) expect(allowed, dep).toContain(dep);
    expect(Object.keys(pkg.dependencies)).toContain('@protoyard/core');
    expect('peerDependencies' in pkg).toBe(false);
  });
});
