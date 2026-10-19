// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALOG_CATEGORIES, parseManifest } from '@protoyard/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { checkCatalog } from '../src/commands/validate.ts';
import {
  addPrototype,
  addTemplate,
  cli,
  createWorkspace,
  manifest,
  type TempWorkspace,
} from './helpers.ts';

type Check = { id: string; status: string; details: string[] };

const catalog = {
  category: 'support',
  productType: 'Help desk',
  platforms: ['web'],
  features: ['tickets', 'sla'],
  highlights: ['Tickets with SLAs'],
  difficulty: 'intermediate',
};

describe('checkCatalog', () => {
  it('warns for a template without a catalog block, pointing at the shared category list', () => {
    const result = checkCatalog(parseManifest(manifest({ kind: 'template' })), 'template');
    expect(result).toMatchObject({ id: 'catalog', status: 'warn' });
    expect(result.details.join(' ')).toMatch(/CATALOG_CATEGORIES/);
  });

  it('treats the block as optional for prototypes', () => {
    expect(checkCatalog(parseManifest(manifest()), 'prototype')).toMatchObject({
      status: 'skip',
      details: ['optional for prototypes'],
    });
  });

  it('passes and summarizes a catalog block', () => {
    const result = checkCatalog(parseManifest(manifest({ catalog })), 'template');
    expect(result.status).toBe('pass');
    expect(result.details).toEqual([
      'support · Help desk',
      'platforms: web',
      'features: tickets, sla',
    ]);
  });
});

describe('protoyard validate: catalog check', () => {
  let ws: TempWorkspace;
  beforeEach(() => {
    ws = createWorkspace();
  });
  afterEach(() => ws.cleanup());

  async function catalogCheck(slug: string): Promise<Check | undefined> {
    const run = await cli(['--root', ws.root, '--json', 'validate', slug, '--skip-typecheck']);
    const checks = run.json<{ data: { checks: Check[] } }>().data.checks;
    return checks.find((c) => c.id === 'catalog');
  }

  it('reports a warning for a template without a catalog, and a pass once it has one', async () => {
    addTemplate(ws, 'blank');
    expect(await catalogCheck('blank')).toMatchObject({ status: 'warn' });

    ws.write(
      'templates/blank/protoyard.json',
      manifest({ id: 'template.blank', slug: 'blank', kind: 'template', name: 'Blank', catalog })
    );
    expect(await catalogCheck('blank')).toMatchObject({
      status: 'pass',
      details: expect.arrayContaining(['support · Help desk']),
    });
  });

  it('rejects a category outside the shared list through the manifest schema', async () => {
    addPrototype(ws, 'free-form', { catalog: { ...catalog, category: 'helpdesks' } });
    const run = await cli([
      '--root',
      ws.root,
      '--json',
      'validate',
      'free-form',
      '--skip-typecheck',
    ]);
    const checks = run.json<{ data: { checks: Check[] } }>().data.checks;
    expect(checks.find((c) => c.id === 'manifest')?.status).toBe('fail');
    expect(checks.find((c) => c.id === 'catalog')).toBeUndefined();
  });
});

describe('repository manifests', () => {
  const root = join(import.meta.dirname, '../../..');
  const folders = ['templates', 'prototypes'].flatMap((top) =>
    readdirSync(join(root, top), { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => join(top, d.name))
  );

  it('scans real folders (a scan that finds nothing proves nothing)', () => {
    expect(folders.length).toBeGreaterThan(10);
  });

  it('every template and prototype has a valid catalog block from the shared category list', () => {
    const problems: string[] = [];
    for (const folder of folders) {
      const parsed = parseManifest(
        JSON.parse(readFileSync(join(root, folder, 'protoyard.json'), 'utf8'))
      );
      if (!parsed.catalog) problems.push(`${folder}: no catalog block`);
      else if (!CATALOG_CATEGORIES.includes(parsed.catalog.category))
        problems.push(`${folder}: unknown category`);
    }
    expect(problems).toEqual([]);
  });
});
