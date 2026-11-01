import { parseScenario } from '@protoyard/core';
import { createGenerateContext, validateWorld } from '@protoyard/scenarios';
import { describe, expect, it } from 'vitest';
import { createBlueprintGenerator } from '../src/generator.ts';
import {
  type AppBriefResult,
  ARCHETYPE_IDS,
  blueprintFromBrief,
  deriveIntegrity,
  isAppBriefResult,
  isContentBriefResult,
  MAX_BRIEF_LENGTH,
  parseBlueprint,
  resolveBlueprintBrand,
} from '../src/index.ts';
import cases from './fixtures/briefs/briefs.json' with { type: 'json' };

/** Fixture briefs are all apps; narrow so entity/screen assertions type-check. */
function appFrom(
  brief: string,
  options?: Parameters<typeof blueprintFromBrief>[1]
): AppBriefResult {
  const result = blueprintFromBrief(brief, options);
  expect(result.kind).toBe('app');
  if (!isAppBriefResult(result)) throw new Error('expected app brief result');
  return result;
}

describe('blueprintFromBrief fixtures', () => {
  it('turns each fixture brief into a valid blueprint with the expected archetype, entities, screens and layout', () => {
    for (const expected of cases) {
      const result = appFrom(expected.brief);
      expect(result.kind).toBe('app');
      expect(result.kindDetection.kind).toBe('app');
      expect(result.archetype).toBe(expected.archetype);
      expect(result.layout).toBe(expected.layout);
      expect(result.blueprint.entities.map((e) => e.name)).toEqual(expected.entities);
      // People-like entities get a face from the avatar library.
      expect(
        result.blueprint.entities
          .filter((e) => e.fields.some((f) => f.kind === 'avatar'))
          .map((e) => e.name)
      ).toEqual(expected.avatars);
      expect([...new Set(result.blueprint.screens.map((s) => s.type))].sort()).toEqual(
        expected.screens
      );
      // The JSON form parses to the same blueprint (what the CLI writes to disk).
      expect(parseBlueprint(JSON.parse(JSON.stringify(result.json)))).toEqual(result.blueprint);
      expect(result.rationale.length).toBeGreaterThan(2);
    }
  });

  it('is byte-identical across runs', () => {
    for (const c of cases) {
      const a = appFrom(c.brief);
      const b = appFrom(c.brief);
      expect(JSON.stringify(a.json), c.id).toBe(JSON.stringify(b.json));
      expect(a.rationale).toEqual(b.rationale);
      expect(a.kindDetection).toEqual(b.kindDetection);
    }
  });

  it('always emits the four standard roles and an AA brand theme', () => {
    for (const c of cases) {
      const { blueprint } = appFrom(c.brief);
      expect(blueprint.roles.map((r) => r.name)).toEqual(['owner', 'admin', 'member', 'viewer']);
      expect(blueprint.brand?.seed).toMatch(/^#[0-9a-f]{6}$/);
      // Throws BrandThemeError when the palette fails WCAG AA.
      expect(() =>
        resolveBlueprintBrand(blueprint.brand as never, { blueprintName: blueprint.name })
      ).not.toThrow();
    }
  });

  it('generates a valid world for every brief', () => {
    for (const c of cases) {
      const { blueprint } = appFrom(c.brief);
      const scenario = parseScenario({
        id: 'brief',
        name: 'Brief',
        seed: 7,
        referenceTime: '2026-06-01T09:00:00.000Z',
        organization: { ageDays: 60 },
      });
      const world = createBlueprintGenerator(blueprint).generate(createGenerateContext(scenario));
      expect(
        validateWorld(world, {
          ...deriveIntegrity(blueprint),
          referenceTime: scenario.referenceTime,
        }),
        c.id
      ).toEqual([]);
    }
  });
});

describe('blueprintFromBrief behavior', () => {
  it('honors a forced archetype and name, and rejects unknown archetypes', () => {
    const result = appFrom('Anything at all.', {
      archetype: 'iot',
      name: 'Fern Example',
    });
    expect(result.archetype).toBe('iot');
    expect(result.blueprint.name).toBe('Fern Example');
    expect(result.rationale[0]).toBe('Archetype iot (chosen explicitly).');
    expect(ARCHETYPE_IDS).toContain('iot');
    const forcedKit = appFrom('An AI assistant for analytics dashboards.', {
      archetype: 'team-chat',
    });
    expect(forcedKit.archetype).toBe('team-chat');
    expect(forcedKit.blueprint.archetype?.id).toBe('team-chat');
    expect(forcedKit.rationale[0]).toBe('Archetype team-chat (chosen explicitly).');
    expect(() => blueprintFromBrief('x', { archetype: 'spaceship' })).toThrow(/unknown archetype/);
  });

  it('handles empty and very long briefs', () => {
    const empty = appFrom('');
    expect(empty.archetype).toBe('tracker');
    expect(empty.blueprint.description).toBe('Tracker prototype.');
    const long = appFrom(`Track tickets. ${'word '.repeat(5_000)}`);
    expect(long.archetype).toBe('helpdesk');
    expect(MAX_BRIEF_LENGTH).toBe(5_000);
  });
});

describe('blueprintFromBrief kind dispatch', () => {
  it('routes strong deck cues to the deck synthesizer before app archetypes', () => {
    const result = blueprintFromBrief(
      'A pitch deck of twelve slides about our fictional launch plan for Example Harbor.'
    );
    expect(isContentBriefResult(result)).toBe(true);
    if (!isContentBriefResult(result)) return;
    expect(result.kind).toBe('deck');
    expect(result.kindDetection.confidence).toMatch(/high|medium/);
    expect(result.json.kind).toBe('deck');
    expect(result.outline).toBe('pitch');
    const deck = result.json.deck as { slides: { id: string; layout: string }[] };
    expect(deck.slides.length).toBeGreaterThanOrEqual(7);
    expect(deck.slides[0]?.id).toBe('slide-title');
    expect(deck.slides[0]?.layout).toBe('title-hero');
    expect(deck.slides.map((s) => s.id).at(-1)).toMatch(/^slide-/);
    expect(result.rationale[0]).toBe(result.kindDetection.reason);
    expect(result.rationale.some((line) => /Outline: Pitch/i.test(line))).toBe(true);
    // No app entities / roles on a content draft.
    expect(result.json).not.toHaveProperty('entities');
    expect(result.json).not.toHaveProperty('roles');
  });

  it('routes landing-page and report briefs to page and doc synthesizers', () => {
    const page = blueprintFromBrief(
      'A marketing landing page for Example Harbor with a hero section and pricing.'
    );
    expect(page.kind).toBe('page');
    if (!isContentBriefResult(page)) return;
    expect(page.outline).toBe('landing');
    const pageSections = (page.json.page as { sections: { id: string; blocks: unknown[] }[] })
      .sections;
    expect(pageSections.length).toBeGreaterThanOrEqual(4);
    expect(pageSections[0]?.id).toBe('section-hero');
    expect(pageSections[0]?.blocks?.length).toBeGreaterThan(0);

    const doc = blueprintFromBrief(
      'Write the quarterly report for Example Harbor covering status and next steps.'
    );
    expect(doc.kind).toBe('doc');
    if (!isContentBriefResult(doc)) return;
    expect(doc.outline).toBe('report');
    const docBody = doc.json.doc as {
      id: string;
      title: string;
      blocks: { id?: string; type: string }[];
    };
    expect(docBody.id).toMatch(/^[a-z]/);
    expect(docBody.title.length).toBeGreaterThan(0);
    const headingIds = docBody.blocks
      .filter((block) => block.type === 'heading' && block.id)
      .map((block) => block.id);
    expect(headingIds).toEqual(
      expect.arrayContaining([
        'section-title',
        'section-summary',
        'section-status',
        'section-findings',
        'section-next',
      ])
    );
  });

  it('rejects unknown explicit kinds with a stable actionable error', () => {
    expect(() => blueprintFromBrief('Anything', { kind: 'quiz' })).toThrow(
      /kind "quiz" needs a newer Protoyard/
    );
    expect(() => blueprintFromBrief('Anything', { kind: 'quiz' })).toThrow(
      /supports app, deck, page, doc/
    );
  });
});
