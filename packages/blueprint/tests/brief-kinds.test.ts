/**
 * Fixture-driven coverage of kind synthesis (app, deck, page, doc).
 * Keeps the historical app brief set intact and asserts deterministic output.
 */
import { describe, expect, it } from 'vitest';
import { checkOutlineBounds } from '../src/brief/limits.ts';
import {
  type AppBriefResult,
  type BriefOptions,
  type BriefResult,
  blueprintFromBrief,
  type ContentBriefResult,
  isAppBriefResult,
  isContentBriefResult,
  MAX_BRIEF_LENGTH,
  parseBlueprint,
} from '../src/index.ts';
import appCases from './fixtures/briefs/briefs.json' with { type: 'json' };
import kindCases from './fixtures/briefs/kinds.json' with { type: 'json' };

type KindExpect = {
  kind: 'app' | 'deck' | 'page' | 'doc';
  confidence?: string;
  archetype?: string;
  outline?: string;
  minSlides?: number;
  minSections?: number;
  hasEntities?: boolean;
  hasRoles?: boolean;
  truncated?: boolean;
};

type KindFixture = {
  id: string;
  brief: string;
  options?: BriefOptions;
  expect: KindExpect;
};

const fixtures = kindCases as KindFixture[];

function resolveBrief(fixture: KindFixture): string {
  if (fixture.brief === '__MAX__') {
    return `${'x'.repeat(MAX_BRIEF_LENGTH)}OVERFLOW_TAIL`;
  }
  return fixture.brief;
}

function synthesize(fixture: KindFixture): BriefResult {
  return blueprintFromBrief(resolveBrief(fixture), fixture.options ?? {});
}

function deckSlides(result: ContentBriefResult): { id: string }[] {
  const deck = result.json.deck as { slides?: { id: string }[] } | undefined;
  return deck?.slides ?? [];
}

function pageSections(result: ContentBriefResult): { id: string }[] {
  const body = result.json.page as { sections?: { id: string }[] } | undefined;
  return body?.sections ?? [];
}

function docBlocks(result: ContentBriefResult): { type?: string; id?: string }[] {
  const body = result.json.doc as { blocks?: { type?: string; id?: string }[] } | undefined;
  return body?.blocks ?? [];
}

function assertContentBounds(result: ContentBriefResult) {
  if (result.kind === 'deck') {
    const slides = deckSlides(result);
    const check = checkOutlineBounds({
      kind: 'deck',
      title: String(result.json.name ?? ''),
      slides,
    });
    expect(check.ok, JSON.stringify(check)).toBe(true);
    return;
  }
  if (result.kind === 'page') {
    const sections = pageSections(result);
    const title = String((result.json.page as { title?: string })?.title ?? '');
    const check = checkOutlineBounds({ kind: 'page', title, sections });
    expect(check.ok, JSON.stringify(check)).toBe(true);
    return;
  }
  // Doc is a continuous block flow; bounds check uses synthetic sections from headings.
  const blocks = docBlocks(result);
  const title = String((result.json.doc as { title?: string })?.title ?? '');
  const sections = blocks
    .filter((block) => block.type === 'heading')
    .map((block, index) => ({
      id: block.id ?? `h-${index}`,
      title: block.id ?? `Heading ${index}`,
      body: '',
      blocks: [],
    }));
  const check = checkOutlineBounds({ kind: 'doc', title, sections });
  expect(check.ok, JSON.stringify(check)).toBe(true);
}

function assertFixture(fixture: KindFixture, result: BriefResult) {
  const expected = fixture.expect;
  expect(result.kind, fixture.id).toBe(expected.kind);
  if (expected.confidence) {
    expect(result.kindDetection.confidence, fixture.id).toBe(expected.confidence);
  }
  expect(result.rationale.length, fixture.id).toBeGreaterThan(0);
  expect(result.json).toBeTypeOf('object');
  expect(result.json).not.toBeNull();

  if (expected.hasEntities === false) {
    expect(result.json, fixture.id).not.toHaveProperty('entities');
  }
  if (expected.hasRoles === false) {
    expect(result.json, fixture.id).not.toHaveProperty('roles');
  }

  if (expected.kind === 'app') {
    expect(isAppBriefResult(result), fixture.id).toBe(true);
    if (!isAppBriefResult(result)) return;
    const app = result as AppBriefResult;
    if (expected.archetype) expect(app.archetype).toBe(expected.archetype);
    if (expected.hasEntities !== false) {
      expect(app.blueprint.entities.length).toBeGreaterThan(0);
    }
    if (expected.hasRoles !== false) {
      expect(app.blueprint.roles.map((r) => r.name)).toEqual([
        'owner',
        'admin',
        'member',
        'viewer',
      ]);
    }
    // App results always parse through the app schema.
    expect(parseBlueprint(JSON.parse(JSON.stringify(app.json)))).toEqual(app.blueprint);
    if (expected.truncated) {
      expect(app.rationale.some((line) => /truncated/i.test(line))).toBe(true);
    }
    return;
  }

  expect(isContentBriefResult(result), fixture.id).toBe(true);
  if (!isContentBriefResult(result)) return;
  const content = result as ContentBriefResult;
  expect(content.json.kind).toBe(expected.kind);
  if (expected.outline) expect(content.outline).toBe(expected.outline);
  if (expected.kind === 'deck') {
    const slides = deckSlides(content);
    expect(slides.length).toBeGreaterThanOrEqual(expected.minSlides ?? 3);
    expect(new Set(slides.map((s) => s.id)).size).toBe(slides.length);
  } else if (expected.kind === 'page') {
    const page = content.json.page as { id?: string; title?: string; sections?: { id: string }[] };
    expect(page.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(page.title?.length).toBeGreaterThan(0);
    const sections = pageSections(content);
    expect(sections.length).toBeGreaterThanOrEqual(expected.minSections ?? 3);
    expect(new Set(sections.map((s) => s.id)).size).toBe(sections.length);
  } else {
    const doc = content.json.doc as { id?: string; title?: string; blocks?: unknown[] };
    expect(doc.id).toMatch(/^[a-z][a-z0-9-]*$/);
    expect(doc.title?.length).toBeGreaterThan(0);
    expect((doc.blocks ?? []).length).toBeGreaterThanOrEqual(expected.minSections ?? 3);
  }
  assertContentBounds(content);
  if (expected.truncated) {
    expect(content.rationale.some((line) => /truncated/i.test(line))).toBe(true);
  }
}

describe('kind synthesis fixtures', () => {
  it('covers all four kinds plus conflicts, overrides, empty and max input', () => {
    const kinds = new Set(fixtures.map((f) => f.expect.kind));
    expect(kinds).toEqual(new Set(['app', 'deck', 'page', 'doc']));
    expect(fixtures.some((f) => f.id.includes('conflict'))).toBe(true);
    expect(fixtures.some((f) => f.id.includes('explicit'))).toBe(true);
    expect(fixtures.some((f) => f.id === 'empty-brief')).toBe(true);
    expect(fixtures.some((f) => f.id === 'max-brief')).toBe(true);
    expect(fixtures.some((f) => f.id.startsWith('content-only'))).toBe(true);
  });

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s: kind, bounds, schema shape and stable rationale',
    (_id, fixture) => {
      const result = synthesize(fixture);
      assertFixture(fixture, result);
    }
  );

  it.each(fixtures.map((f) => [f.id, f] as const))(
    '%s: repeated calls are byte-identical',
    (_id, fixture) => {
      const a = synthesize(fixture);
      const b = synthesize(fixture);
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
      expect(a.rationale).toEqual(b.rationale);
      expect(a.kindDetection).toEqual(b.kindDetection);
    }
  );
});

describe('app brief fixture set is preserved', () => {
  it('still ships the original 20 app briefs', () => {
    expect(appCases).toHaveLength(20);
    const ids = appCases.map((c) => c.id);
    expect(new Set(ids).size).toBe(20);
  });

  it.each(appCases.map((c) => [c.id, c] as const))(
    '%s: still synthesizes the expected app archetype',
    (_id, expected) => {
      const result = blueprintFromBrief(expected.brief);
      expect(result.kind).toBe('app');
      expect(isAppBriefResult(result)).toBe(true);
      if (!isAppBriefResult(result)) return;
      expect(result.archetype).toBe(expected.archetype);
      expect(result.layout).toBe(expected.layout);
      expect(result.blueprint.entities.map((e) => e.name)).toEqual(expected.entities);
      expect(parseBlueprint(JSON.parse(JSON.stringify(result.json)))).toEqual(result.blueprint);
      const again = blueprintFromBrief(expected.brief);
      expect(JSON.stringify(result.json)).toBe(JSON.stringify(again.json));
    }
  );
});

describe('kind fixture isolation', () => {
  it('does not mutate the shared app briefs.json catalog', () => {
    const before = JSON.stringify(appCases);
    for (const fixture of fixtures.slice(0, 3)) {
      synthesize(fixture);
    }
    expect(JSON.stringify(appCases)).toBe(before);
  });
});
