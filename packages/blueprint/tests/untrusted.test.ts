// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createRng } from '@protoyard/core';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { escapeCsvCell, parseCsv, serializeCsv } from '../src/csv.ts';
import {
  applyJsonPatch,
  type Blueprint,
  BlueprintPatchError,
  blueprintShareFragment,
  decodeBlueprintShare,
  encodeBlueprintShare,
  loadUntrustedBlueprint,
  MAX_SHARE_DECODED_BYTES,
  MAX_SHARE_ENCODED_LENGTH,
  paintStreamedBlueprint,
  parseBlueprint,
  readBlueprintShareFragment,
  type ShareDecodeResult,
  ShareLinkTooLargeError,
  supportsShareLinks,
  type UntrustedBlueprintLimits,
} from '../src/index.ts';

/**
 * Untrusted input (AGENTS.md rule 7): the blueprint loader, share links, JSON
 * patches, streamed agent output and CSV export. Each refusal here guards a
 * security fix; see docs/SECURITY.md.
 */

type TestBlueprint = {
  [key: string]: unknown;
  name: string;
  entities: Array<{
    [key: string]: unknown;
    name: string;
    plural: string;
    fields: Array<Record<string, unknown>>;
    seedCount?: number;
  }>;
  roles: unknown[];
  screens: unknown[];
};

function blueprint(): TestBlueprint {
  return {
    formatVersion: 1,
    name: 'Example workspace',
    entities: [
      {
        name: 'project',
        plural: 'projects',
        fields: [{ name: 'title', kind: 'text' }],
        titleField: 'title',
        seedCount: 4,
      },
    ],
    roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    screens: [],
  };
}

function failed(input: unknown, limits?: Partial<UntrustedBlueprintLimits>) {
  const result = loadUntrustedBlueprint(input, limits);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected a failed blueprint load');
  expect(result.issues[0]).toMatchObject({ path: expect.any(Array), fix: expect.any(String) });
  return result.issues[0]!;
}

describe('loadUntrustedBlueprint', () => {
  it('loads valid JSON text and plain objects', () => {
    expect(loadUntrustedBlueprint(JSON.stringify(blueprint()))).toMatchObject({
      success: true,
      blueprint: { name: 'Example workspace' },
    });
    expect(loadUntrustedBlueprint(blueprint()).success).toBe(true);
  });

  it('caps UTF-8 bytes before parsing and rejects deeply nested JSON', () => {
    expect(failed(JSON.stringify(blueprint()), { maxBytes: 10 }).code).toBe('too-large');
    expect(failed(`{"x":${'['.repeat(8)}0${']'.repeat(8)}}`, { maxDepth: 6 }).code).toBe(
      'too-deep'
    );
  });

  it('reports malformed JSON and schema errors as typed issues instead of throwing', () => {
    expect(failed('{').code).toBe('invalid-json');
    expect(failed({ ...blueprint(), name: '' }).code).toBe('invalid-blueprint');
    expect(failed(undefined).code).toBe('invalid-input');
  });

  it('enforces top-level and per-entity item limits', () => {
    const bp = blueprint();
    bp.entities.push({ ...bp.entities[0]!, name: 'task', plural: 'tasks' });
    expect(failed(bp, { maxEntities: 1 })).toMatchObject({ code: 'too-many', path: ['entities'] });

    const fieldsBlueprint = blueprint();
    fieldsBlueprint.entities[0]!.fields.push({ name: 'summary', kind: 'text' });
    expect(failed(fieldsBlueprint, { maxFieldsPerEntity: 1 })).toMatchObject({
      code: 'too-many',
      path: ['entities', 0, 'fields'],
    });

    expect(failed({ ...blueprint(), roles: [{}, {}] }, { maxRoles: 1 }).path).toEqual(['roles']);
    expect(failed({ ...blueprint(), screens: [{}, {}] }, { maxScreens: 1 }).path).toEqual([
      'screens',
    ]);
    expect(
      failed({ ...blueprint(), notifications: [{}, {}] }, { maxNotifications: 1 }).path
    ).toEqual(['notifications']);
    expect(failed({ ...blueprint(), history: [{}, {}] }, { maxHistory: 1 }).path).toEqual([
      'history',
    ]);
  });

  it('rejects prototype-related keys and strips control and bidi characters', () => {
    const pollution = '{"__proto__":{"polluted":true}}';
    expect(failed(pollution).code).toBe('unsafe-key');
    expect(failed('{"constr\\u202euctor":{}}').code).toBe('unsafe-key');
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();

    const source = blueprint();
    source.name = 'Example\u202eworkspace\u0000';
    const loaded = loadUntrustedBlueprint(source);
    expect(loaded.success && loaded.blueprint.name).toBe('Exampleworkspace');
    expect(source.name).toBe('Example\u202eworkspace\u0000');
  });

  it('caps the massive scenario estimate from seedCount × 25', () => {
    const bp = blueprint();
    bp.entities[0]!.seedCount = 3;
    expect(failed(bp, { maxWorldRows: 74 })).toMatchObject({
      code: 'too-many',
      path: ['entities'],
    });
    expect(loadUntrustedBlueprint(bp, { maxWorldRows: 75 }).success).toBe(true);
  });

  it('rejects non-JSON objects and catches cycles without leaking exceptions', () => {
    expect(failed(new Date()).code).toBe('invalid-input');
    const cyclic: Record<string, unknown> = blueprint();
    cyclic.self = cyclic;
    expect(failed(cyclic).code).toBe('invalid-input');
  });
});

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const catalog = readdirSync(join(ROOT, 'blueprints'))
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort()
  .map((name) => ({
    name,
    raw: JSON.parse(readFileSync(join(ROOT, 'blueprints', name), 'utf8')) as Record<
      string,
      unknown
    >,
  }));

/** A link payload from arbitrary bytes, the way an attacker would craft one. */
const craft = (bytes: Uint8Array | Buffer, version = '1') =>
  `${version}.${Buffer.from(bytes).toString('base64url')}`;

function firstCode(result: ShareDecodeResult): string {
  return result.success ? 'ok' : (result.issues[0]?.code ?? 'none');
}

describe('blueprint share links', () => {
  it('gives the same link for the same blueprint, whatever the key order or $schema', async () => {
    const raw = catalog[3]!.raw;
    const reversed = Object.fromEntries(Object.entries(raw).reverse());
    const withSchema = { ...raw, $schema: 'https://example.com/schema.json' };
    const links = await Promise.all(
      [raw, reversed, withSchema].map((input) => encodeBlueprintShare(parseBlueprint(input)))
    );
    expect(new Set(links).size).toBe(1);
  });

  it('builds and reads #bp= fragments, alone or among other parameters', async () => {
    const encoded = await encodeBlueprintShare(parseBlueprint(catalog[0]!.raw));
    const fragment = blueprintShareFragment(encoded);
    expect(fragment).toBe(`#bp=${encoded}`);
    expect(readBlueprintShareFragment(fragment)).toBe(encoded);
    expect(readBlueprintShareFragment(`#shell=phone&bp=${encoded}&devtools=0`)).toBe(encoded);
    expect(readBlueprintShareFragment('#/deals')).toBeNull();
    expect((await decodeBlueprintShare(fragment)).success).toBe(true);
  });

  it('refuses to encode a blueprint whose link would pass the cap', async () => {
    const rng = createRng('share-too-large');
    const noise = () =>
      Array.from({ length: 40 }, () => rng.pick([...'abcdefghijklmnopqrstuvwxyz0123456789'])).join(
        ''
      );
    const huge = {
      ...parseBlueprint(catalog[0]!.raw),
      entities: Array.from({ length: 64 }, () => ({
        name: noise(),
        plural: noise(),
        label: noise(),
        fields: Array.from({ length: 30 }, () => ({ name: noise(), kind: 'text', label: noise() })),
      })),
    } as unknown as Blueprint;
    const error = await encodeBlueprintShare(huge).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ShareLinkTooLargeError);
    expect((error as ShareLinkTooLargeError).encodedLength).toBeGreaterThan(
      MAX_SHARE_ENCODED_LENGTH
    );
    expect((error as Error).message).toMatch(/blueprint\.json file/);
  });

  it('refuses an over-long link before decoding anything', async () => {
    const result = await decodeBlueprintShare(`1.${'A'.repeat(MAX_SHARE_ENCODED_LENGTH)}`);
    expect(firstCode(result)).toBe('too-large');
    expect(result.success ? '' : result.issues[0]!.fix).toMatch(/blueprint\.json/);
  });

  it('stops a decompression bomb at the loader cap', async () => {
    // 32 MB of zeros deflates to about 31 KB: the link-length cap stops it first.
    expect(
      firstCode(await decodeBlueprintShare(craft(deflateRawSync(Buffer.alloc(32 * 1024 * 1024)))))
    ).toBe('too-large');
    // 8 MB of zeros fits in a valid-length link; inflating must stop past 256 KB.
    const bomb = craft(deflateRawSync(Buffer.alloc(8 * 1024 * 1024), { level: 9 }));
    expect(bomb.length).toBeLessThanOrEqual(MAX_SHARE_ENCODED_LENGTH);
    const started = performance.now();
    const result = await decodeBlueprintShare(bomb);
    expect(firstCode(result)).toBe('too-large');
    expect(result.success ? '' : result.issues[0]!.message).toContain(
      String(MAX_SHARE_DECODED_BYTES)
    );
    expect(performance.now() - started).toBeLessThan(2_000);
    // Just under the cap is still decoded (and then rejected by the loader as JSON).
    const justUnder = craft(deflateRawSync(Buffer.alloc(MAX_SHARE_DECODED_BYTES, 0x20)));
    expect(firstCode(await decodeBlueprintShare(justUnder))).toBe('invalid-json');
  });

  it('reports versions, malformed data and corrupt streams as typed issues', async () => {
    const valid = await encodeBlueprintShare(parseBlueprint(catalog[0]!.raw));
    const data = valid.slice(2);
    const cases: [string, string][] = [
      ['', 'invalid-link'],
      [data, 'invalid-link'],
      [`2.${data}`, 'unsupported-version'],
      [`v1.${data}`, 'unsupported-version'],
      ['1.', 'invalid-link'],
      ['1.@@@@', 'invalid-link'],
      ['1.A', 'invalid-link'],
      [`1.${data.slice(0, data.length >> 1)}`, 'invalid-link'],
      [craft(Buffer.from([0xff, 0xff, 0xff, 0xff])), 'invalid-link'],
      [craft(deflateRawSync(Buffer.from([0xc3, 0x28]))), 'invalid-link'],
      [craft(deflateRawSync(Buffer.from('not json'))), 'invalid-json'],
      [craft(deflateRawSync(Buffer.from('{"__proto__":{"x":1}}'))), 'unsafe-key'],
      [
        craft(deflateRawSync(Buffer.from(JSON.stringify({ formatVersion: 1 })))),
        'invalid-blueprint',
      ],
    ];
    for (const [input, code] of cases) {
      const result = await decodeBlueprintShare(input);
      expect(firstCode(result), JSON.stringify(input.slice(0, 40))).toBe(code);
      if (!result.success) {
        for (const issue of result.issues) {
          expect(issue.message.length).toBeGreaterThan(0);
          expect(issue.fix.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('never throws on 200 seeded corruptions of real links', async () => {
    const rng = createRng('share-link-fuzz-v1');
    const links = await Promise.all(
      catalog.slice(0, 10).map(({ raw }) => encodeBlueprintShare(parseBlueprint(raw)))
    );
    const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.#=%+/ '];
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 200; i += 1) {
      const link = rng.pick(links);
      const at = rng.int(0, link.length - 1);
      const mutated = rng.pick([
        `${link.slice(0, at)}${rng.pick(alphabet)}${link.slice(at + 1)}`,
        link.slice(0, at),
        `${link.slice(0, at)}${link.slice(at + 1)}`,
        `${link}${rng.pick(alphabet)}`,
      ]);
      let result: ShareDecodeResult | undefined;
      await expect(
        decodeBlueprintShare(mutated).then((value) => {
          result = value;
        })
      ).resolves.toBeUndefined();
      const code = firstCode(result!);
      outcomes.set(code, (outcomes.get(code) ?? 0) + 1);
      if (result?.success) expect(() => parseBlueprint(result!.blueprint)).not.toThrow();
    }
    expect(outcomes.get('invalid-link') ?? 0).toBeGreaterThan(0);
  });
});

describe('share links without deflate-raw streams', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('says which browsers support them instead of reporting a broken link', async () => {
    const encoded = await encodeBlueprintShare(parseBlueprint(catalog[0]!.raw));
    expect(supportsShareLinks()).toBe(true);
    vi.stubGlobal('DecompressionStream', undefined);
    vi.stubGlobal('CompressionStream', undefined);
    expect(supportsShareLinks()).toBe(false);
    const result = await decodeBlueprintShare(encoded);
    expect(firstCode(result)).toBe('unsupported-browser');
    expect(result.success ? '' : result.issues[0]!.message).toMatch(
      /Chrome 103\+, Safari 16\.4\+, Firefox 113\+/
    );
    await expect(encodeBlueprintShare(parseBlueprint(catalog[0]!.raw))).rejects.toThrow(
      /cannot create share links/
    );
    // Size and version checks still come first: they need no decompression.
    expect(firstCode(await decodeBlueprintShare(`2.${encoded.slice(2)}`))).toBe(
      'unsupported-version'
    );
  });
});

describe('other untrusted paths', () => {
  it('refuses JSON patch pointers and values that reach the prototype chain', () => {
    const patchCode = (run: () => unknown) => {
      try {
        run();
      } catch (error) {
        if (error instanceof BlueprintPatchError) return error.code;
        throw error;
      }
      throw new Error('expected a BlueprintPatchError');
    };
    for (const path of ['/__proto__/polluted', '/constructor/prototype/polluted', '/a/prototype']) {
      expect(
        patchCode(() => applyJsonPatch({ a: {} }, [{ op: 'add', path, value: true }])),
        path
      ).toBe('unsafe-pointer');
    }
    const value = JSON.parse('{"__proto__": {"polluted": true}}');
    expect(patchCode(() => applyJsonPatch({}, [{ op: 'add', path: '/a', value }]))).toBe(
      'invalid-patch'
    );
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('refuses prototype keys in a streamed, half-written blueprint', async () => {
    const deck = `${JSON.stringify(
      JSON.parse(readFileSync(join(ROOT, 'blueprints/decks/example.json'), 'utf8')),
      null,
      2
    )}\n`;
    const poisoned = deck.replace('{', '{"__proto__":{"polluted":true},');
    expect(
      await paintStreamedBlueprint(poisoned.slice(0, Math.floor(poisoned.length / 2)))
    ).toBeNull();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('guards CSV formula injection on export, including a sign followed by a digit', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1");
    expect(escapeCsvCell('@sum')).toBe("'@sum");
    expect(escapeCsvCell('+1-555-0100')).toBe("'+1-555-0100");
    expect(escapeCsvCell("-1+cmd|' /C calc'!A0")).toBe("'-1+cmd|' /C calc'!A0");
    expect(escapeCsvCell('\uFF1D1+1')).toBe("'\uFF1D1+1");
    for (const number of ['-5', '+1.5', '1e3', '42']) expect(escapeCsvCell(number)).toBe(number);
    const csv = serializeCsv([['name'], ["=cmd|'/c calc'!A0"]]);
    // Re-parse keeps the leading quote so spreadsheets see text, not a formula.
    expect(parseCsv(csv)[1]![0]).toBe("'=cmd|'/c calc'!A0");
  });
});
