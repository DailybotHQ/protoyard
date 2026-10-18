// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  inspectSpec,
  parseDexieStore,
  type RawSpec,
  type SpecFacts,
  toSpecFacts,
} from '../src/lib/inspect.ts';

const ROOT = resolve(fileURLToPath(new URL('../../..', import.meta.url)));
const prototypeDir = (slug: string) => join(ROOT, 'prototypes', slug);

describe('parseDexieStore', () => {
  it('parses the primary key, unique, multi-entry and compound indexes, sorted', () => {
    expect(parseDexieStore('people', '++id, name, &email, *tags, [orgId+createdAt]')).toEqual({
      table: 'people',
      primaryKey: {
        name: 'id',
        keyPath: 'id',
        unique: true,
        multiEntry: false,
        autoIncrement: true,
      },
      indexes: [
        {
          name: '[orgId+createdAt]',
          keyPath: ['orgId', 'createdAt'],
          unique: false,
          multiEntry: false,
          autoIncrement: false,
        },
        { name: 'email', keyPath: 'email', unique: true, multiEntry: false, autoIncrement: false },
        { name: 'name', keyPath: 'name', unique: false, multiEntry: false, autoIncrement: false },
        { name: 'tags', keyPath: 'tags', unique: false, multiEntry: true, autoIncrement: false },
      ],
    });
  });

  it('handles an inbound string key, a compound key and an outbound key', () => {
    expect(parseDexieStore('deals', 'id,stage').primaryKey).toMatchObject({
      name: 'id',
      autoIncrement: false,
      unique: true,
    });
    expect(parseDexieStore('links', '[a+b], a').primaryKey?.keyPath).toEqual(['a', 'b']);
    expect(parseDexieStore('blobs', ', kind')).toMatchObject({
      primaryKey: null,
      indexes: [{ name: 'kind' }],
    });
  });
});

describe('toSpecFacts (sorting and the latest store set)', () => {
  const raw: RawSpec = {
    manifest: {
      id: 'example.app',
      slug: 'app',
      name: 'App',
      version: '0.1.0',
      platform: 'responsive',
      category: 'ops',
      defaultTheme: 'violet',
      namespace: 'app',
    },
    generatorVersion: 2,
    versions: [
      { version: 2, stores: { tasks: 'id, status, *labels', legacy: null } },
      { version: 1, stores: { tasks: 'id, status', legacy: 'id', notes: 'id, taskId' } },
    ],
    policy: {
      roles: { viewer: ['tasks:read'], owner: ['tasks:write', 'tasks:read', 'tasks:read'] },
      rules: ['tasks:write', 'notes:delete'],
    },
    personasScenario: 'busy-team',
    personas: [
      { id: 'user_0002', name: 'Bo Example', role: 'viewer' },
      { id: 'user_0001', name: 'Ada Example', role: 'owner' },
    ],
    scenarios: [
      {
        id: 'zeta',
        name: 'Z',
        description: '',
        group: 'General',
        version: 1,
        seed: 2,
        density: 'normal',
        tags: ['b', 'a'],
        knobs: {},
      },
      {
        id: 'alpha',
        name: 'A',
        description: 'First',
        group: 'General',
        version: 1,
        seed: 1,
        density: 'dense',
        tags: [],
        knobs: { tasks: { perPerson: 3, mix: { done: 0.5, open: 0.5 } }, archive: true },
      },
    ],
    themes: [
      { id: 'sunset', name: 'Sunset' },
      { id: 'forest', name: 'Forest' },
    ],
    timeline: false,
    routes: [
      { path: '/', name: 'Home', description: 'Start', capability: null },
      { path: '/a', name: 'A', description: null, capability: 'tasks:read' },
    ],
    personasError: 'boom',
  };

  it('parses versions in order and keeps only live tables with their latest definition', () => {
    const facts = toSpecFacts(raw, 2);
    expect(facts.versions.map((v) => [v.version, v.tables.map((t) => t.table), v.deleted])).toEqual(
      [
        [1, ['legacy', 'notes', 'tasks'], []],
        [2, ['tasks'], ['legacy']],
      ]
    );
    expect(facts.tables.map((t) => [t.table, t.indexes.map((i) => i.name)])).toEqual([
      ['notes', ['taskId']],
      ['tasks', ['labels', 'status']],
    ]);
    expect(facts.schemaVersion).toBe(2);
  });

  it('sorts roles, capabilities, rules, personas, scenarios, tags, knob keys and themes; keeps route order', () => {
    const facts = toSpecFacts(raw, 2);
    expect(facts.policy).toEqual({
      roles: [
        { role: 'owner', capabilities: ['tasks:read', 'tasks:write'] },
        { role: 'viewer', capabilities: ['tasks:read'] },
      ],
      capabilities: ['tasks:read', 'tasks:write'],
      rules: ['notes:delete', 'tasks:write'],
    });
    expect(facts.personas.map((p) => p.id)).toEqual(['user_0001', 'user_0002']);
    expect(facts.scenarios.map((s) => s.id)).toEqual(['alpha', 'zeta']);
    expect(facts.scenarios[1]?.tags).toEqual(['a', 'b']);
    expect(JSON.stringify(facts.scenarios[0]?.knobs)).toBe(
      '{"archive":true,"tasks":{"mix":{"done":0.5,"open":0.5},"perPerson":3}}'
    );
    expect(facts.themes.map((t) => t.id)).toEqual(['forest', 'sunset']);
    expect(facts.routes?.map((r) => r.path)).toEqual(['/', '/a']);
    expect(facts.warnings).toEqual(['personas: boom']);
  });

  it('is deterministic for differently ordered input', () => {
    const shuffled = {
      ...raw,
      versions: [...raw.versions].reverse(),
      personas: [...raw.personas].reverse(),
      scenarios: [...raw.scenarios].reverse(),
      themes: [...raw.themes].reverse(),
    };
    expect(JSON.stringify(toSpecFacts(shuffled, 2))).toBe(JSON.stringify(toSpecFacts(raw, 2)));
  });

  it('reports no policy as null', () => {
    expect(toSpecFacts({ ...raw, policy: null }, 2).policy).toBeNull();
  });
});

describe('inspectSpec (real prototypes, child process)', { timeout: 120_000 }, () => {
  it('extracts crm-demo facts from the definition and src/routes.ts, identically on every run', async () => {
    const first = await inspectSpec(ROOT, prototypeDir('crm-demo'));
    const second = await inspectSpec(ROOT, prototypeDir('crm-demo'));
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));

    const manifest = JSON.parse(
      readFileSync(join(prototypeDir('crm-demo'), 'protoyard.json'), 'utf8')
    ) as {
      id: string;
      scenarios: string[];
      defaultScenario: string;
      storage: { schemaVersion: number };
    };
    expect(first.manifest.id).toBe(manifest.id);
    expect(first.schemaVersion).toBe(manifest.storage.schemaVersion);
    expect(first.versions.at(-1)?.version).toBe(manifest.storage.schemaVersion);
    expect(typeof first.generatorVersion).toBe('number');
    expect(first.timeline).toBe(true);
    expect(first.warnings).toEqual([]);

    const tables = first.tables.map((t) => t.table);
    expect(tables).toEqual([...tables].sort());
    expect(tables).toEqual(
      expect.arrayContaining(['companies', 'contacts', 'deals', 'activities'])
    );
    for (const table of first.tables) expect(table.primaryKey?.name).toBe('id');

    expect(first.policy?.roles.map((r) => r.role)).toEqual(['admin', 'owner', 'rep', 'viewer']);
    expect(first.policy?.rules.length).toBeGreaterThan(0);

    expect(first.personasScenario).toBe(manifest.defaultScenario);
    expect(first.personas.length).toBeGreaterThan(0);
    expect(first.personas.map((p) => p.id)).toEqual(first.personas.map((p) => p.id).sort());
    expect(first.personas.some((p) => p.role === 'owner')).toBe(true);

    expect(first.scenarios.map((s) => s.id)).toEqual([...manifest.scenarios].sort());
    expect(first.scenarios.find((s) => s.id === manifest.defaultScenario)?.knobs).not.toEqual({});

    // src/routes.ts is read without compiling Svelte (screens are lazy loaders).
    expect(first.routes?.map((r) => r.path)).toEqual([
      '/',
      '/pipeline',
      '/deals',
      '/deals/:id',
      '/companies',
      '/companies/:id',
      '/contacts',
      '/activity',
      '/team',
    ]);
    expect(first.routes?.find((r) => r.path === '/deals')).toMatchObject({
      name: 'Deals',
      capability: 'deals:read',
    });
  });

  it('reports routes as null for a prototype without src/routes.ts', async () => {
    const facts: SpecFacts = await inspectSpec(ROOT, prototypeDir('mobile-banking-demo'));
    expect(facts.routes).toBeNull();
    expect(facts.warnings).toEqual([]);
    expect(
      facts.tables.find((t) => t.table === 'transactions')?.indexes.map((i) => i.name)
    ).toContain('[accountId+at]');
  });
});
