// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readRegistry, resolveThumbnails } from '../src/integrations/registry-plugin.mjs';

const root = mkdtempSync(join(tmpdir(), 'gallery-registry-safety-'));
const registryPath = join(root, '.protoyard', 'registry.json');
const blueprints = join(root, 'blueprints');
type TestRegistry = {
  entries: { kind: string; blueprintKind?: string }[];
  invalid: { path: string; errors: string[] }[];
  stats: Record<string, unknown>;
};

afterAll(() => rmSync(root, { recursive: true, force: true }));
beforeEach(() => {
  rmSync(join(root, '.protoyard'), { recursive: true, force: true });
  rmSync(blueprints, { recursive: true, force: true });
  mkdirSync(join(root, '.protoyard'), { recursive: true });
  mkdirSync(blueprints, { recursive: true });
});

function catalogBlueprint(kind?: string) {
  return {
    ...(kind ? { kind } : {}),
    name: 'Catalog example',
    catalog: { category: 'sales' },
  };
}

function blueprintEntry(slug: string, path = `blueprints/${slug}.json`, extra = {}) {
  return {
    kind: 'blueprint',
    slug,
    path,
    blueprintKind: undefined,
    catalog: { category: 'sales', platforms: [], features: [], highlights: [] },
    ...extra,
  };
}

function writeRegistry(entries: unknown[]) {
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
}

function readTestRegistry() {
  return readRegistry(registryPath).registry as unknown as TestRegistry;
}

describe('gallery registry kind safety', () => {
  it('keeps the registry source kind separate and validates supported blueprint kinds', () => {
    const entries = [
      blueprintEntry('legacy-app'),
      blueprintEntry('roadmap-deck', 'blueprints/decks/roadmap-deck.json'),
      blueprintEntry('company-page', 'blueprints/pages/company-page.json'),
      blueprintEntry('handbook-doc', 'blueprints/docs/handbook-doc.json'),
    ];
    for (const entry of entries) mkdirSync(dirname(join(root, entry.path)), { recursive: true });
    writeFileSync(join(blueprints, 'legacy-app.json'), JSON.stringify(catalogBlueprint()));
    writeFileSync(
      join(blueprints, 'decks', 'roadmap-deck.json'),
      JSON.stringify(catalogBlueprint('deck'))
    );
    writeFileSync(
      join(blueprints, 'pages', 'company-page.json'),
      JSON.stringify(catalogBlueprint('page'))
    );
    writeFileSync(
      join(blueprints, 'docs', 'handbook-doc.json'),
      JSON.stringify(catalogBlueprint('doc'))
    );
    writeRegistry(entries);

    const result = readTestRegistry();
    expect(result.entries.map((entry) => [entry.kind, entry.blueprintKind])).toEqual([
      ['blueprint', 'app'],
      ['blueprint', 'deck'],
      ['blueprint', 'page'],
      ['blueprint', 'doc'],
    ]);
    expect(result.invalid).toEqual([]);
    expect(result.stats).toMatchObject({ total: 4, blueprints: 4, invalid: 0 });
  });

  it('omits unsupported, mismatched and malformed catalog records with diagnostics', () => {
    writeFileSync(join(blueprints, 'future-kind.json'), JSON.stringify(catalogBlueprint('quiz')));
    writeFileSync(join(blueprints, 'mismatch.json'), JSON.stringify(catalogBlueprint('deck')));
    writeFileSync(join(blueprints, 'no-catalog.json'), JSON.stringify({ kind: 'page' }));
    writeFileSync(
      join(blueprints, 'wrong-file-name.json'),
      JSON.stringify(catalogBlueprint('page'))
    );
    writeFileSync(
      join(blueprints, 'bad-registry-catalog.json'),
      JSON.stringify(catalogBlueprint('doc'))
    );
    writeRegistry([
      blueprintEntry('future-kind'),
      blueprintEntry('mismatch', undefined, { blueprintKind: 'page' }),
      blueprintEntry('no-catalog'),
      blueprintEntry('different-slug', 'blueprints/wrong-file-name.json'),
      blueprintEntry('bad-registry-catalog', undefined, {
        catalog: { category: 'invalid-category', platforms: [], features: [], highlights: [] },
      }),
    ]);

    const result = readTestRegistry();
    expect(result.entries).toEqual([]);
    expect(result.invalid.map((issue) => [issue.path, issue.errors[0]])).toEqual([
      ['blueprints/future-kind.json', expect.stringContaining('needs a newer Protoyard')],
      ['blueprints/mismatch.json', 'Registry blueprintKind does not match the blueprint source.'],
      ['blueprints/no-catalog.json', 'Blueprint catalog metadata is missing or invalid.'],
      [
        'blueprints/wrong-file-name.json',
        'Blueprint source file name does not match its registry slug.',
      ],
      ['blueprints/bad-registry-catalog.json', 'Registry catalog metadata is invalid.'],
    ]);
    expect(result.stats).toMatchObject({ total: 0, blueprints: 0, invalid: 5 });
  });

  it('reads the catalog installed with @protoyard/templates in a consumer workspace (Corag 1.5.0)', () => {
    const store = 'node_modules/.pnpm/@protoyard+templates@1.6.0/node_modules/@protoyard/templates';
    const hoisted = 'node_modules/@protoyard/templates';
    const entries = [
      blueprintEntry('crm', `${store}/blueprints/crm.json`),
      blueprintEntry('launch-deck', `${store}/blueprints/decks/launch-deck.json`),
      blueprintEntry('helpdesk', `${hoisted}/blueprints/helpdesk.json`),
      blueprintEntry('other', 'node_modules/other-package/blueprints/other.json'),
    ];
    for (const entry of entries) {
      mkdirSync(dirname(join(root, entry.path)), { recursive: true });
      const kind = entry.path.includes('/decks/') ? 'deck' : undefined;
      writeFileSync(join(root, entry.path), JSON.stringify(catalogBlueprint(kind)));
    }
    writeRegistry(entries);

    const result = readTestRegistry();
    rmSync(join(root, 'node_modules'), { recursive: true, force: true });
    expect(result.entries.map((entry) => entry.blueprintKind)).toEqual(['app', 'deck', 'app']);
    expect(result.invalid.map((issue) => issue.path)).toEqual([
      'node_modules/other-package/blueprints/other.json',
    ]);
  });

  it('rejects traversal and symlinked blueprint source paths', () => {
    const outside = join(root, 'outside.json');
    writeFileSync(outside, JSON.stringify(catalogBlueprint('deck')));
    symlinkSync(outside, join(blueprints, 'linked.json'));
    writeRegistry([
      blueprintEntry('traversal', '../outside.json'),
      blueprintEntry('linked', 'blueprints/linked.json'),
    ]);

    const result = readTestRegistry();
    expect(result.entries).toEqual([]);
    expect(result.invalid.map((issue) => issue.errors[0])).toEqual([
      'Registry entry has an unsafe source path.',
      'Blueprint source path contains a symlink.',
    ]);
  });
});

describe('gallery thumbnails (H1/L2 regressions)', () => {
  const thumbs = mkdtempSync(join(tmpdir(), 'gallery-thumbs-'));
  const outside = mkdtempSync(join(tmpdir(), 'gallery-outside-'));
  afterAll(() => {
    rmSync(thumbs, { recursive: true, force: true });
    rmSync(outside, { recursive: true, force: true });
  });
  const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
  const folder = (slug: string) => {
    const dir = join(thumbs, 'prototypes', slug, 'public');
    mkdirSync(dir, { recursive: true });
    return dir;
  };
  const entry = (slug: string, thumbnail: string, extra: Record<string, unknown> = {}) => ({
    kind: 'prototype',
    slug,
    path: `prototypes/${slug}`,
    thumbnail,
    ...extra,
  });

  it('publishes a regular image but never a symlinked one (PoC: ~/.ssh key)', () => {
    writeFileSync(join(folder('good'), 'thumbnail.png'), PNG);
    const result = resolveThumbnails(thumbs, [entry('good', 'public/thumbnail.png')]);
    expect(result.get('prototype:good')?.file).toBe('prototype-good.png');
    writeFileSync(join(outside, 'id_ed25519'), 'FAKE-SECRET-OUTSIDE-PROTOTYPE');
    symlinkSync(join(outside, 'id_ed25519'), join(folder('evil'), 'thumbnail.png'));
    expect(resolveThumbnails(thumbs, [entry('evil', 'public/thumbnail.png')]).size).toBe(0);
  });

  it('never publishes through a symlinked prototype folder or a ../ path', () => {
    const real = join(outside, 'elsewhere', 'public');
    mkdirSync(real, { recursive: true });
    writeFileSync(join(real, 'thumbnail.png'), PNG);
    symlinkSync(join(outside, 'elsewhere'), join(thumbs, 'prototypes', 'linked'));
    writeFileSync(join(outside, 'loose.png'), PNG);
    const result = resolveThumbnails(thumbs, [
      entry('linked', 'public/thumbnail.png'),
      entry('good', '../../../loose.png'),
    ]);
    expect(result.size).toBe(0);
  });

  it('ignores entries from an untrusted registry with unsafe slugs, kinds or paths', () => {
    writeFileSync(join(folder('ok-two'), 'thumbnail.png'), PNG);
    const result = resolveThumbnails(thumbs, [
      entry('../../escaped', 'public/thumbnail.png', { path: 'prototypes/ok-two' }),
      entry('ok-two', 'public/thumbnail.png', { kind: 'weird' }),
      entry('ok-two', 'public/thumbnail.png', { path: '../outside' }),
    ]);
    expect(result.size).toBe(0);
  });
});
