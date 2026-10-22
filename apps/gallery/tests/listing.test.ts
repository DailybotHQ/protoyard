// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readListingConfig } from '../../../packages/cli/src/lib/listing.ts';
import { listingRule, readRegistry } from '../src/integrations/registry-plugin.mjs';

/*
 * The gallery (and the marketplace, which reads the same registry module)
 * honors protoyard.workspace.json `listing.include.category`. The rule is a
 * plain-JS copy of the CLI's, so the last test holds both to the same cases.
 */

const root = mkdtempSync(join(tmpdir(), 'gallery-listing-'));
const registryPath = join(root, '.protoyard', 'registry.json');
const workspaceFile = join(root, 'protoyard.workspace.json');

type Listed = {
  registry: { entries: { slug: string }[]; stats: Record<string, number> };
  listing: { source: string; hidden: number; problem?: string };
};

const entries = [
  { kind: 'prototype', slug: 'crm', path: 'prototypes/crm', category: 'sales' },
  { kind: 'prototype', slug: 'ledger', path: 'prototypes/ledger', category: 'finance' },
  { kind: 'template', slug: 'dashboard', path: 'templates/dashboard', category: 'analytics' },
];

afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  rmSync(join(root, '.protoyard'), { recursive: true, force: true });
  rmSync(workspaceFile, { force: true });
  mkdirSync(join(root, '.protoyard'), { recursive: true });
  writeFileSync(
    registryPath,
    JSON.stringify({
      format: 'protoyard.registry',
      version: 1,
      entries,
      invalid: [],
      stats: { total: entries.length, invalid: 0 },
    })
  );
});

const workspace = (value: unknown) =>
  writeFileSync(workspaceFile, typeof value === 'string' ? value : JSON.stringify(value));

const read = (env: Record<string, string | undefined> = {}) =>
  readRegistry(registryPath, env) as unknown as Listed;

const slugs = (listed: Listed) => listed.registry.entries.map((e) => e.slug);

describe('gallery workspace listing', () => {
  it('lists every entry when no listing is configured', () => {
    expect(slugs(read())).toEqual(['crm', 'ledger', 'dashboard']);
    expect(read().listing).toEqual({ source: 'none', hidden: 0 });
    workspace({ unrelated: true });
    expect(slugs(read())).toEqual(['crm', 'ledger', 'dashboard']);
  });

  it('includes only the configured categories and recounts the stats', () => {
    workspace({ listing: { include: { category: ['sales'] } } });
    const listed = read();
    expect(slugs(listed)).toEqual(['crm']);
    expect(listed.listing).toEqual({ source: 'file', hidden: 2 });
    expect(listed.registry.stats).toMatchObject({ total: 1, prototypes: 1, templates: 0 });
  });

  it('limits the rule to appliesTo kinds', () => {
    workspace({ listing: { include: { category: ['sales'] }, appliesTo: ['prototype'] } });
    expect(slugs(read())).toEqual(['crm', 'dashboard']);
  });

  it('lists everything for PROTOYARD_LISTING=all', () => {
    workspace({ listing: { include: { category: ['sales'] } } });
    const listed = read({ PROTOYARD_LISTING: 'all' });
    expect(slugs(listed)).toEqual(['crm', 'ledger', 'dashboard']);
    expect(listed.listing.source).toBe('all');
  });

  it('reports an invalid file and lists everything', () => {
    workspace({ listing: { include: { category: 'sales' } } });
    const listed = read();
    expect(slugs(listed)).toHaveLength(3);
    expect(listed.listing.problem).toMatch(/listing\.include\.category; listing everything/);
  });

  it('agrees with the CLI rule on every case', () => {
    const cases: unknown[] = [
      undefined,
      { other: 1 },
      { listing: {} },
      { listing: { include: {} } },
      { listing: { include: { category: [] } } },
      { listing: { include: { category: ['sales', ' sales ', 'finance'] } } },
      { listing: { include: { category: ['sales'] }, appliesTo: ['template', 'prototype'] } },
      { listing: { include: { category: ['sales'] }, appliesTo: [] } },
      { listing: { include: { category: ['sales'] }, appliesTo: ['apps'] } },
      { listing: { include: { category: [''] } } },
      { listing: { include: { category: ['x'.repeat(41)] } } },
      { listing: { include: { category: [1] } } },
      { listing: { include: { categories: ['sales'] } } },
      { listing: { exclude: {} } },
      { listing: [] },
      [],
      '{ nope',
    ];
    for (const value of cases) {
      rmSync(workspaceFile, { force: true });
      if (value !== undefined) workspace(value);
      for (const env of [{}, { PROTOYARD_LISTING: 'all' }]) {
        const gallery = listingRule(root, env);
        const cli = readListingConfig(root, env);
        const label = JSON.stringify({ value, env });
        expect(gallery.rule, label).toEqual(cli.rule);
        expect(gallery.source, label).toBe(cli.source);
        expect(Boolean(gallery.problem), label).toBe(Boolean(cli.problem));
      }
    }
  });
});
