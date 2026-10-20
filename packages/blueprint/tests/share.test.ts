// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { createRng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  type Blueprint,
  blueprintIdentity,
  blueprintShareFragment,
  decodeBlueprintShare,
  encodeBlueprintShare,
  MAX_SHARE_DECODED_BYTES,
  MAX_SHARE_ENCODED_LENGTH,
  parseBlueprint,
  readBlueprintShareFragment,
  type ShareDecodeResult,
  ShareLinkTooLargeError,
} from '../src/index.ts';

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
  it('reads the 40 catalog blueprints', () => {
    expect(catalog.length).toBeGreaterThanOrEqual(40);
  });

  it('round-trips every catalog blueprint and stays far below the link cap', async () => {
    const sizes: { name: string; json: number; encoded: number }[] = [];
    for (const { name, raw } of catalog) {
      const blueprint = parseBlueprint(raw);
      const encoded = await encodeBlueprintShare(blueprint);
      expect(encoded, name).toMatch(/^1\.[A-Za-z0-9_-]+$/);
      const decoded = await decodeBlueprintShare(encoded);
      expect(decoded.success, `${name}: ${JSON.stringify(decoded.issues)}`).toBe(true);
      if (decoded.success) {
        // Same content: the identity (canonical JSON digest) survives the trip.
        expect(await blueprintIdentity(decoded.blueprint), name).toEqual(
          await blueprintIdentity(blueprint)
        );
      }
      sizes.push({ name, json: JSON.stringify(raw).length, encoded: encoded.length });
    }
    const largest = sizes.reduce((max, size) => (size.encoded > max.encoded ? size : max));
    // Reported size: the largest catalog link is ats-recruiting.json, measured at 1,945
    // characters with Node's zlib (median 1,773, smallest 1,657), from about 3.9 KB of JSON.
    expect(largest.name).toBe('ats-recruiting.json');
    expect(largest.encoded).toBeLessThan(2_500);
    expect(largest.encoded).toBeLessThan(MAX_SHARE_ENCODED_LENGTH / 4);
    for (const size of sizes) expect(size.encoded, size.name).toBeLessThan(size.json);
  });

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

  it('never throws on 500 seeded corruptions of real links', async () => {
    const rng = createRng('share-link-fuzz-v1');
    const links = await Promise.all(
      catalog.slice(0, 10).map(({ raw }) => encodeBlueprintShare(parseBlueprint(raw)))
    );
    const alphabet = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.#=%+/ '];
    const outcomes = new Map<string, number>();
    for (let i = 0; i < 500; i += 1) {
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
