// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseAnyBlueprint } from '../../src/index.ts';
import {
  parseDeckBlueprint,
  parseDocBlueprint,
  parsePageBlueprint,
} from '../../src/kinds/parse.ts';

/**
 * `@protoyard/blueprint/kinds/parse`: the synchronous per-kind parsers that
 * generated deck, page and doc prototypes use instead of a top-level
 * `await parseAnyBlueprint(…)` (which deadlocks a single-chunk artifact build).
 * They must accept and produce exactly what `parseAnyBlueprint` does.
 */

const FIXTURES = join(import.meta.dirname, '../fixtures/kinds');
const fixture = (name: string): Record<string, unknown> =>
  JSON.parse(readFileSync(join(FIXTURES, name), 'utf8'));
const app = () =>
  JSON.parse(readFileSync(join(import.meta.dirname, '../../../../blueprints/crm.json'), 'utf8'));

const CASES = [
  ['deck', 'intro.deck.json', parseDeckBlueprint],
  ['page', 'landing.page.json', parsePageBlueprint],
  ['doc', 'quarterly-report.doc.json', parseDocBlueprint],
] as const;

describe('synchronous kind parsers', () => {
  it.each(CASES)(
    '%s: returns what parseAnyBlueprint returns, synchronously',
    async (_, file, parse) => {
      const input = fixture(file);
      const parsed = parse(input);
      expect(parsed).not.toBeInstanceOf(Promise);
      expect(parsed).toEqual(await parseAnyBlueprint(input));
    }
  );

  it.each(CASES)('%s: refuses another kind, an app and an invalid body', (kind, file, parse) => {
    for (const [, other] of CASES.filter(([k]) => k !== kind)) {
      expect(() => parse(fixture(other))).toThrow();
    }
    expect(() => parse(app())).toThrow();
    const broken = fixture(file);
    broken[kind] = { nonsense: true };
    expect(() => parse(broken)).toThrow();
  });

  it('applies the cross-section checks of the page and doc bodies too', () => {
    // A page block id that repeats a section id: refused by PageBodySchema's own check.
    const page = fixture('landing.page.json') as {
      page: { sections: { id: string; blocks: { id?: string }[] }[] };
    };
    const [first] = page.page.sections;
    if (!first) throw new Error('fixture has no sections');
    first.blocks.push({ type: 'heading', id: first.id, text: 'Clash' } as never);
    expect(() => parsePageBlueprint(page)).toThrow(/section id or anchor/);
  });
});
