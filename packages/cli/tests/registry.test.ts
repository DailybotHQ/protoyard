// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex } from '../src/lib/registry.ts';
import { addPrototype, createWorkspace, manifest, type TempWorkspace } from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
});
afterEach(() => ws.cleanup());

describe('discovery and registry', () => {
  it('rejects oversized manifests and duplicate ids without failing the index', async () => {
    addPrototype(ws, 'one', { id: 'example.same' });
    addPrototype(ws, 'two', { id: 'example.same' });
    addPrototype(ws, 'big', { description: 'x'.repeat(10), tags: ['a'] });
    ws.write(
      'prototypes/big/protoyard.json',
      JSON.stringify(manifest({ slug: 'big' })) + ' '.repeat(300 * 1024)
    );
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.entries).toEqual([]);
    expect(registry.invalid.map((i) => i.path).sort()).toEqual([
      'prototypes/big',
      'prototypes/one',
      'prototypes/two',
    ]);
    expect(registry.invalid.find((i) => i.path === 'prototypes/big')?.errors[0]).toMatch(/limit/);
  });
});
