import type { WorldSeed } from '@protoyard/core';
import { validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { contextFor as buildContext } from '../../../tests/support/generate-context.ts';
import type { Page, PageVersion, Space } from '../src/database/schema.ts';
import {
  descendants,
  highlight,
  lineChanges,
  pageTree,
  plainText,
  searchPages,
  terms,
  wouldCycle,
} from '../src/domain/wiki.ts';
import { definition } from '../src/prototype.ts';
import { generateWikiWorld, HOSTILE_BODY } from '../src/scenarios/generators.ts';

const contextFor = (id: string, seed?: number) => buildContext(definition.scenarios, id, seed);
const world = (id: string) => generateWikiWorld(contextFor(id));
const rows = <T>(w: WorldSeed, table: string) => (w.tables[table] ?? []) as unknown as T[];
const REF = '2026-10-14T13:00:00.000Z';

describe('wiki generator', () => {
  it.each(definition.scenarios.map((s) => s.id))(
    '%s is deterministic per scenario and passes integrity',
    (id) => {
      const ctx = contextFor(id);
      const w = generateWikiWorld(ctx);
      expect(generateWikiWorld(contextFor(id))).toEqual(w);
      expect(
        validateWorld(w, { ...definition.integrity, referenceTime: ctx.scenario.referenceTime })
      ).toEqual([]);
      expect(w.memberships.find((m) => m.personaId === ctx.scenario.actor.id)?.role).toBe(
        ctx.scenario.actor.role
      );
    }
  );

  it('differs for another seed', () => {
    expect(generateWikiWorld(contextFor('active', 77)).tables.pages).not.toEqual(
      world('active').tables.pages
    );
  });

  it('builds nested trees whose history ends at the current page', () => {
    const w = world('active');
    const spaces = rows<Space>(w, 'spaces');
    const pages = rows<Page>(w, 'pages');
    const versions = rows<PageVersion>(w, 'versions');
    expect(spaces.map((s) => s.key)).toEqual(['ENG', 'PRD', 'OPS']);
    expect(pages.length).toBeGreaterThan(40);
    const tree = pageTree(pages);
    expect(pages.some((p) => p.parentId && tree.byId.get(p.parentId)?.parentId)).toBe(true); // depth ≥ 3
    for (const p of pages) {
      const mine = versions.filter((v) => v.pageId === p.id).sort((a, b) => a.version - b.version);
      expect(mine.map((v) => v.version)).toEqual(
        Array.from({ length: p.version }, (_, i) => i + 1)
      );
      expect(mine.at(-1)).toMatchObject({ body: p.body, title: p.title, at: p.updatedAt });
      expect(p.updatedAt <= REF).toBe(true);
      if (p.parentId) expect(tree.byId.get(p.parentId)?.spaceId).toBe(p.spaceId);
    }
    // Sibling ranks are unique, so the tree order is stable.
    const keys = pages.map((p) => `${p.spaceId}/${p.parentId}/${p.rank}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect(pages.find((p) => p.title === 'Markdown safety check')?.body).toBe(HOSTILE_BODY);
  });

  it('scales from an empty wiki to about 1,500 pages', () => {
    expect(rows(world('empty'), 'spaces')).toHaveLength(0);
    expect(rows(world('empty'), 'pages')).toHaveLength(0);
    const large = rows<Page>(world('large'), 'pages');
    expect(large.length).toBeGreaterThan(1400);
    expect(large.length).toBeLessThan(1600);
  });
});

describe('wiki rules', () => {
  const page = (over: Partial<Page>): Page => ({
    id: 'p',
    spaceId: 's',
    parentId: null,
    rank: 'a0',
    title: '',
    body: '',
    version: 1,
    createdBy: 'u',
    createdAt: REF,
    updatedBy: 'u',
    updatedAt: REF,
    ...over,
  });

  it('turns Markdown into plain text and keeps raw HTML as literal text', () => {
    expect(
      plainText('# Title\n\n- **Bold** and [link](https://example.com)\n```js\ncode()\n```')
    ).toBe('Title Bold and link code()');
    expect(plainText('<script>x</script>')).toBe('<script>x</script>');
  });

  it('ranks title matches first, needs every term, and highlights without HTML', () => {
    const pages = [
      page({
        id: 'a',
        title: 'Deploy guide',
        body: 'How to deploy.',
        updatedAt: '2026-10-01T00:00:00.000Z',
      }),
      page({
        id: 'b',
        title: 'Notes',
        body: 'We deploy on Fridays. Deploy carefully.',
        updatedAt: '2026-10-10T00:00:00.000Z',
      }),
      page({ id: 'c', title: 'Other', body: 'Nothing here.' }),
      page({ id: 'd', title: 'Deploy', body: 'guide', spaceId: 'other' }),
    ];
    expect(searchPages(pages, 'deploy').map((h) => h.page.id)).toEqual(['a', 'd', 'b']);
    expect(searchPages(pages, 'deploy fridays').map((h) => h.page.id)).toEqual(['b']);
    expect(searchPages(pages, 'deploy', { spaceId: 's' }).map((h) => h.page.id)).toEqual([
      'a',
      'b',
    ]);
    expect(searchPages(pages, ' ')).toEqual([]);
    expect(terms('A deploy, Deploy!')).toEqual(['deploy']);
    expect(highlight('Deploy <b>now</b>', ['deploy', 'now'])).toEqual([
      { text: 'Deploy', match: true },
      { text: ' <b>', match: false },
      { text: 'now', match: true },
      { text: '</b>', match: false },
    ]);
  });

  it('finds cycles and descendants, and counts changed lines', () => {
    const pages = [
      page({ id: 'a' }),
      page({ id: 'b', parentId: 'a' }),
      page({ id: 'c', parentId: 'b' }),
    ];
    const tree = pageTree(pages);
    expect(wouldCycle(tree, 'a', 'c')).toBe(true);
    expect(wouldCycle(tree, 'c', 'a')).toBe(false);
    expect(wouldCycle(tree, 'a', null)).toBe(false);
    expect(descendants(tree, 'a')).toEqual(['b', 'c']);
    expect(lineChanges('a\nb\nc', 'a\nc\nd\ne')).toEqual({ added: 2, removed: 1 });
  });
});
