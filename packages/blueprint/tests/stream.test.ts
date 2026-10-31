// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  type DeckBlueprint,
  type DocBlueprint,
  MAX_STREAM_CANDIDATES,
  type PageBlueprint,
  paintStreamedBlueprint,
  truncatedJsonCandidates,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const text = (path: string) =>
  `${JSON.stringify(JSON.parse(readFileSync(join(ROOT, path), 'utf8')), null, 2)}\n`;

describe('truncatedJsonCandidates', () => {
  it('closes the open containers after the last complete member, deepest first', () => {
    expect(truncatedJsonCandidates('{"a":1,"b":[1,2,{"c":"x","d":"y')).toEqual([
      '{"a":1,"b":[1,2,{"c":"x"}]}',
      '{"a":1,"b":[1,2]}',
      '{"a":1}',
    ]);
  });

  it('never keeps a half key, a half string, a half number or a dangling colon', () => {
    for (const cut of ['{"title":"Hel', '{"tit', '{"n":12', '{"n":', '{"t":tr']) {
      expect(truncatedJsonCandidates(cut), cut).toEqual(['{}']);
    }
    expect(truncatedJsonCandidates('{"n":12,')).toEqual(['{"n":12}']);
    expect(truncatedJsonCandidates('{"s":"a\\"b}","n":true ')).toEqual(['{"s":"a\\"b}","n":true}']);
  });

  it('yields nothing for complete or malformed JSON', () => {
    expect(truncatedJsonCandidates('{"a":[1]}')).toEqual([]);
    expect(truncatedJsonCandidates('{"a":[1}')).toEqual([]);
    expect(truncatedJsonCandidates('[1]]')).toEqual([]);
    expect(truncatedJsonCandidates('[{"a":1]')).toEqual([]);
  });

  it('every candidate is valid JSON at every cut of a real blueprint', () => {
    const full = text('blueprints/decks/example.json');
    for (let cut = 1; cut < full.length; cut += 7) {
      for (const candidate of truncatedJsonCandidates(full.slice(0, cut))) {
        expect(() => JSON.parse(candidate), `cut ${cut}`).not.toThrow();
      }
    }
  });
});

describe('paintStreamedBlueprint', () => {
  it('paints a deck slide by slide as it arrives, then the whole deck', async () => {
    const full = text('blueprints/decks/everything.json');
    const total = (JSON.parse(full) as DeckBlueprint).deck.slides.length;
    const counts: number[] = [];
    for (let cut = 0; cut <= full.length; cut += Math.ceil(full.length / 40)) {
      const painted = await paintStreamedBlueprint(full.slice(0, cut));
      if (!painted) continue;
      expect(painted.complete).toBe(false);
      counts.push((painted.blueprint as DeckBlueprint).deck.slides.length);
    }
    expect(counts.length).toBeGreaterThan(5);
    // Never goes backwards and grows as text arrives.
    expect([...counts].sort((a, b) => a - b)).toEqual(counts);
    expect(counts[counts.length - 1]).toBeGreaterThan(counts[0] as number);
    const done = await paintStreamedBlueprint(full);
    expect(done?.complete).toBe(true);
    expect((done?.blueprint as DeckBlueprint | undefined)?.deck.slides).toHaveLength(total);
  });

  it('paints pages and docs partially too', async () => {
    const page = text('blueprints/pages/tidewater-roasters-landing.json');
    const doc = text('blueprints/docs/northwind-quarterly-report.json');
    const pagePart = await paintStreamedBlueprint(page.slice(0, Math.floor(page.length * 0.7)));
    const docPart = await paintStreamedBlueprint(doc.slice(0, Math.floor(doc.length * 0.7)));
    expect(pagePart?.complete).toBe(false);
    expect((pagePart?.blueprint as PageBlueprint | undefined)?.kind).toBe('page');
    expect(docPart?.complete).toBe(false);
    expect((docPart?.blueprint as DocBlueprint | undefined)?.kind).toBe('doc');
  });

  it('never paints half an app (its entities shape the database)', async () => {
    const app = text('blueprints/crm.json');
    for (const ratio of [0.3, 0.6, 0.9, 0.99]) {
      expect(await paintStreamedBlueprint(app.slice(0, Math.floor(app.length * ratio)))).toBeNull();
    }
    expect((await paintStreamedBlueprint(app))?.complete).toBe(true);
  });

  it('holds a partial blueprint to the same limits and schema as a complete one', async () => {
    const deck = text('blueprints/decks/example.json');
    expect(await paintStreamedBlueprint(deck.slice(0, 200), { maxBytes: 100 })).toBeNull();
    // No kind yet: nothing to paint.
    expect(await paintStreamedBlueprint('{"formatVersion":1,"name":"Dra')).toBeNull();
    // An invalid complete blueprint is not painted either.
    expect(await paintStreamedBlueprint('{"formatVersion":1,"kind":"deck"}')).toBeNull();
    expect(await paintStreamedBlueprint('not json')).toBeNull();
  });

  it('refuses prototype keys like the loader does', async () => {
    const deck = text('blueprints/decks/example.json');
    const poisoned = deck.replace('{', '{"__proto__":{"polluted":true},');
    const painted = await paintStreamedBlueprint(
      poisoned.slice(0, Math.floor(poisoned.length / 2))
    );
    expect(painted).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('caps the candidates it validates', () => {
    expect(MAX_STREAM_CANDIDATES).toBeGreaterThan(4);
    const deep = `{"kind":"deck",${'"a":['.repeat(200)}`;
    expect(truncatedJsonCandidates(deep)).toEqual([]);
  });
});
