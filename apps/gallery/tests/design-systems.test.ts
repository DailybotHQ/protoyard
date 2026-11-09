// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import {
  readRegistry,
  validateDesignSystems,
  validBinding,
} from '../src/integrations/registry-plugin.mjs';
import { approvalLine, designSystemCards, kitSlug } from '../src/lib/design-systems';
import {
  applyQuery,
  DEFAULT_QUERY,
  haystack,
  paramsFromQuery,
  queryFromParams,
} from '../src/lib/search';
import type { CompactEntry, DesignSystemEntry } from '../src/lib/types';
import { sitemapPaths } from '../src/pages/sitemap.xml.ts';

/**
 * PLAN_013 T-registry in the gallery: the registry's top-level
 * `designSystems` array is read as untrusted input, the /design-systems/
 * page shows each one with its bound prototypes (and a kit link only when a
 * `<id>-kit` prototype exists), and the prototype browser filters by design
 * system.
 */

const HASH = 'c'.repeat(64);

function designSystem(overrides: Partial<DesignSystemEntry> = {}): DesignSystemEntry {
  return {
    id: 'harbor',
    name: 'Harbor',
    version: '1.0.0',
    status: 'approved',
    approvedBy: 'Ada Example',
    approvedAt: '2026-11-09T12:00:00.000Z',
    approvedVersion: '1.0.0',
    contentHash: HASH,
    lockable: true,
    layout: 'folder',
    path: 'design-systems/harbor',
    componentCount: 2,
    boundPrototypes: [
      { slug: 'harbor-orders', name: 'Harbor Orders', version: '1.0.0', locked: true },
      { slug: 'harbor-sketch', name: 'Harbor Sketch', version: '1.0.0', locked: false },
    ],
    ...overrides,
  };
}

function prototypeEntry(slug: string, binding?: unknown) {
  return {
    kind: 'prototype',
    slug,
    name: slug,
    path: `prototypes/${slug}`,
    thumbnail: null,
    category: 'general',
    ...(binding === undefined ? {} : { designSystem: binding }),
  };
}

describe('registry designSystems (untrusted input)', () => {
  const root = mkdtempSync(join(tmpdir(), 'gallery-design-systems-'));
  const registryPath = join(root, '.protoyard', 'registry.json');
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  beforeEach(() => {
    rmSync(join(root, '.protoyard'), { recursive: true, force: true });
    mkdirSync(join(root, '.protoyard'), { recursive: true });
  });

  function write(extra: Record<string, unknown>, entries: unknown[] = []) {
    writeFileSync(
      registryPath,
      JSON.stringify({
        format: 'protoyard.registry',
        version: 1,
        entries,
        invalid: [],
        stats: { total: entries.length, invalid: 0 },
        ...extra,
      })
    );
  }

  it('reads a registry from an older CLI (no designSystems) as an empty list', () => {
    write({}, [prototypeEntry('plain-app')]);
    const { registry } = readRegistry(registryPath);
    expect(registry?.designSystems).toEqual([]);
    expect(registry?.designSystemIssues).toEqual([]);
    expect(registry?.entries).toHaveLength(1);
    expect(registry?.stats).toMatchObject({ total: 1, prototypes: 1, designSystems: 0 });
  });

  it('keeps valid design systems and drops unsafe ones into designSystemIssues, never into invalid', () => {
    write(
      {
        designSystems: [
          designSystem(),
          designSystem({ id: '../escape', path: 'design-systems/../escape' }),
          designSystem({ id: 'atlas', name: 'Atlas', path: 'design-systems/elsewhere' }),
          designSystem({ id: 'nova', name: 'Nova Evil', path: 'design-systems/nova' }),
          designSystem({
            id: 'orbit',
            name: 'Orbit',
            path: 'design-systems/orbit',
            boundPrototypes: [{ slug: '../../x', name: 'X', version: '1.0.0', locked: true }],
          }),
          designSystem({ id: 'harbor' }),
          {
            ...designSystem({ id: 'legacy', layout: 'flat', path: 'design-systems/legacy.json' }),
            extra: '<script>',
          },
        ],
        designSystemIssues: [{ path: 'design-systems/broken', errors: ['Not valid JSON.'] }],
      },
      [prototypeEntry('harbor-orders', { id: 'harbor', version: '1.0.0', locked: true })]
    );
    const { registry } = readRegistry(registryPath);
    expect(registry?.designSystems?.map((ds: { id: string }) => ds.id)).toEqual([
      'harbor',
      'legacy',
    ]);
    // Unknown fields are not copied through.
    expect(registry?.designSystems?.[1]).not.toHaveProperty('extra');
    expect(registry?.designSystemIssues?.map((issue: { path: string }) => issue.path)).toEqual([
      'design-systems/broken',
      'designSystems[1]',
      'designSystems[2]',
      'designSystems[3]',
      'designSystems[4]',
      'designSystems[5]',
    ]);
    expect(registry?.invalid).toEqual([]);
    expect(registry?.entries).toHaveLength(1);
    expect(registry?.stats).toMatchObject({ designSystems: 2, invalid: 0 });
  });

  it('refuses a designSystems field that is not a list', () => {
    expect(validateDesignSystems({ harbor: designSystem() })).toEqual({
      designSystems: [],
      issues: [
        { path: 'designSystems', errors: ['The registry designSystems field is not a list.'] },
      ],
    });
  });

  it('strips a malformed binding from an entry but keeps the entry', () => {
    write({}, [
      prototypeEntry('good', { id: 'harbor', version: '1.2.0', locked: true, extra: 1 }),
      prototypeEntry('bad-id', { id: '../harbor', version: '1.2.0', locked: true }),
      prototypeEntry('bad-version', { id: 'harbor', version: '^1.2.0' }),
      prototypeEntry('none'),
    ]);
    const { registry } = readRegistry(registryPath);
    const bindings = Object.fromEntries(
      (registry?.entries ?? []).map((entry: { slug: string; designSystem: unknown }) => [
        entry.slug,
        entry.designSystem,
      ])
    );
    expect(bindings).toEqual({
      good: { id: 'harbor', version: '1.2.0', locked: true },
      'bad-id': null,
      'bad-version': null,
      none: null,
    });
    expect(validBinding({ id: 'harbor', version: '1.0.0' })).toEqual({
      id: 'harbor',
      version: '1.0.0',
      locked: false,
    });
  });
});

describe('/design-systems/ cards', () => {
  it('links listed prototypes, and shows a kit link only when <id>-kit is listed', () => {
    const listed = [
      { slug: 'harbor-orders', name: 'Harbor Orders' },
      { slug: 'atlas-board', name: 'Atlas Board' },
      { slug: 'atlas-kit', name: 'Atlas Kit' },
    ];
    const [harbor, atlas] = designSystemCards(
      [
        designSystem(),
        designSystem({
          id: 'atlas',
          name: 'Atlas',
          path: 'design-systems/atlas',
          status: 'draft',
          lockable: false,
          boundPrototypes: [
            { slug: 'atlas-board', name: 'Atlas Board', version: '0.2.0', locked: false },
          ],
        }),
      ],
      listed
    );
    expect(kitSlug('harbor')).toBe('harbor-kit');
    expect(harbor?.kit).toBeNull();
    expect(harbor?.bound.map((p) => [p.slug, p.href])).toEqual([
      ['harbor-orders', '/p/harbor-orders/'],
      // Hidden by the workspace listing or not indexed: shown, not linked.
      ['harbor-sketch', null],
    ]);
    expect(harbor?.locked).toBe(1);
    expect(harbor?.filterHref).toBe('/?ds=harbor#browse');
    expect(atlas?.kit).toEqual({ slug: 'atlas-kit', name: 'Atlas Kit', href: '/p/atlas-kit/' });

    const unused = designSystemCards([designSystem({ boundPrototypes: [] })], listed)[0];
    expect(unused?.filterHref).toBeNull();
    expect(unused?.kit).toBeNull();
  });

  it('describes the approval honestly', () => {
    expect(approvalLine(designSystem())).toBe('Approved by Ada Example on 2026-11-09.');
    expect(approvalLine(designSystem({ version: '1.1.0' }))).toBe(
      'Approved by Ada Example on 2026-11-09 (version 1.0.0; the document is now 1.1.0).'
    );
    expect(approvalLine(designSystem({ status: 'draft' }))).toBe('Draft: not approved yet.');
    expect(approvalLine(designSystem({ status: 'draft', layout: 'flat' }))).toMatch(
      /flat document/
    );
  });

  it('is in the sitemap', () => {
    expect(sitemapPaths({ prototypes: [], templates: [], shelf: [], docs: [] })).toContain(
      '/design-systems/'
    );
  });
});

describe('prototype browser: filter by design system', () => {
  const entry = (s: string, ds?: string): CompactEntry => ({
    k: 'prototype',
    s,
    n: s,
    d: '',
    c: 'general',
    t: [],
    p: 'responsive',
    st: 'active',
    tp: null,
    i: null,
    sc: 1,
    m: '2026-11-09T00:00:00.000Z',
    th: null,
    e: null,
    ...(ds ? { ds } : {}),
  });
  const index = [
    entry('harbor-orders', 'harbor'),
    entry('atlas-board', 'atlas'),
    entry('plain'),
  ].map((e) => ({ entry: e, text: haystack(e) }));
  const library = { favorites: [], recent: [] };

  it('keeps only the prototypes bound to the chosen design system', () => {
    expect(applyQuery(index, { ...DEFAULT_QUERY, ds: 'harbor' }, library).map((e) => e.s)).toEqual([
      'harbor-orders',
    ]);
    expect(applyQuery(index, DEFAULT_QUERY, library)).toHaveLength(3);
  });

  it('round-trips through the URL and bounds the value', () => {
    const query = queryFromParams(new URLSearchParams('ds=atlas'));
    expect(query.ds).toBe('atlas');
    expect(paramsFromQuery(query)).toBe('?ds=atlas');
    expect(queryFromParams(new URLSearchParams(`ds=${'x'.repeat(200)}`)).ds).toHaveLength(64);
    expect(queryFromParams(new URLSearchParams('')).ds).toBe('');
  });
});
