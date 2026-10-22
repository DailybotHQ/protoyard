// @vitest-environment node
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyListing,
  LISTING_CONFIG_FILE,
  listingNote,
  matchesListing,
  readListingConfig,
} from '../src/lib/listing.ts';
import type { Registry, RegistryEntry } from '../src/lib/registry.ts';
import { addPrototype, addTemplate, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/*
 * protoyard.workspace.json `listing.include.category` limits default listings
 * (here: `protoyard list`, the showcase and the review index; the gallery has
 * its own copy, apps/gallery/tests/listing.test.ts). No file lists everything;
 * `list --all` and PROTOYARD_LISTING=all list everything.
 */

let ws: TempWorkspace | undefined;
const dirs: string[] = [];
afterEach(() => {
  ws?.cleanup();
  ws = undefined;
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function root(workspace?: unknown): string {
  const dir = mkdtempSync(join(tmpdir(), 'protoyard-listing-'));
  dirs.push(dir);
  if (workspace !== undefined) {
    writeFileSync(
      join(dir, LISTING_CONFIG_FILE),
      typeof workspace === 'string' ? workspace : JSON.stringify(workspace)
    );
  }
  return dir;
}

const entry = (slug: string, kind: RegistryEntry['kind'], category: string) =>
  ({ slug, kind, category }) as RegistryEntry;

function registry(entries: RegistryEntry[]): Registry {
  return {
    format: 'protoyard.registry',
    version: 1,
    generatedAt: '2026-10-22T00:00:00.000Z',
    entries,
    invalid: [],
    stats: {
      total: entries.length,
      prototypes: entries.filter((e) => e.kind === 'prototype').length,
      templates: entries.filter((e) => e.kind === 'template').length,
      blueprints: entries.filter((e) => e.kind === 'blueprint').length,
      invalid: 0,
    },
  } as Registry;
}

const sample = [
  entry('crm', 'prototype', 'sales'),
  entry('ledger', 'prototype', 'finance'),
  entry('tickets', 'prototype', 'support'),
  entry('dashboard', 'template', 'analytics'),
  entry('pipeline', 'blueprint', 'sales'),
];

describe('readListingConfig', () => {
  it('lists everything with no file, no listing or no categories', () => {
    expect(readListingConfig(root(), {})).toEqual({ rule: null, source: 'none' });
    expect(readListingConfig(root({ other: { owned: 'elsewhere' } }), {})).toEqual({
      rule: null,
      source: 'none',
    });
    expect(readListingConfig(root({ listing: { include: { category: [] } } }), {}).rule).toBeNull();
  });

  it('reads included categories and the kinds they apply to', () => {
    const config = readListingConfig(
      root({ listing: { include: { category: ['sales', ' finance ', 'sales'] } } }),
      {}
    );
    expect(config).toEqual({
      rule: { categories: ['sales', 'finance'], kinds: null },
      source: 'file',
    });
    const scoped = readListingConfig(
      root({
        listing: { include: { category: ['sales'] }, appliesTo: ['blueprint', 'prototype'] },
      }),
      {}
    );
    // Kinds come back in a fixed order.
    expect(scoped.rule?.kinds).toEqual(['prototype', 'blueprint']);
  });

  it('ignores the file for PROTOYARD_LISTING=all', () => {
    const dir = root({ listing: { include: { category: ['sales'] } } });
    expect(readListingConfig(dir, { PROTOYARD_LISTING: 'all' })).toEqual({
      rule: null,
      source: 'all',
    });
    expect(readListingConfig(dir, { PROTOYARD_LISTING: 'other' }).source).toBe('file');
  });

  it('reports an unusable file and lists everything rather than hiding the catalog', () => {
    const cases: unknown[] = [
      '{ not json',
      { listing: { include: { category: 'sales' } } },
      { listing: { include: { category: [''] } } },
      { listing: { include: { category: ['x'.repeat(41)] } } },
      { listing: { include: { categories: ['sales'] } } },
      { listing: { include: { category: ['sales'] }, appliesTo: ['prototypes'] } },
      { listing: { include: { category: ['sales'] }, appliesTo: [] } },
      { listing: { exclude: { category: ['sales'] } } },
      { listing: 'sales' },
    ];
    for (const workspace of cases) {
      const config = readListingConfig(root(workspace), {});
      expect(config.rule, JSON.stringify(workspace)).toBeNull();
      expect(config.problem, JSON.stringify(workspace)).toMatch(/protoyard\.workspace\.json/);
      expect(config.problem).toMatch(/listing everything/);
    }
  });
});

describe('applyListing', () => {
  it('keeps every entry and the same object without a rule', () => {
    const all = registry(sample);
    expect(applyListing(all, null)).toEqual({ registry: all, hidden: 0 });
  });

  it('keeps only included categories, recounts stats and leaves the input alone', () => {
    const all = registry(sample);
    const { registry: listed, hidden } = applyListing(all, { categories: ['sales'], kinds: null });
    expect(listed.entries.map((e) => e.slug)).toEqual(['crm', 'pipeline']);
    expect(hidden).toBe(3);
    expect(listed.stats).toMatchObject({ total: 2, prototypes: 1, templates: 0, blueprints: 1 });
    expect(all.entries).toHaveLength(5);
  });

  it('applies only to the configured kinds', () => {
    const rule = { categories: ['sales'], kinds: ['prototype' as const] };
    const { registry: listed } = applyListing(registry(sample), rule);
    expect(listed.entries.map((e) => e.slug)).toEqual(['crm', 'dashboard', 'pipeline']);
    expect(matchesListing(entry('x', 'template', 'other'), rule)).toBe(true);
    expect(matchesListing(entry('x', 'prototype', 'other'), rule)).toBe(false);
  });

  it('explains hidden entries only when something was hidden', () => {
    const config = { rule: { categories: ['sales'], kinds: null }, source: 'file' as const };
    expect(listingNote(0, config)).toBeNull();
    expect(listingNote(2, config)).toBe(
      '2 hidden by protoyard.workspace.json (categories: sales); PROTOYARD_LISTING=all or list --all shows every entry.'
    );
  });
});

interface ListData {
  total: number;
  count: number;
  entries: { slug: string }[];
  listing: { source: string; hidden: number; categories?: string[] };
}

function workspaceWithCategories(listing?: unknown) {
  ws = createWorkspace();
  addPrototype(ws, 'sales-app', { category: 'sales' });
  addPrototype(ws, 'finance-app', { category: 'finance' });
  addTemplate(ws, 'blank');
  if (listing !== undefined) ws.write(LISTING_CONFIG_FILE, listing as object);
  return ws;
}

async function list(args: string[] = [], env: Record<string, string> = {}) {
  const workspace = ws as TempWorkspace;
  const run = await cli(['--root', workspace.root, '--json', 'list', ...args], env);
  expect(run.code, run.stderr).toBe(0);
  return run.json<{ data: ListData }>().data;
}

describe('protoyard list', () => {
  it('lists everything when the workspace has no listing file', async () => {
    workspaceWithCategories();
    const data = await list();
    expect(data.entries.map((e) => e.slug).sort()).toEqual(['blank', 'finance-app', 'sales-app']);
    expect(data.listing).toEqual({ source: 'none', hidden: 0 });
  });

  it('honors listing.include.category by default and keeps other kinds via appliesTo', async () => {
    workspaceWithCategories({
      listing: { include: { category: ['sales'] }, appliesTo: ['prototype'] },
    });
    const data = await list();
    expect(data.entries.map((e) => e.slug).sort()).toEqual(['blank', 'sales-app']);
    expect(data.listing).toEqual({
      source: 'file',
      hidden: 1,
      categories: ['sales'],
      kinds: ['prototype'],
    });
    expect(data.total).toBe(2);
    // The registry on disk still has every entry.
    const index = JSON.parse(
      (await import('node:fs')).readFileSync(
        join(ws?.root ?? '', '.protoyard/registry.json'),
        'utf8'
      )
    );
    expect(index.entries).toHaveLength(3);
  });

  it('shows everything with --all or PROTOYARD_LISTING=all', async () => {
    workspaceWithCategories({ listing: { include: { category: ['sales'] } } });
    expect((await list()).count).toBe(1);
    const flagged = await list(['--all']);
    expect(flagged.count).toBe(3);
    expect(flagged.listing).toEqual({ source: 'all', hidden: 0 });
    expect((await list([], { PROTOYARD_LISTING: 'all' })).count).toBe(3);
  });

  it('prints the hidden count in text mode and warns about an invalid file', async () => {
    workspaceWithCategories({ listing: { include: { category: ['sales'] } } });
    const text = await cli(['--root', ws?.root ?? '', 'list']);
    expect(text.code, text.stderr).toBe(0);
    expect(text.stdout).toContain('2 hidden by protoyard.workspace.json (categories: sales)');
    ws?.write(LISTING_CONFIG_FILE, '{ broken');
    const broken = await cli(['--root', ws?.root ?? '', 'list']);
    expect(broken.code).toBe(0);
    expect(broken.stdout + broken.stderr).toMatch(/not valid JSON.*listing everything/);
    expect(broken.stdout).toContain('finance-app');
  });
});
