// @vitest-environment node

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { readRegistry } from '../src/integrations/registry-plugin.mjs';

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

  it('rejects oversized and non-blueprint source files', () => {
    mkdirSync(join(blueprints, 'docs'), { recursive: true });
    writeFileSync(join(blueprints, 'large.json'), ' '.repeat(256 * 1024 + 1));
    mkdirSync(join(blueprints, 'docs', 'not-file.json'));
    writeRegistry([
      blueprintEntry('large'),
      blueprintEntry('not-file', 'blueprints/docs/not-file.json'),
    ]);

    const result = readTestRegistry();
    expect(result.entries).toEqual([]);
    expect(result.invalid.map((issue) => issue.errors[0])).toEqual([
      'Blueprint source exceeds the 262144-byte limit.',
      'Blueprint source is not a regular file.',
    ]);
  });

  it('rejects unsupported content-kind metadata on non-blueprint sources', () => {
    writeRegistry([
      {
        kind: 'template',
        slug: 'bad-kind',
        path: 'templates/bad-kind',
        blueprintKind: 'quiz',
      },
    ]);

    const result = readTestRegistry();
    expect(result.entries).toEqual([]);
    expect(result.invalid[0]?.errors).toEqual(['Registry entry has an unsupported blueprintKind.']);
  });

  it('keeps runnable sources whose blueprint kind is explicitly null', () => {
    writeRegistry([
      {
        kind: 'prototype',
        slug: 'example-app',
        path: 'prototypes/example-app',
        blueprintKind: null,
      },
    ]);

    const result = readTestRegistry();
    expect(result.entries).toEqual([
      expect.objectContaining({ kind: 'prototype', slug: 'example-app', blueprintKind: null }),
    ]);
    expect(result.invalid).toEqual([]);
  });
});
