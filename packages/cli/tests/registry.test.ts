// @vitest-environment node
import { readFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex, filterEntries, findEntry, readRegistry } from '../src/lib/registry.ts';
import {
  addPrototype,
  addTemplate,
  createWorkspace,
  manifest,
  type TempWorkspace,
} from './helpers.ts';

let ws: TempWorkspace;
beforeEach(() => {
  ws = createWorkspace();
});
afterEach(() => ws.cleanup());

function seed() {
  addPrototype(ws, 'zeta-crm', {
    name: 'Zeta CRM',
    category: 'sales',
    tags: ['crm', 'sales'],
    platform: 'desktop',
  });
  addPrototype(ws, 'alpha-bank', {
    name: 'Álpha Bank',
    description: 'Mobile banking with transfers',
    category: 'fintech',
    tags: ['banking'],
    platform: 'mobile',
  });
  addPrototype(ws, 'mid-chat', { name: 'Mid Chat', category: 'ai', tags: ['chat'] });
  addTemplate(ws, 'blank');
}

describe('discovery and registry', () => {
  it('indexes valid manifests, sorts prototypes before templates, and reports invalid ones', async () => {
    seed();
    ws.write('prototypes/broken-json/protoyard.json', '{ not json');
    ws.write('prototypes/wrong-folder/protoyard.json', manifest({ slug: 'other-name' }));
    ws.write('prototypes/no-manifest/README.md', '# nothing');
    ws.write('prototypes/.hidden/protoyard.json', manifest({ slug: 'hidden' }));
    ws.write('prototypes/bad-schema/protoyard.json', { id: 'x', slug: 'bad-schema' });

    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.entries.map((e) => e.slug)).toEqual([
      'alpha-bank',
      'mid-chat',
      'zeta-crm',
      'blank',
    ]);
    expect(registry.stats).toEqual({ total: 4, prototypes: 3, templates: 1, invalid: 4 });
    const invalid = Object.fromEntries(registry.invalid.map((i) => [i.path, i.errors.join(' ')]));
    expect(invalid['prototypes/broken-json']).toMatch(/not valid JSON/);
    expect(invalid['prototypes/wrong-folder']).toMatch(/must match its folder/);
    expect(invalid['prototypes/no-manifest']).toMatch(/Missing protoyard.json/);
    expect(invalid['prototypes/bad-schema']).toMatch(/id/);
    expect(invalid['prototypes/.hidden']).toBeUndefined();

    const written = JSON.parse(readFileSync(join(ws.root, '.protoyard/registry.json'), 'utf8'));
    expect(written.format).toBe('protoyard.registry');
    expect(await readRegistry(workspacePaths(ws.root))).toEqual(registry);
  });

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

  it('re-parses only changed manifests on a warm run', async () => {
    seed();
    const paths = workspacePaths(ws.root);
    const cold = await buildIndex(paths);
    expect([cold.parsed, cold.cached]).toEqual([4, 0]);
    const warm = await buildIndex(paths);
    expect([warm.parsed, warm.cached]).toEqual([0, 4]);
    expect(warm.registry.entries).toEqual(cold.registry.entries);

    ws.write(
      'prototypes/mid-chat/protoyard.json',
      manifest({ slug: 'mid-chat', name: 'Renamed Chat' })
    );
    const future = new Date(Date.now() + 5000);
    utimesSync(join(ws.root, 'prototypes/mid-chat/protoyard.json'), future, future);
    const changed = await buildIndex(paths);
    expect([changed.parsed, changed.cached]).toEqual([1, 3]);
    expect(findEntry(changed.registry, 'mid-chat')?.name).toBe('Renamed Chat');

    const forced = await buildIndex(paths, { useCache: false });
    expect(forced.parsed).toBe(4);
  });

  it('filters by kind, tag, platform and accent-insensitive multi-term search', async () => {
    seed();
    const { registry } = await buildIndex(workspacePaths(ws.root));
    const slugs = (q: Parameters<typeof filterEntries>[1]) =>
      filterEntries(registry.entries, q).map((e) => e.slug);
    expect(slugs({ kind: 'template' })).toEqual(['blank']);
    expect(slugs({ kind: 'prototype', tag: 'CRM' })).toEqual(['zeta-crm']);
    expect(slugs({ platform: 'mobile' })).toEqual(['alpha-bank']);
    expect(slugs({ search: 'alpha transfers' })).toEqual(['alpha-bank']);
    expect(slugs({ search: 'ÁLPHA' })).toEqual(['alpha-bank']);
    expect(slugs({ search: 'alpha chat' })).toEqual([]);
    expect(slugs({ category: 'ai' })).toEqual(['mid-chat']);
  });

  it('sorts by last modified when asked', async () => {
    seed();
    const old = new Date('2020-01-01T00:00:00Z');
    utimesSync(join(ws.root, 'prototypes/alpha-bank/protoyard.json'), old, old);
    const recent = new Date(Date.now() + 10_000);
    utimesSync(join(ws.root, 'prototypes/zeta-crm/protoyard.json'), recent, recent);
    const { registry } = await buildIndex(workspacePaths(ws.root));
    const ordered = filterEntries(registry.entries, { kind: 'prototype', sort: 'modified' }).map(
      (e) => e.slug
    );
    expect(ordered[0]).toBe('zeta-crm');
    expect(ordered[ordered.length - 1]).toBe('alpha-bank');
  });
});
