// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  decodeDocumentShare,
  encodeBlueprintShare,
  isDeckBlueprint,
  loadUntrustedDocument,
  MAX_SHARE_ENCODED_LENGTH,
  ShareLinkTooLargeError,
} from '../../src/index.ts';

const ROOT = fileURLToPath(new URL('../../../..', import.meta.url));
const EXAMPLES = [
  { kind: 'deck', dir: 'decks' },
  { kind: 'page', dir: 'pages' },
  { kind: 'doc', dir: 'docs' },
] as const;

function exampleFiles(): { kind: string; path: string; name: string }[] {
  return EXAMPLES.flatMap(({ kind, dir }) =>
    readdirSync(join(ROOT, 'blueprints', dir))
      .filter((name) => name.endsWith('.json'))
      .sort()
      .map((name) => ({ kind, path: join(ROOT, 'blueprints', dir, name), name }))
  );
}

function pseudoRandomText(seed: number, length: number): string {
  let state = seed;
  let text = '';
  for (let index = 0; index < length; index += 1) {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    text += 'abcdefghijklmnopqrstuvwxyz'[state % 26];
  }
  return text;
}

describe('share links for content kinds', () => {
  it('round-trips every example deck, page and doc and reports encoded sizes', async () => {
    const examples = exampleFiles();
    expect(examples.length).toBeGreaterThan(0);

    for (const example of examples) {
      const source = JSON.parse(readFileSync(example.path, 'utf8')) as Record<string, unknown>;
      const loaded = await loadUntrustedDocument(source);
      expect(loaded.success, `${example.kind}/${example.name}: ${JSON.stringify(loaded)}`).toBe(
        true
      );
      if (!loaded.success) continue;
      const expected = loaded.blueprint;
      const encoded = await encodeBlueprintShare(expected);
      const link = `#bp=${encoded}`;
      const decoded = await decodeDocumentShare(link);

      console.info(`[share-size] ${example.kind}/${example.name}: ${encoded.length} chars`);
      expect(encoded.length, `${example.kind}/${example.name}`).toBeLessThanOrEqual(
        MAX_SHARE_ENCODED_LENGTH
      );
      expect(decoded.success, `${example.kind}/${example.name}: ${JSON.stringify(decoded)}`).toBe(
        true
      );
      if (decoded.success) expect(decoded.blueprint).toEqual(expected);
    }
  });

  it('preserves speaker-note newlines and refuses an oversized deck with a file fallback', async () => {
    const source = JSON.parse(
      readFileSync(join(ROOT, 'blueprints/decks/example.json'), 'utf8')
    ) as {
      deck: {
        slides: { id: string; notes?: string; [key: string]: unknown }[];
        outline: { sections: { slideIds: string[] }[] };
      };
    };
    for (const [index, slide] of source.deck.slides.entries()) {
      slide.notes = `First note line\nSecond note line ${index}`;
    }
    const loaded = await loadUntrustedDocument(source);
    expect(loaded.success).toBe(true);
    if (!loaded.success) return;
    const deck = loaded.blueprint;
    const encoded = await encodeBlueprintShare(deck);
    const decoded = await decodeDocumentShare(`#bp=${encoded}`);
    expect(decoded.success).toBe(true);
    expect(decoded.success && isDeckBlueprint(decoded.blueprint)).toBe(true);
    if (decoded.success && isDeckBlueprint(decoded.blueprint)) {
      expect(decoded.blueprint.deck.slides.map((slide) => slide.notes)).toEqual(
        source.deck.slides.map((slide) => slide.notes)
      );
    }

    const oversized = structuredClone(source);
    const template = oversized.deck.slides[0];
    for (let index = 0; index < 30; index += 1) {
      const id = `large-${index}`;
      oversized.deck.slides.push({
        ...template,
        id,
        notes: pseudoRandomText(index + 1, 900),
      });
      oversized.deck.outline.sections[0]?.slideIds.push(id);
    }
    const oversizedLoaded = await loadUntrustedDocument(oversized);
    expect(oversizedLoaded.success).toBe(true);
    if (!oversizedLoaded.success) return;
    let thrown: unknown;
    try {
      await encodeBlueprintShare(oversizedLoaded.blueprint);
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ShareLinkTooLargeError);
    expect((thrown as Error).message).toMatch(/Share the blueprint\.json file instead/);
  });
});
