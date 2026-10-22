// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BLOCK_CATALOG_LIST } from '@protoyard/blocks/catalog';
import { DECK_CONTROLS, loadUntrustedDeck } from '@protoyard/decks';
import { describeSlideForAgent, formatAgentReference } from '@protoyard/decks/agent';
import { DECK_LAYOUTS } from '@protoyard/decks/layouts';
import { DeckJsonSchema, safeParseDeck } from '@protoyard/decks/schema';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closestIds } from '../src/commands/deck.ts';
import { CAPABILITIES, CAPABILITY_IDS } from '../src/commands/doctor.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

/**
 * `protoyard deck …` (Task 10, AC-deck-cli): the schema, the layout and
 * block catalogs, lint with JSON pointers, inspect from a pasted reference,
 * and capabilities — each in text and `--json`, with the CLI's exit codes.
 */

const REPO = fileURLToPath(new URL('../../../', import.meta.url));
const EXAMPLE = JSON.parse(readFileSync(join(REPO, 'blueprints/decks/example.json'), 'utf8')) as {
  deck: { slides: { id: string }[] };
};

let ws: TempWorkspace;
const deck = (...args: string[]) => cli(['--root', ws.root, 'deck', ...args]);
const deckJson = (...args: string[]) => cli(['--root', ws.root, '--json', 'deck', ...args]);

beforeEach(() => {
  ws = createWorkspace();
  ws.write('decks/example.json', EXAMPLE);
  ws.write('prototypes/demo-deck/blueprint.json', EXAMPLE);
  // A bare deck (no blueprint wrapper) with an error and a warning.
  ws.write('decks/broken.json', {
    style: {},
    slides: [
      {
        id: 'cover',
        layout: 'image-left',
        props: {
          title: 'Broken',
          body: 'An image with no description.',
          image: { src: 'media/cover.webp', width: 800, height: 600, alt: '' },
        },
      },
    ],
  });
});
afterEach(() => ws.cleanup());

describe('deck schema', () => {
  it('prints DeckJsonSchema as JSON text and in the envelope', async () => {
    const text = await deck('schema');
    expect(text.code).toBe(0);
    expect(JSON.parse(text.stdout)).toEqual(DeckJsonSchema);
    const json = await deckJson('schema');
    expect(json.json()).toMatchObject({ ok: true, command: 'deck schema' });
    expect(json.json<{ data: { schema: unknown } }>().data.schema).toEqual(DeckJsonSchema);
  });

  it('needs no workspace', async () => {
    const run = await cli(['--json', '--cwd', '/', 'deck', 'schema']);
    expect(run.code).toBe(0);
  });
});

describe('deck layouts', () => {
  it('lists every catalog layout with guidance, limits and a valid sample slide', async () => {
    const text = await deck('layouts');
    expect(text.code).toBe(0);
    for (const layout of DECK_LAYOUTS) expect(text.stdout).toContain(`## ${layout.id} — `);
    expect(text.stdout).toContain('Use when:');

    const json = await deckJson('layouts');
    const data = json.json<{
      data: { count: number; layouts: { id: string; sampleSlide: unknown; useWhen: string[] }[] };
    }>().data;
    expect(data.count).toBe(DECK_LAYOUTS.length);
    expect(data.layouts.map((layout) => layout.id)).toEqual(DECK_LAYOUTS.map((l) => l.id));
    // Every sample is a slide the deck schema accepts.
    const sampleDeck = {
      style: {},
      slides: data.layouts.map((layout, index) => ({
        ...(layout.sampleSlide as object),
        id: `s${index}`,
      })),
    };
    const parsed = safeParseDeck(sampleDeck);
    expect(parsed.issues).toEqual([]);
  });

  it('shows one layout with its sample and props schema, and suggests ids for a typo', async () => {
    const text = await deck('layouts', 'big-stat');
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('Sample slide:');
    expect(text.stdout).toContain('"layout": "big-stat"');

    const json = await deckJson('layouts', 'big-stat');
    const layout = json.json<{ data: { layout: { id: string; propsSchema: unknown } } }>().data
      .layout;
    expect(layout.id).toBe('big-stat');
    expect(layout.propsSchema).toMatchObject({ type: 'object' });

    const typo = await deckJson('layouts', 'big-stats');
    expect(typo.code).toBe(3);
    expect(typo.json<{ error: { hint: string } }>().error.hint).toContain('big-stat');
  });
});

describe('deck blocks', () => {
  it('lists the block catalog in text and JSON', async () => {
    const text = await deck('blocks');
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('# Blocks reference');

    const json = await deckJson('blocks');
    const data = json.json<{ data: { count: number; blocks: { type: string }[] } }>().data;
    expect(data.count).toBe(BLOCK_CATALOG_LIST.length);
    expect(data.blocks.map((block) => block.type)).toEqual(
      BLOCK_CATALOG_LIST.map((entry) => entry.type)
    );
  });

  it('shows one block with its examples', async () => {
    const type = BLOCK_CATALOG_LIST[0]?.type ?? 'heading';
    const text = await deck('blocks', type);
    expect(text.stdout).toContain('Minimal example:');
    expect(text.stdout).toContain('Rich example:');
    const json = await deckJson('blocks', type);
    expect(json.json<{ data: { block: { type: string } } }>().data.block.type).toBe(type);
    expect((await deckJson('blocks', 'no-such-block')).code).toBe(3);
  });
});

describe('deck lint', () => {
  it('passes a clean deck blueprint, by file and by prototype slug', async () => {
    for (const target of ['decks/example.json', 'demo-deck']) {
      const json = await deckJson('lint', target);
      expect(json.code, target).toBe(0);
      const data = json.json<{ data: { valid: boolean; errors: number } }>().data;
      expect(data).toMatchObject({ valid: true, errors: 0 });
    }
    const text = await deck('lint', 'decks/example.json');
    expect(text.stdout).toContain('decks/example.json: 0 errors');
  });

  it('reports errors with JSON pointers, what to change and why, and exits 4', async () => {
    const json = await deckJson('lint', 'decks/broken.json');
    expect(json.code).toBe(4);
    const envelope = json.json<{
      ok: boolean;
      error: { code: string };
      data: {
        findings: {
          rule: string;
          severity: string;
          pointer: string;
          slideId: string | null;
          message: string;
          why: string | null;
        }[];
      };
    }>();
    expect(envelope).toMatchObject({ ok: false, error: { code: 'validation' } });
    const alt = envelope.data.findings.find((finding) => finding.rule === 'image-alt');
    expect(alt).toMatchObject({
      severity: 'error',
      slideId: 'cover',
      pointer: '/slides/0/props/image/alt',
    });
    expect(alt?.message).toMatch(/alt/);
    expect(alt?.why).toEqual(expect.any(String));

    const text = await deck('lint', 'decks/broken.json');
    expect(text.code).toBe(4);
    expect(text.stdout).toMatch(/error\timage-alt\t\/slides\/0\/props\/image\/alt \(slide cover\)/);
    expect(text.stdout).toContain('Why: ');
  });

  it('uses the CLI exit codes for a missing file and a non-deck file', async () => {
    expect((await deckJson('lint', 'decks/missing.json')).code).toBe(3);
    ws.write('decks/app.json', { name: 'An app', entities: [] });
    expect((await deckJson('lint', 'decks/app.json')).code).toBe(4);
    ws.write('decks/bad.json', '{ not json');
    expect((await deckJson('lint', 'decks/bad.json')).code).toBe(4);
    expect((await deckJson('lint')).code).toBe(2);
  });
});

describe('deck inspect', () => {
  it('resolves --slide to the file, JSON pointer and slide JSON', async () => {
    const json = await deckJson('inspect', 'decks/example.json', '--slide', 'body');
    expect(json.code).toBe(0);
    const data = json.json<{
      data: { file: string; pointer: string; propsPointer: string; slide: unknown };
    }>().data;
    expect(data).toMatchObject({
      file: 'decks/example.json',
      pointer: '/deck/slides/1',
      propsPointer: '/deck/slides/1/props',
    });
    expect(data.slide).toEqual(EXAMPLE.deck.slides[1]);

    const text = await deck('inspect', 'demo-deck', '--slide', 'body');
    expect(text.stdout).toContain('Pointer: /deck/slides/1');
    expect(text.stdout).toContain('"id": "body"');
  });

  it('round-trips a reference from formatAgentReference', async () => {
    const loaded = loadUntrustedDeck((EXAMPLE as unknown as { deck: unknown }).deck);
    if (!loaded.success) throw new Error('example deck must load');
    const record = describeSlideForAgent(
      loaded.deck,
      { slideId: 'close', step: 0 },
      { source: { kind: 'blueprint', value: 'decks/example.json' } }
    );
    const line = formatAgentReference(record, 'line');

    // The reference names its own source, so no target is needed.
    const json = await deckJson('inspect', '--ref', `Please fix this: ${line}`);
    expect(json.code).toBe(0);
    const data = json.json<{
      data: {
        file: string;
        pointer: string;
        deckMatches: boolean;
        reference: { slide: { id: string } };
      };
    }>().data;
    expect(data).toMatchObject({
      file: 'decks/example.json',
      pointer: record.slide.pointer,
      deckMatches: true,
    });
    expect(data.reference.slide.id).toBe('close');

    // From a prototype source too.
    const fromPrototype = formatAgentReference(
      describeSlideForAgent(
        loaded.deck,
        { slideId: 'open' },
        {
          source: { kind: 'prototype', value: 'demo-deck' },
        }
      )
    );
    const text = await deck('inspect', '--ref', fromPrototype);
    expect(text.code).toBe(0);
    expect(text.stdout).toContain('File: prototypes/demo-deck/blueprint.json');
    expect(text.stdout).toContain('Pointer: /deck/slides/0');
  });

  it('exits 4 with the closest slide ids for a slide that no longer exists', async () => {
    const json = await deckJson('inspect', 'decks/example.json', '--slide', 'bodyy');
    expect(json.code).toBe(4);
    const envelope = json.json<{ error: { hint: string }; data: { candidates: string[] } }>();
    expect(envelope.data.candidates[0]).toBe('body');
    expect(envelope.error.hint).toContain('Closest slide ids: body');

    const stale = '[slide-ref] deck=example-deck id=closing source=blueprint:decks/example.json';
    const text = await deck('inspect', '--ref', stale);
    expect(text.code).toBe(4);
    expect(text.stderr + text.stdout).toContain('close');
  });

  it('never reads outside the workspace for a pasted reference (security review)', async () => {
    // A JSON deck and a secret outside the workspace, plus a symlink to the deck inside it.
    const outside = mkdtempSync(join(tmpdir(), 'protoyard-outside-'));
    try {
      writeFileSync(join(outside, 'deck.json'), JSON.stringify(EXAMPLE));
      writeFileSync(join(outside, 'secret.env'), 'SECRET_TOKEN=do-not-print');
      symlinkSync(join(outside, 'deck.json'), join(ws.root, 'decks', 'linked.json'));
      const escapes = [
        `blueprint:${join(outside, 'deck.json')}`,
        `blueprint:${relative(ws.root, join(outside, 'deck.json'))}`,
        'blueprint:decks/../../deck.json',
        'blueprint:decks/x.json?/../../deck.json',
        'prototype:../demo-deck',
      ];
      for (const source of escapes) {
        const result = await deckJson('inspect', '--ref', `[slide-ref] id=open source=${source}`);
        expect(result.code, source).not.toBe(0);
        expect(result.stdout + result.stderr, source).not.toContain('"slide"');
      }
      // A symlink inside the workspace that points out of it is refused too.
      const linked = await deckJson(
        'inspect',
        '--ref',
        '[slide-ref] id=open source=blueprint:decks/linked.json'
      );
      expect(linked.code).toBe(4);

      // So is a pasted prototype whose blueprint.json is a symlink out of it
      // (Final Review area B, finding 6).
      mkdirSync(join(ws.root, 'prototypes', 'escaped-deck'), { recursive: true });
      symlinkSync(
        join(outside, 'deck.json'),
        join(ws.root, 'prototypes', 'escaped-deck', 'blueprint.json')
      );
      const escaped = await deckJson(
        'inspect',
        '--ref',
        '[slide-ref] id=open source=prototype:escaped-deck'
      );
      expect(escaped.code).toBe(4);
      expect(escaped.stdout + escaped.stderr).not.toContain('"slide"');

      // A file that is not JSON is named, never quoted.
      ws.write('decks/notes.json', 'SECRET_TOKEN=do-not-print');
      const notJson = await deck('inspect', 'decks/notes.json', '--slide', 'open');
      expect(notJson.code).toBe(4);
      expect(notJson.stdout + notJson.stderr).toContain('is not valid JSON.');
      expect(notJson.stdout + notJson.stderr).not.toContain('SECRET');
    } finally {
      rmSync(outside, { recursive: true, force: true });
    }
  });

  it('exits 4 when the referenced deck no longer exists', async () => {
    const gone = '[slide-ref] deck=x id=open source=blueprint:decks/deleted.json';
    expect((await deckJson('inspect', '--ref', gone)).code).toBe(4);
  });

  it('rejects ambiguous or unreadable input as usage errors', async () => {
    expect((await deckJson('inspect', 'decks/example.json')).code).toBe(2);
    expect(
      (await deckJson('inspect', 'decks/example.json', '--slide', 'open', '--ref', 'x')).code
    ).toBe(2);
    expect((await deckJson('inspect', 'decks/example.json', '--ref', 'no reference')).code).toBe(2);
  });

  it('prints slide text inert: no bidirectional or control characters reach the terminal', async () => {
    const hostile = structuredClone(EXAMPLE) as { deck: { slides: { notes?: string }[] } };
    const slide = hostile.deck.slides[0];
    if (slide) slide.notes = 'Read \u202Ethis\u202C and \u001b[31mred\u001b[0m.';
    ws.write('decks/hostile.json', hostile);
    const text = await deck('inspect', 'decks/hostile.json', '--slide', 'open');
    expect(text.code).toBe(0);
    expect(text.stdout).not.toContain(String.fromCharCode(0x1b));
    expect(text.stdout).not.toMatch(/[\u202a-\u202e\u2066-\u2069]/);
    expect(text.stdout).toContain('\\u202e');
  });
});

describe('deck capabilities', () => {
  it('lists levels, catalogs and every control in text and JSON', async () => {
    const json = await deckJson('capabilities');
    expect(json.code).toBe(0);
    const data = json.json<{
      data: { levels: { level: number }[]; controls: { id: string }[]; layouts: string[] };
    }>().data;
    expect(data.levels.map((level) => level.level)).toEqual([1, 2]);
    expect(data.controls.map((control) => control.id)).toEqual(DECK_CONTROLS.map((c) => c.id));
    expect(data.layouts).toHaveLength(DECK_LAYOUTS.length);

    const text = await deck('capabilities');
    expect(text.stdout).toContain('1 — player');
    expect(text.stdout).toContain('2 — generate');
    for (const control of DECK_CONTROLS) expect(text.stdout).toContain(control.id);
  });
});

describe('the deck-cli capability id', () => {
  it('is defined, implemented and reported by doctor --json', async () => {
    expect(CAPABILITY_IDS).toContain('deck-cli');
    expect(CAPABILITIES).toContain('deck-cli');
    const run = await cli(['doctor', '--json', '--offline']);
    expect(run.json<{ capabilities: string[] }>().capabilities).toContain('deck-cli');
  });
});

describe('closestIds', () => {
  it('prefers shared substrings, then edit distance, then deck order', () => {
    expect(closestIds('body', ['open', 'body-2', 'close'])[0]).toBe('body-2');
    expect(closestIds('clse', ['open', 'body', 'close'])[0]).toBe('close');
    expect(closestIds('x', ['a', 'b', 'c', 'd', 'e', 'f'])).toHaveLength(5);
  });
});
