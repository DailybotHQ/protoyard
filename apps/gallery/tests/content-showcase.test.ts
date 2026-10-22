// @vitest-environment node
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTENT_EXAMPLES,
  contentExampleCover,
  contentExamplePath,
  FLAGSHIP_SLIDES,
  flagshipSlideCover,
} from '../src/lib/content-examples.ts';
import { contentShowcaseCards } from '../src/lib/content-showcase.ts';

/**
 * The deck, page and doc examples the home page and /features/ show are held
 * to the repository: each blueprint exists and is of the kind it is listed
 * as, each cover was captured (`pnpm covers`), every flagship still names a
 * real slide, and every example opens in the hosted player from a share link.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const PUBLIC = join(REPO, 'apps', 'gallery', 'public');

describe('the content showcase', () => {
  it('lists real blueprints of the kind it shows, each with a captured cover', () => {
    expect(CONTENT_EXAMPLES.filter((e) => e.kind === 'deck').length).toBeGreaterThanOrEqual(4);
    for (const example of CONTENT_EXAMPLES) {
      const blueprint = JSON.parse(readFileSync(join(REPO, contentExamplePath(example)), 'utf8'));
      expect(blueprint.kind, example.name).toBe(example.kind);
      expect(existsSync(join(PUBLIC, contentExampleCover(example))), example.name).toBe(true);
    }
  });

  it('points the flagship at its generated prototype, and its stills at real slides', () => {
    const flagships = CONTENT_EXAMPLES.filter((e) => e.prototype);
    expect(flagships).toHaveLength(1);
    const [flagship] = flagships;
    if (!flagship?.prototype) throw new Error('no flagship');
    expect(existsSync(join(REPO, 'prototypes', flagship.prototype, 'protoyard.json'))).toBe(true);
    const deck = JSON.parse(readFileSync(join(REPO, contentExamplePath(flagship)), 'utf8')) as {
      deck: { slides: { id: string }[] };
    };
    const ids = new Set(deck.deck.slides.map((slide) => slide.id));
    for (const slide of FLAGSHIP_SLIDES) {
      expect(ids, slide.id).toContain(slide.id);
      expect(existsSync(join(PUBLIC, flagshipSlideCover(slide))), slide.id).toBe(true);
    }
  });

  it('opens every example in the hosted player, with its slide or section count', async () => {
    const cards = await contentShowcaseCards(REPO);
    expect(cards).toHaveLength(CONTENT_EXAMPLES.length);
    for (const card of cards) {
      expect(card.playerHref, card.example.name).toMatch(/\/play\/#/);
      expect(card.parts, card.example.name).toBeGreaterThan(0);
      expect(card.title.length, card.example.name).toBeGreaterThan(0);
    }
    const flagship = cards.find((card) => card.example.prototype);
    expect(flagship?.parts).toBe(25);
  });

  it('shows nothing, rather than failing, in a workspace without the examples', async () => {
    // The gallery installed as a package in a consumer project has no blueprints/.
    const empty = mkdtempSync(join(tmpdir(), 'protoyard-gallery-consumer-'));
    try {
      expect(await contentShowcaseCards(empty)).toEqual([]);
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
