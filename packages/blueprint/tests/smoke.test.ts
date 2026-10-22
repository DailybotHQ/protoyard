import * as computed from '@protoyard/blueprint/computed';
import * as workflows from '@protoyard/blueprint/workflows';
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
    expect(pkg.exports['./computed']).toBe('./src/computed/index.ts');
    expect(pkg.exports['./workflows']).toBe('./src/workflows/index.ts');
    expect(pkg.exports['./kinds']).toBe('./src/kinds/index.ts');
    expect(computed.evaluateComputedExpression).toBeTypeOf('function');
    expect(workflows.checkWorkflowTransition).toBeTypeOf('function');
    // Only framework-agnostic engine packages (never ui, renderer or Svelte) plus zod (ADR-002);
    // The content-kind engines are framework-agnostic packages (ADR-037 to ADR-039).
    const allowed = [
      '@protoyard/blocks',
      '@protoyard/core',
      '@protoyard/decks',
      '@protoyard/pages',
      '@protoyard/scenarios',
      '@protoyard/themes',
      'zod',
    ];
    for (const dep of Object.keys(pkg.dependencies)) expect(allowed, dep).toContain(dep);
    expect(Object.keys(pkg.dependencies)).toContain('@protoyard/core');
    expect('peerDependencies' in pkg).toBe(false);
  });
});
