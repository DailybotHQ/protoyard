// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { SpecFacts } from '../src/lib/inspect.ts';
import { workspacePaths } from '../src/lib/paths.ts';
import { buildIndex, findEntry } from '../src/lib/registry.ts';
import { renderRegion } from '../src/lib/spec-render.ts';
import { cli, createWorkspace, helpdeskBlueprint } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const KIND_FIXTURES = `${ROOT}/packages/blueprint/tests/fixtures/kinds`;
const catalog = { category: 'productivity' };

function fixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(`${KIND_FIXTURES}/${name}`, 'utf8')) as Record<string, unknown>;
}

describe('blueprint kind CLI and catalog discovery', () => {
  it('validates and summarizes deck, page, and doc content', async () => {
    const deck = fixture('intro.deck.json');
    (deck.deck as { slides: unknown[] }).slides.push({
      id: 'free-slide',
      layout: 'free',
      blocks: [
        { type: 'heading', id: 'free-heading', level: 2, text: 'Reveal' },
        {
          type: 'reveal',
          id: 'more',
          label: 'More',
          blocks: [{ type: 'text', markdown: 'Details' }],
        },
      ],
    });
    const cases = [
      {
        name: 'app',
        value: helpdeskBlueprint(),
        expected: {
          kind: 'app',
          entities: [
            { name: 'customer', fields: 2 },
            { name: 'support-ticket', fields: 3 },
          ],
          roles: ['owner', 'admin', 'member', 'viewer'],
          screens: 0,
        },
      },
      {
        name: 'deck',
        value: deck,
        expected: { kind: 'deck', slides: 2, blocks: 3, interactiveBlocks: 1 },
      },
      {
        name: 'page',
        value: fixture('landing.page.json'),
        expected: { kind: 'page', sections: 4, forms: 1 },
      },
      {
        name: 'doc',
        value: fixture('quarterly-report.doc.json'),
        expected: { kind: 'doc', sections: 2, headings: 4 },
      },
    ];
    const ws = createWorkspace();
    try {
      for (const item of cases) {
        const path = `${ws.root}/${item.name}.json`;
        ws.write(`${item.name}.json`, item.value);
        const result = await cli(['--json', 'blueprint', 'validate', path]);
        expect(result.code, result.stdout).toBe(0);
        expect(result.json<{ data: Record<string, unknown> }>().data).toMatchObject(item.expected);
      }
    } finally {
      ws.cleanup();
    }
  });

  it('indexes kind shelves without brands, exposes kind, and rejects cross-shelf slug collisions', async () => {
    const ws = createWorkspace();
    try {
      for (const kind of ['deck', 'page', 'doc'] as const) {
        const value = fixture(
          kind === 'deck'
            ? 'intro.deck.json'
            : kind === 'page'
              ? 'landing.page.json'
              : 'quarterly-report.doc.json'
        );
        value.catalog = catalog;
        const shelf = kind === 'doc' ? 'docs' : `${kind}s`;
        ws.write(`blueprints/${shelf}/${kind}-catalog.json`, value);
      }
      const collision = fixture('intro.deck.json');
      collision.catalog = catalog;
      ws.write('blueprints/decks/shared.json', collision);
      const duplicate = fixture('landing.page.json');
      duplicate.catalog = catalog;
      ws.write('blueprints/pages/shared.json', duplicate);

      const { registry } = await buildIndex(workspacePaths(ws.root), {
        useCache: false,
        write: false,
      });
      for (const kind of ['deck', 'page', 'doc'] as const) {
        expect(findEntry(registry, `${kind}-catalog`, 'blueprint')?.blueprintKind).toBe(kind);
      }
      expect(findEntry(registry, 'shared', 'blueprint')).toBeUndefined();
      expect(registry.invalid.filter((issue) => issue.path.endsWith('/shared.json'))).toHaveLength(
        2
      );
      expect(registry.stats.blueprints).toBe(3);
    } finally {
      ws.cleanup();
    }
  });

  it('omits app entity sections from content-kind generated specs', () => {
    const manifest = {
      id: 'example.kind',
      slug: 'kind',
      name: 'Kind',
      version: '0.1.0',
      platform: 'responsive',
      category: 'general',
      defaultTheme: 'violet',
      namespace: 'kind',
    };
    const facts = {
      manifest: { ...manifest, blueprintKind: 'deck' },
      tables: [{ table: 'should-not-appear', primaryKey: null, indexes: [] }],
      versions: [{ version: 1, tables: [], deleted: [] }],
    } as unknown as SpecFacts;
    expect(renderRegion('tables', facts)).toMatch(/do not apply to deck/);
    expect(renderRegion('versions', facts)).toMatch(/do not apply to deck/);
    expect(renderRegion('er-diagram', facts)).toMatch(/do not apply to deck/);
    expect(
      renderRegion('tables', {
        ...facts,
        manifest: { ...manifest, blueprintKind: 'app' },
      } as SpecFacts)
    ).toContain('should-not-appear');
  });
});
