import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  DECK_CONTROLS,
  type DeckControlKey,
  type DeckInputAction,
  type DeckInputEvent,
  type DeckInputState,
  decideDeckInput,
  slideStepCount,
} from '../src/index.ts';
import { DECK_LAYOUTS, stepMarkersOutsideLayout } from '../src/layouts/index.ts';
import {
  checkDeckStatic,
  type DeckQualityIssue,
  type DeckQualityRuleId,
} from '../src/quality/index.ts';
import { type Deck, type DeckSlide, safeParseDeck } from '../src/schema/index.ts';

/** Parses a fixture with the real deck schema, so every test deck is valid input. */
function deck(slides: unknown[]): Deck {
  const result = safeParseDeck({ style: {}, slides });
  expect(result.issues).toEqual([]);
  return result.deck as Deck;
}

/**
 * A structurally invalid fixture the deck schema now refuses (catalog layout ids and props are
 * enforced by DeckSchema). Lint still checks unvalidated input as a second line of defense, so these
 * fixtures bypass the schema; each test also proves the schema rejects them at the same path.
 */
function rawDeck(slides: unknown[]): Deck {
  return { style: {}, slides } as unknown as Deck;
}

function schemaRejectsAt(slides: unknown[], jsonPath: string): void {
  const result = safeParseDeck({ style: {}, slides });
  expect(result.issues.map((issue) => issue.jsonPath)).toContain(jsonPath);
}

const notes = (topic: string) =>
  `Talk through ${topic}: say why it matters and give one concrete example.`;

/** Every catalog layout's own sample, in catalog order: the good fixture. */
function goodSlides() {
  return DECK_LAYOUTS.map((layout, i) =>
    layout.id === 'free'
      ? {
          id: `s-${i}`,
          layout: 'free',
          blocks: (layout.sample as { blocks: unknown[] }).blocks,
          notes: notes(`the ${layout.id} slide`),
        }
      : {
          id: `s-${i}`,
          layout: layout.id,
          props: layout.sample,
          notes: notes(`the ${layout.id} slide`),
        }
  );
}

const only = (issues: DeckQualityIssue[], rule: DeckQualityRuleId) =>
  issues.filter((issue) => issue.rule === rule);

function slide(id: string, layout: string, props: unknown, extra: Record<string, unknown> = {}) {
  return { id, layout, props, notes: notes(id), ...extra };
}

function free(id: string, blocks: unknown[], extra: Record<string, unknown> = {}) {
  return { id, layout: 'free', blocks, notes: notes(id), ...extra };
}
const STAT = { number: '87%', label: 'of teams kept the habit' };

describe('deck quality: the good fixture passes', () => {
  it('a deck of every catalog layout sample has no issues', () => {
    const report = checkDeckStatic(deck(goodSlides()));
    expect(report.issues).toEqual([]);
    expect(report).toMatchObject({ ok: true, errors: 0, warnings: 0 });
  });
});

describe('deck quality: each rule flags its bad fixture at the right path', () => {
  it('layout-props (error): missing fields and over-limit arrays', () => {
    schemaRejectsAt(
      [slide('stat', 'big-stat', { label: 'no number' })],
      '$.slides[0].props.number'
    );
    const report = checkDeckStatic(
      rawDeck([
        slide('stat', 'big-stat', { label: 'no number' }),
        slide('steps', 'process-steps', {
          steps: Array.from({ length: 6 }, (_, i) => ({ title: `Step ${i + 1}` })),
        }),
      ])
    );
    const paths = only(report.issues, 'layout-props').map((issue) => issue.jsonPath);
    expect(paths).toContain('$.slides[0].props.number');
    expect(paths).toContain('$.slides[1].props.steps');
    expect(only(report.issues, 'layout-props').every((issue) => issue.severity === 'error')).toBe(
      true
    );
  });

  it('step-order (error): a fragment revealing before content above it', () => {
    const report = checkDeckStatic(
      deck([
        free('flat', [
          { type: 'text', markdown: 'First', step: 2 },
          { type: 'text', markdown: 'Second', step: 1 },
        ]),
        free('nested', [
          {
            type: 'columns',
            columns: [
              [{ type: 'text', markdown: 'Left', step: 3 }],
              [{ type: 'text', markdown: 'Right', step: 1 }],
            ],
          },
        ]),
        free('ordered', [
          { type: 'text', markdown: 'One', step: 1 },
          { type: 'text', markdown: 'Same', step: 1 },
          { type: 'text', markdown: 'Two', step: 2 },
        ]),
      ])
    );
    expect(only(report.issues, 'step-order')).toMatchObject([
      { severity: 'error', slideId: 'flat', jsonPath: '$.slides[0].blocks[1].step' },
      {
        severity: 'error',
        slideId: 'nested',
        jsonPath: '$.slides[1].blocks[0].columns[1][0].step',
      },
    ]);
    // The deck model's lint message (it names the rule, not the earlier element's path).
    expect(only(report.issues, 'step-order')[0]?.message).toMatch(/revealed before an earlier/);
  });

  it('counts errors and warnings and keeps ok true with warnings only', () => {
    const report = checkDeckStatic(deck([slide('a', 'big-stat', STAT, { notes: 'short' })]));
    expect(report).toMatchObject({ ok: true, errors: 0, warnings: 1 });
    const failing = checkDeckStatic(rawDeck([slide('a', 'nope', {}, { notes: 'short' })]));
    expect(failing).toMatchObject({ ok: false, errors: 1, warnings: 1 });
  });
});

// --- merged from controls.test.ts ---

describe('controls', () => {
  /**
   * The control registry (`DECK_CONTROLS`) is the single source for labels,
   * keys and availability: every deck action has exactly one control, and every
   * key a control lists really reaches that action through the input guard.
   */

  /** The deck state under which a control's key acts (its overlay on, debug available…). */
  function stateFor(action: DeckInputAction, spec: DeckControlKey): DeckInputState {
    if (action === 'debug')
      return spec.closes ? { debugAvailable: true, debug: true } : { debugAvailable: true };
    if (action === 'fullscreen-exit') return { fullscreen: true };
    if (!spec.closes) return {};
    const on: Partial<Record<DeckInputAction, DeckInputState>> = {
      help: { help: true },
      overview: { overview: 'open' },
      blackout: { blackout: true },
      laser: { laser: true },
    };
    return on[action] ?? {};
  }

  function keyEvent(spec: DeckControlKey): Extract<DeckInputEvent, { kind: 'key' }> {
    return {
      kind: 'key',
      key: spec.key,
      shiftKey: spec.shift === 'required',
      ctrlKey: spec.modifier === 'ctrl',
      metaKey: spec.modifier === 'meta',
    };
  }

  describe('DECK_CONTROLS', () => {
    it("routes every control's keys to its action through decideDeckInput (AC-registry-complete)", () => {
      for (const item of DECK_CONTROLS) {
        for (const spec of item.keys) {
          expect(
            decideDeckInput(keyEvent(spec), stateFor(item.action, spec)),
            `${item.id}: ${spec.label}`
          ).toBe(item.action);
          // Letters work in either case (Caps Lock), unless they need a modifier.
          if (/^[a-z]$/.test(spec.key) && !spec.modifier) {
            expect(
              decideDeckInput(
                { ...keyEvent(spec), key: spec.key.toUpperCase() },
                stateFor(item.action, spec)
              ),
              `${item.id}: ${spec.label.toUpperCase()}`
            ).toBe(item.action);
          }
        }
      }
    });

    it('never gives one key two actions in the same state', () => {
      const seen = new Map<string, DeckInputAction>();
      for (const item of DECK_CONTROLS) {
        for (const spec of item.keys) {
          if (spec.closes) continue;
          const id = `${spec.key.toLowerCase()}|${spec.shift ?? ''}|${spec.modifier ?? ''}`;
          const other = seen.get(id);
          expect(
            other === undefined || other === item.action,
            `${spec.label}: ${other} and ${item.action}`
          ).toBe(true);
          seen.set(id, item.action);
        }
      }
    });
  });
});

// --- merged from steps-everywhere.test.ts ---

describe('steps-everywhere', () => {
  /**
   * Steps on every catalog prop (PLAN_006 T-steps-everywhere): each layout
   * declares where a step marker reveals something (the props object itself,
   * nested objects, list items), every declared path holds a marker the schema
   * accepts and the steps model counts, and decks without new markers keep their
   * step counts.
   */

  const REPO = join(import.meta.dirname, '../../..');

  describe('existing decks keep their step counts', () => {
    it('every catalog deck has no marker outside its layouts, and counts are unchanged', () => {
      const counts: Record<string, number[]> = {};
      for (const file of readdirSync(join(REPO, 'blueprints/decks')).filter((n) =>
        n.endsWith('.json')
      )) {
        const deck = JSON.parse(readFileSync(join(REPO, 'blueprints/decks', file), 'utf8')).deck;
        const parsed = safeParseDeck(deck);
        expect(parsed.success, file).toBe(true);
        const slides = (parsed.deck?.slides ?? []) as DeckSlide[];
        for (const slide of slides)
          expect(stepMarkersOutsideLayout(slide), `${file} ${slide.id}`).toEqual([]);
        counts[file] = slides.map(slideStepCount);
      }
      // The step model is unchanged: these counts were measured before steps everywhere.
      expect(
        Object.values(counts)
          .flat()
          .reduce((a, b) => a + b, 0)
      ).toBeGreaterThan(0);
      expect(counts['protoyard-create-anything.json']).toMatchInlineSnapshot(`
      [
        0,
        0,
        0,
        0,
        0,
        0,
        2,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
      ]
    `);
    });
  });
});
