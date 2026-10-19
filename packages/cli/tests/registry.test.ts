// @vitest-environment node
import { cpSync, readFileSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex, filterEntries, findEntry, readRegistry } from '../src/lib/registry.ts';
import {
  addPrototype,
  addTemplate,
  cli,
  createWorkspace,
  manifest,
  type TempWorkspace,
} from './helpers.ts';

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const TEMPLATE = join(REPO, 'templates/crud-app');
const CATALOG_SAMPLE = ['crm', 'lms', 'inventory'] as const;

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
    expect(registry.stats).toEqual({
      total: 4,
      prototypes: 3,
      templates: 1,
      blueprints: 0,
      invalid: 4,
    });
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

  it('indexes catalog blueprints from blueprints/*.json with brand and catalog', async () => {
    seed();
    ws.write('blueprints/crm.json', {
      formatVersion: 1,
      name: 'Catalog CRM',
      description: 'A fictional CRM blueprint for the marketplace.',
      icon: '📇',
      category: 'sales',
      tags: ['crm', 'pipeline'],
      catalog: {
        category: 'sales',
        productType: 'CRM',
        platforms: ['web'],
        features: ['pipeline'],
        highlights: ['Deals and accounts'],
        difficulty: 'beginner',
      },
      brand: { seed: '#1d4ed8', id: 'crm-brand', name: 'Catalog CRM' },
      entities: [
        {
          name: 'account',
          plural: 'accounts',
          fields: [{ name: 'name', kind: 'text', required: true }],
          titleField: 'name',
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    ws.write('blueprints/broken.json', { formatVersion: 1, name: 'Nope' });
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(registry.stats.blueprints).toBe(1);
    const entry = findEntry(registry, 'crm', 'blueprint');
    expect(entry).toMatchObject({
      kind: 'blueprint',
      id: 'local.blueprint.crm',
      slug: 'crm',
      name: 'Catalog CRM',
      path: 'blueprints/crm.json',
      defaultTheme: 'crm-brand',
      template: 'crud-app',
    });
    expect(entry?.catalog?.productType).toBe('CRM');
    expect(filterEntries(registry.entries, { kind: 'blueprint' }).map((e) => e.slug)).toEqual([
      'crm',
    ]);
    expect(registry.invalid.some((i) => i.path === 'blueprints/broken.json')).toBe(true);
  });

  it('indexes the optional catalog block and searches its product type and features', async () => {
    seed();
    addPrototype(ws, 'help-desk', {
      name: 'Help Desk',
      platform: 'responsive',
      catalog: {
        category: 'support',
        productType: 'Helpdesk',
        platforms: ['web', 'widget'],
        features: ['sla-timers', 'canned-replies'],
        highlights: ['Tickets with SLA timers'],
        difficulty: 'advanced',
      },
    });
    addPrototype(ws, 'pocket-bank', {
      name: 'Pocket Bank',
      platform: 'mobile',
      catalog: { category: 'finance' },
    });
    addPrototype(ws, 'side-kick', {
      name: 'Side Kick',
      platform: 'mobile',
      catalog: { category: 'productivity', shell: 'side-panel' },
    });
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(findEntry(registry, 'help-desk')?.catalog).toEqual({
      category: 'support',
      productType: 'Helpdesk',
      platforms: ['web', 'widget'],
      shell: 'none',
      features: ['sla-timers', 'canned-replies'],
      highlights: ['Tickets with SLA timers'],
      difficulty: 'advanced',
    });
    expect(findEntry(registry, 'pocket-bank')?.catalog).toEqual({
      category: 'finance',
      productType: null,
      platforms: [],
      shell: 'phone',
      features: [],
      highlights: [],
      difficulty: null,
    });
    expect(findEntry(registry, 'side-kick')?.catalog?.shell).toBe('side-panel');
    expect(findEntry(registry, 'zeta-crm')?.catalog).toBeNull();
    const slugs = (search: string) =>
      filterEntries(registry.entries, { search }).map((e) => e.slug);
    expect(slugs('helpdesk')).toEqual(['help-desk']);
    expect(slugs('sla-timers')).toEqual(['help-desk']);
  });

  it('reports an invalid catalog without failing the index', async () => {
    seed();
    addPrototype(ws, 'odd-one', { catalog: { category: 'not-a-category' } });
    const { registry } = await buildIndex(workspacePaths(ws.root));
    expect(findEntry(registry, 'odd-one')).toBeUndefined();
    const issue = registry.invalid.find((i) => i.path === 'prototypes/odd-one');
    expect(issue?.errors.join(' ')).toMatch(/catalog/);
    expect(registry.entries).toHaveLength(4);
  });

  it('ignores an index cache from before catalog entries existed', async () => {
    seed();
    const paths = workspacePaths(ws.root);
    const cold = await buildIndex(paths);
    const cache = JSON.parse(readFileSync(paths.indexCache, 'utf8'));
    for (const record of Object.values(cache.records) as { entry: Record<string, unknown> }[]) {
      if (record.entry) delete record.entry.catalog;
    }
    cache.version = 1;
    writeFileSync(paths.indexCache, JSON.stringify(cache));
    const warm = await buildIndex(paths);
    expect([warm.parsed, warm.cached]).toEqual([4, 0]);
    expect(warm.registry.entries).toEqual(cold.registry.entries);
  });

  it('generates three catalog blueprints into a workspace and type-checks them', async () => {
    cpSync(TEMPLATE, join(ws.root, 'templates/crud-app'), {
      recursive: true,
      filter: (src) => !/[/\\](node_modules|dist)([/\\]|$)/.test(src),
    });
    for (const slug of CATALOG_SAMPLE) {
      const file = join(REPO, 'blueprints', `${slug}.json`);
      const run = await cli([
        '--root',
        ws.root,
        '--json',
        'generate',
        `from-${slug}`,
        '--blueprint',
        file,
        '--no-install',
      ]);
      expect(run.code, slug).toBe(0);
      const entry = JSON.parse(
        readFileSync(join(ws.root, 'prototypes', `from-${slug}`, 'protoyard.json'), 'utf8')
      );
      expect(entry.defaultTheme, slug).toBeTruthy();
      expect(
        readFileSync(
          join(ws.root, 'prototypes', `from-${slug}`, 'src/generated/brand-theme.ts'),
          'utf8'
        )
      ).toContain('defineTheme');
    }

    symlinkSync(join(REPO, 'node_modules'), join(ws.root, 'node_modules'), 'dir');
    cpSync(join(REPO, 'tsconfig.base.json'), join(ws.root, 'tsconfig.base.json'));
    cpSync(join(REPO, 'tests/support'), join(ws.root, 'tests/support'), { recursive: true });
    for (const slug of CATALOG_SAMPLE) {
      symlinkSync(
        join(TEMPLATE, 'node_modules'),
        join(ws.root, 'prototypes', `from-${slug}`, 'node_modules'),
        'dir'
      );
      const validate = await cli([
        '--root',
        ws.root,
        '--json',
        'validate',
        `from-${slug}`,
        '--skip-typecheck',
      ]);
      // Spec markers may be stale until write, so only the spec check may fail here.
      const firstRun = validate.json<{
        command: string;
        data: { checks: { id: string; status: string }[] };
      }>();
      expect(firstRun.command, slug).toBe('validate');
      expect(
        firstRun.data.checks.filter((c) => c.status === 'fail' && c.id !== 'spec'),
        slug
      ).toEqual([]);
      expect(firstRun.data.checks.find((c) => c.id === 'typecheck')?.status, slug).toBe('skip');
      // Refresh the spec, then re-validate with typecheck.
      await cli(['--root', ws.root, '--json', 'spec', `from-${slug}`, '--write']);
      const typed = await cli(['--root', ws.root, '--json', 'validate', `from-${slug}`]);
      const { ok, data } = typed.json<{
        ok: boolean;
        data: { checks: { id: string; status: string; details: string[] }[] };
      }>();
      const failed = data.checks.filter((c) => c.status === 'fail');
      expect(failed, slug).toEqual([]);
      expect(ok, slug).toBe(true);
      expect(data.checks.find((c) => c.id === 'typecheck')?.status, slug).toBe('pass');
    }
  }, 180_000);
});
