import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
// @protoyard/blocks is not a dependency of @protoyard/blueprint; the examples
// are checked against the real block contract by path, as other packages' tests do.
import {
  BLOCK_TYPES,
  BlockListSchema,
  forEachBlock,
  safeParseBlocks,
} from '../../blocks/src/index.ts';
import { detectBlueprintKind, safeParseAnyBlueprint } from '../src/index.ts';
import { kindBodySchema } from '../src/kinds/bodies.ts';
import { withKindBodySchemaForTesting } from '../src/kinds/testing.ts';
import { BLUEPRINT_BASE_SHAPE } from '../src/schema.ts';

/**
 * The kind-specific example catalog (`blueprints/pages/`, `blueprints/docs/`).
 * The CLI indexes only flat `blueprints/*.json` app blueprints, so these
 * folders stay out of the app marketplace.
 *
 * Body shape (from T-pages-kind-model): a page is `page.sections[]` of
 * `{ id, anchor?, blocks[] }`; a doc is a `doc.blocks[]` flow with optional
 * `doc.toc { depth, sticky }`. Blocks are validated here against
 * `@protoyard/blocks`; the full union parse runs once the page and doc body
 * schemas are wired into `kindBodySchema` (T-pages-wire).
 */

const ROOT = join(import.meta.dirname, '../../..');
const DIRS = { page: join(ROOT, 'blueprints/pages'), doc: join(ROOT, 'blueprints/docs') } as const;
type Kind = keyof typeof DIRS;

/** Keys only an app blueprint may have (`BlueprintShape` minus the shared root). */
const APP_ONLY_KEYS = [
  'entities',
  'roles',
  'screens',
  'layout',
  'archetype',
  'scenarios',
  'relations',
  'workflows',
  'notifications',
  'validation',
] as const;

interface Example {
  kind: Kind;
  file: string;
  raw: Record<string, unknown>;
}

function examples(kind: Kind): Example[] {
  return readdirSync(DIRS[kind])
    .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
    .sort()
    .map((file) => ({
      kind,
      file,
      raw: JSON.parse(readFileSync(join(DIRS[kind], file), 'utf8')) as Record<string, unknown>,
    }));
}

const PAGES = examples('page');
const DOCS = examples('doc');
const ALL = [...PAGES, ...DOCS];

type Section = { id: string; anchor?: string; blocks: unknown[] };
const sectionsOf = (example: Example) => (example.raw.page as { sections: Section[] }).sections;
const docBlocksOf = (example: Example) => (example.raw.doc as { blocks: unknown[] }).blocks;
/** Every block list in an example: one per page section, or the doc flow. */
const blockLists = (example: Example): unknown[][] =>
  example.kind === 'page' ? sectionsOf(example).map((s) => s.blocks) : [docBlocksOf(example)];

/** Every string value, with its JSON path, for the fictional-data scan. */
function strings(value: unknown, path = '$'): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((item, i) => strings(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => strings(item, `${path}.${key}`));
  }
  return [];
}

/** Every object key anywhere in the document. */
function keys(value: unknown): string[] {
  if (Array.isArray(value)) return value.flatMap(keys);
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => [key, ...keys(item)]);
  }
  return [];
}

describe('kind-specific example catalog', () => {
  it('ships at least one landing page and one report or one-pager', () => {
    expect(PAGES.length).toBeGreaterThanOrEqual(1);
    expect(DOCS.length).toBeGreaterThanOrEqual(1);
    expect(PAGES.some(({ raw }) => (raw.tags as string[]).includes('landing'))).toBe(true);
    expect(
      DOCS.some(({ raw }) =>
        (raw.tags as string[]).some((tag) => tag === 'report' || tag === 'one-pager')
      )
    ).toBe(true);
  });

  it('keeps the examples out of the flat app marketplace root', () => {
    const root = readdirSync(join(ROOT, 'blueprints')).filter((name) => name.endsWith('.json'));
    for (const name of root) {
      const raw = JSON.parse(readFileSync(join(ROOT, 'blueprints', name), 'utf8'));
      expect({ name, kind: detectBlueprintKind(raw) }).toEqual({
        name,
        kind: { ok: true, kind: 'app' },
      });
    }
  });

  it.each(ALL.map((e) => [`${e.kind}s/${e.file}`, e] as const))(
    '%s declares the kind of its folder and a kebab-case file name',
    (_, example) => {
      expect(detectBlueprintKind(example.raw)).toEqual({ ok: true, kind: example.kind });
      expect(basename(example.file, '.json')).toMatch(/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    }
  );

  it.each(ALL.map((e) => [`${e.kind}s/${e.file}`, e] as const))(
    '%s has only the shared root, its kind and one body key, and no app-only keys anywhere',
    (_, example) => {
      const { kind, [example.kind]: body, ...shared } = example.raw;
      expect(kind).toBe(example.kind);
      expect(body && typeof body === 'object').toBe(true);
      // The shared root (name, description, tags, icon, category…) parses strictly.
      const result = z.strictObject(BLUEPRINT_BASE_SHAPE).safeParse(shared);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      const present = keys(example.raw);
      for (const key of APP_ONLY_KEYS) expect(present).not.toContain(key);
      const otherBody = example.kind === 'page' ? 'doc' : 'page';
      expect(Object.keys(example.raw)).not.toContain(otherBody);
      expect(Object.keys(example.raw)).not.toContain('deck');
    }
  );

  it.each(ALL.map((e) => [`${e.kind}s/${e.file}`, e] as const))(
    '%s: every block parses against the shared block contract',
    (_, example) => {
      for (const blocks of blockLists(example)) {
        const result = safeParseBlocks(blocks);
        expect(result.issues).toEqual([]);
      }
    }
  );

  it.each(PAGES.map((e) => [e.file, e] as const))(
    'page %s: sections have unique ids and anchors, and in-page links resolve',
    (_, example) => {
      const sections = sectionsOf(example);
      expect(sections.length).toBeGreaterThanOrEqual(3);
      const ids = sections.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
      const anchors = sections.flatMap((s) => (s.anchor ? [s.anchor] : []));
      expect(new Set(anchors).size).toBe(anchors.length);
      for (const s of sections) expect(s.blocks.length).toBeGreaterThan(0);
      // Block ids are unique across the whole page, not only within a section.
      const blockIds: string[] = [];
      for (const blocks of blockLists(example)) {
        const parsed = safeParseBlocks(blocks);
        forEachBlock(parsed.data ?? [], (block) => {
          if ('id' in block && typeof block.id === 'string') blockIds.push(block.id);
        });
      }
      expect(new Set(blockIds).size).toBe(blockIds.length);
      const hashLinks = strings(example.raw)
        .map(([, text]) => text)
        .filter((text) => text.startsWith('#'))
        .map((text) => text.slice(1));
      expect(hashLinks.length).toBeGreaterThan(0);
      for (const target of hashLinks) expect(anchors).toContain(target);
    }
  );

  it.each(DOCS.map((e) => [e.file, e] as const))(
    'doc %s: one title, unique heading ids for the TOC, and TOC settings within its headings',
    (_, example) => {
      const parsed = safeParseBlocks(docBlocksOf(example));
      const headings = (parsed.data ?? []).filter(
        (block): block is Extract<typeof block, { type: 'heading' }> => block.type === 'heading'
      );
      expect(headings.filter((h) => h.level === 1)).toHaveLength(1);
      const ids = headings.map((h) => h.id);
      expect(ids.every((id) => typeof id === 'string')).toBe(true);
      expect(new Set(ids).size).toBe(ids.length);
      const toc = (example.raw.doc as { toc?: { depth: number; sticky: boolean } }).toc;
      expect(toc).toBeDefined();
      expect(headings.some((h) => (h.level ?? 2) <= (toc?.depth ?? 0) && h.level !== 1)).toBe(true);
    }
  );

  it('exercises a broad set of shared blocks across the catalog', () => {
    const used = new Set<string>();
    for (const example of ALL) {
      for (const blocks of blockLists(example)) {
        forEachBlock(safeParseBlocks(blocks).data ?? [], (block) => used.add(block.type));
      }
    }
    for (const type of used) expect(BLOCK_TYPES).toContain(type);
    // A landing page needs a hero, a call to action and a form; a report needs data.
    for (const type of ['heading', 'cta', 'form', 'stat', 'cards', 'chart', 'table', 'callout']) {
      expect(used).toContain(type);
    }
    expect(used.size).toBeGreaterThanOrEqual(12);
  });

  it.each(ALL.map((e) => [`${e.kind}s/${e.file}`, e] as const))(
    '%s uses fictional data only: example domains, no remote media, no markup',
    (_, example) => {
      for (const [path, text] of strings(example.raw)) {
        for (const email of text.match(/[\w.+-]+@[\w.-]+\.[a-z]+/gi) ?? []) {
          expect({ path, email }).toEqual({
            path,
            email: expect.stringMatching(/@(?:[\w-]+\.)*(?:example\.com|[\w-]+\.example)$/i),
          });
        }
        for (const url of text.match(/https?:\/\/[^\s)"]+/gi) ?? []) {
          expect({ path, url }).toEqual({
            path,
            url: expect.stringMatching(/^https:\/\/(?:[\w-]+\.)*example\.com(?:\/|$)/i),
          });
        }
        expect({ path, text }).not.toEqual({ path, text: expect.stringMatching(/<[a-z!/]/i) });
      }
    }
  );
});

describe('kind-specific examples through the kind union', () => {
  // Turns on by itself when T-pages-wire ships the page and doc body schemas.
  it.skipIf(!kindBodySchema('page')).each(PAGES.map((e) => [e.file, e] as const))(
    'page %s parses as kind page',
    (_, example) => {
      const result = safeParseAnyBlueprint(example.raw);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect((result.data as { kind?: string } | undefined)?.kind).toBe('page');
    }
  );

  it.skipIf(!kindBodySchema('doc')).each(DOCS.map((e) => [e.file, e] as const))(
    'doc %s parses as kind doc',
    (_, example) => {
      const result = safeParseAnyBlueprint(example.raw);
      expect(result.success ? [] : result.error.issues).toEqual([]);
      expect((result.data as { kind?: string } | undefined)?.kind).toBe('doc');
    }
  );

  it('until then, the union rejects them only because the body schema is not shipped', () => {
    for (const example of ALL) {
      if (kindBodySchema(example.kind)) continue;
      const result = safeParseAnyBlueprint(example.raw);
      expect(result.success).toBe(false);
      expect(result.error?.issues.map((issue) => issue.message)).toEqual([
        `Blueprint kind "${example.kind}" is not available in this build of Protoyard yet.`,
      ]);
    }
  });
});
