// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
// The lint `protoyard deck lint` runs (packages/cli/src/commands/deck.ts `lintDeckFile`).
import { lintDeckAssets, lintDeckContent } from '../../blueprint/src/index.ts';
import { type Deck, type DeckSlide, safeParseDeck } from '../src/schema/index.ts';

/** What `protoyard deck lint` reports for a deck. */
const lint = (deck: Deck) => [
  ...lintDeckContent(deck).diagnostics,
  ...lintDeckAssets(deck).diagnostics,
];

/**
 * Every deck snippet an agent copies from validates: the JSON blocks in
 * docs/DECKS.md and in the skill's deck reference pass `DeckSchema` and the
 * lint `protoyard deck lint` runs (content and asset lint) with no error, no step marker that reveals nothing,
 * and (for the recipes) no warning beyond a custom slide's level-1 notice.
 * Commands in those files are checked against the real CLI by
 * packages/cli/tests/decks-docs.test.ts and `pnpm check:skill`.
 */

const REPO = join(import.meta.dirname, '../../..');
const SOURCES = ['docs/DECKS.md', 'skills/protoyard/references/decks.md'] as const;

interface Snippet {
  file: string;
  line: number;
  section: string;
  value: unknown;
}

/** Every ```json block with its line and the `##` section it sits in. */
function snippets(file: string): Snippet[] {
  const text = readFileSync(join(REPO, file), 'utf8');
  return [...text.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => {
    const before = text.slice(0, match.index);
    const sections = [...before.matchAll(/^## (.+)$/gm)];
    return {
      file,
      line: before.split('\n').length,
      section: sections.at(-1)?.[1] ?? '',
      value: JSON.parse(match[1] ?? ''),
    };
  });
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

/** A snippet as a deck: a whole blueprint, one slide or a list of slides. */
function asDeck(snippet: Snippet): unknown {
  const { value } = snippet;
  if (isRecord(value) && value.kind === 'deck') return value.deck;
  if (isRecord(value) && 'layout' in value) return { style: {}, slides: [value] };
  if (Array.isArray(value)) return { style: {}, slides: value };
  throw new Error(`${snippet.file}:${snippet.line} is not a deck, a slide or a slide list`);
}

const all = SOURCES.flatMap(snippets);
const where = (snippet: Snippet) => `${snippet.file}:${snippet.line}`;

describe('deck snippets in the guides', () => {
  it('finds the snippets (the example deck, the custom slide, six recipes, the skill recipe)', () => {
    expect(all.filter((s) => s.file === 'docs/DECKS.md').length).toBeGreaterThanOrEqual(8);
    expect(all.filter((s) => s.file.startsWith('skills/')).length).toBeGreaterThanOrEqual(1);
  });

  it.each(all.map((snippet) => [where(snippet), snippet] as const))(
    '%s passes the deck schema and lint without errors',
    (_, snippet) => {
      const parsed = safeParseDeck(asDeck(snippet));
      expect(parsed.success, JSON.stringify(parsed.success ? null : parsed.issues)).toBe(true);
      if (!parsed.success || !parsed.deck) return;
      const diagnostics = lint(parsed.deck);
      const errors = diagnostics.filter((item) => item.severity === 'error');
      expect(errors, JSON.stringify(errors)).toEqual([]);
      expect(diagnostics.filter((item) => item.code === 'step-unrevealed')).toEqual([]);
      if (isRecord(snippet.value) && snippet.value.kind === 'deck') {
        expect(snippet.value).toMatchObject({ formatVersion: 1, kind: 'deck' });
        expect(typeof snippet.value.name).toBe('string');
      }
    }
  );

  it('keeps every recipe free of warnings (a custom slide’s level-1 notice aside)', () => {
    const recipes = all.filter((s) => s.section === 'Recipes' || s.section === 'A recipe');
    expect(recipes.length).toBeGreaterThanOrEqual(7);
    for (const snippet of recipes) {
      const parsed = safeParseDeck(asDeck(snippet));
      if (!parsed.success || !parsed.deck) throw new Error(where(snippet));
      const warnings = lint(parsed.deck)
        .filter((item) => item.code !== 'custom-slide')
        .map((item) => `${item.code} ${item.jsonPath}`);
      expect(warnings, where(snippet)).toEqual([]);
    }
  });

  it('has the six recipes the agent path promises, in order', () => {
    const guide = readFileSync(join(REPO, 'docs/DECKS.md'), 'utf8');
    const recipes = guide.split('\n## Recipes\n')[1]?.split('\n## ')[0] ?? '';
    const headings = [...recipes.matchAll(/^### (.+)$/gm)].map((m) => m[1]);
    expect(headings).toEqual([
      'A chart story',
      'A comparison table',
      'A live poll',
      'A calculator',
      'An embedded app',
      'A custom interactive slide',
    ]);
    const blocks = (slides: unknown) =>
      (Array.isArray(slides) ? slides : [slides]).flatMap((slide) =>
        isRecord(slide) && Array.isArray(slide.blocks)
          ? slide.blocks.map((block) => (isRecord(block) ? block.type : null))
          : [isRecord(slide) ? slide.layout : null]
      );
    const kinds = all.filter((s) => s.section === 'Recipes').flatMap((s) => blocks(s.value));
    for (const kind of [
      'chart',
      'chart-controls',
      'comparison-table',
      'poll',
      'calculator',
      'embed-app',
      'custom',
    ]) {
      expect(kinds, kind).toContain(kind);
    }
  });

  it('gives the skill the same poll recipe as the guide', () => {
    const poll = (file: string) =>
      all.find(
        (s) => s.file === file && isRecord(s.value) && (s.value as DeckSlide).id === 'room-poll'
      )?.value;
    expect(poll('skills/protoyard/references/decks.md')).toEqual(poll('docs/DECKS.md'));
  });

  it('uses unique slide ids within each snippet', () => {
    for (const snippet of all) {
      const deck = asDeck(snippet) as { slides: { id: string }[] };
      const ids = deck.slides.map((slide) => slide.id);
      expect(new Set(ids).size, where(snippet)).toBe(ids.length);
    }
  });
});
