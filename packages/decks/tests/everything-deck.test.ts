import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ChartSpecSchema } from '@protoyard/ai/chart';
import { type Block, forEachBlock } from '@protoyard/blocks';
import { BLOCK_CATALOG_LIST } from '@protoyard/blocks/catalog';
import { describe, expect, it } from 'vitest';
import { DECK_LAYOUT_STEPPABLE, DECK_LAYOUTS, steppablePattern } from '../src/layouts/index.ts';
import { slideFragments, slideSteps } from '../src/motion/index.ts';
import { checkDeckStatic } from '../src/quality/check.ts';
import { type Deck, type DeckSlide, safeParseDeck } from '../src/schema/index.ts';

/**
 * The "everything" reference deck (T-everything-deck, AC-everything-coverage):
 * `blueprints/decks/everything.json` uses every catalog layout, every block
 * type and every chart family, with steps on every kind of prop a layout
 * reveals. When a catalog grows, this test names what the deck must add.
 */

const REPO = join(import.meta.dirname, '../../..');
const FILE = join(REPO, 'blueprints/decks/everything.json');
const raw = JSON.parse(readFileSync(FILE, 'utf8')) as { kind: string; deck: unknown };

function parsed(): Deck {
  const result = safeParseDeck(raw.deck);
  if (!result.success) throw new Error(JSON.stringify(result.issues.slice(0, 5)));
  return result.deck;
}

/** Every block on every free slide, nested ones (columns, tabs, reveal) included. */
function allBlocks(deck: Deck): Block[] {
  const found: Block[] = [];
  for (const slide of deck.slides) {
    if ('blocks' in slide) forEachBlock(slide.blocks as Block[], (block) => found.push(block));
  }
  return found;
}

const missing = (want: readonly string[], have: ReadonlySet<string>) =>
  want.filter((item) => !have.has(item));

describe('the everything deck', () => {
  it('is a valid deck blueprint with no quality findings at all', () => {
    expect(raw.kind).toBe('deck');
    const deck = parsed();
    const report = checkDeckStatic(deck);
    expect(report.issues, JSON.stringify(report.issues.slice(0, 5))).toEqual([]);
  });

  it('uses every catalog layout', () => {
    const used = new Set(parsed().slides.map((slide) => slide.layout));
    expect(
      missing(
        DECK_LAYOUTS.map((layout) => layout.id),
        used
      )
    ).toEqual([]);
  });

  it('uses every block type in the catalog', () => {
    const used = new Set(allBlocks(parsed()).map((block) => block.type));
    expect(
      missing(
        BLOCK_CATALOG_LIST.map((entry) => entry.type),
        used
      )
    ).toEqual([]);
  });

  it('uses every chart family, in chart blocks, the chart layout and an explorable chart', () => {
    const deck = parsed();
    const kinds = new Set<string>();
    for (const block of allBlocks(deck)) {
      if (block.type === 'chart' || block.type === 'chart-controls') kinds.add(block.spec.kind);
    }
    for (const slide of deck.slides) {
      if (slide.layout === 'chart' && 'props' in slide) {
        kinds.add(String((slide.props.spec as { kind?: unknown }).kind));
      }
    }
    expect(missing(ChartSpecSchema.shape.kind.options, kinds)).toEqual([]);
    expect(allBlocks(deck).some((block) => block.type === 'chart-controls')).toBe(true);
  });

  it('steps on every kind of prop a layout reveals, and on blocks', () => {
    const deck = parsed();
    const patterns = new Set<string>();
    let blockSteps = 0;
    for (const slide of deck.slides) {
      for (const fragment of slideFragments(slideSteps(slide as DeckSlide))) {
        if (fragment.authored === 0) continue;
        if (fragment.path[0] === 'props') {
          patterns.add(steppablePattern(fragment.path.slice(1)));
        } else {
          blockSteps += 1;
        }
      }
    }
    const every = [...new Set(Object.values(DECK_LAYOUT_STEPPABLE).flat())];
    expect(missing(every, patterns)).toEqual([]);
    expect(blockSteps).toBeGreaterThan(0);
  });

  it('has a media background, an explorable table, a poll, a calculator and an embedded app', () => {
    const deck = parsed();
    expect(
      deck.slides.some(
        (slide) =>
          typeof slide.background === 'object' &&
          slide.background !== null &&
          ['image', 'image-full', 'video', 'video-full'].includes(slide.background.kind)
      )
    ).toBe(true);
    const blocks = allBlocks(deck);
    const table = blocks.find((block) => block.type === 'table');
    expect(table?.type === 'table' && table.interactive?.sort && table.interactive.filter).toBe(
      true
    );
    for (const type of ['poll', 'calculator', 'embed-app']) {
      expect(
        blocks.some((block) => block.type === type),
        type
      ).toBe(true);
    }
  });

  it('gives every slide speaker notes, a title and a place in the outline', () => {
    const deck = parsed();
    const outlined = new Set(deck.outline?.sections.flatMap((section) => section.slideIds));
    for (const slide of deck.slides) {
      expect(slide.title, slide.id).toBeTruthy();
      expect(slide.notes?.length ?? 0, slide.id).toBeGreaterThanOrEqual(40);
      expect(outlined.has(slide.id), slide.id).toBe(true);
    }
  });

  it('is fictional and self-contained: example links, local media, no remote sources', () => {
    const text = JSON.stringify(raw);
    for (const [, host] of text.matchAll(/https?:\/\/([^/"]+)/g)) {
      expect(host, 'links stay on example domains').toMatch(/(^|\.)example\.com$/);
    }
    for (const [, address] of text.matchAll(/[\w.+-]+@([\w.-]+)/g)) {
      expect(address).toMatch(/(^|\.)example\.com$/);
    }
    for (const [, src] of text.matchAll(/"(?:src|poster)":\s*"([^"]+)"/g)) {
      expect(src, 'media is embedded or a library avatar').toMatch(/^(data:|avatar:)/);
    }
  });
});
