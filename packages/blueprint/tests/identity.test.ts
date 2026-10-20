// @vitest-environment node
/// <reference types="node" />
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { NamespaceSchema } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  BLUEPRINT_NAMESPACE_PREFIX,
  blueprintIdentity,
  canonicalJson,
  parseBlueprint,
} from '../src/index.ts';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CATALOG = join(ROOT, 'blueprints');
const files = readdirSync(CATALOG)
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort();
const readText = (name: string) => readFileSync(join(CATALOG, name), 'utf8');

/** Rebuilds every object with its keys in reverse order, at every depth. */
function reverseKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .reverse()
        .map(([key, item]) => [key, reverseKeys(item)])
    );
  }
  return value;
}

describe('canonicalJson', () => {
  it('sorts keys at every depth, keeps array order and drops whitespace', () => {
    expect(canonicalJson({ b: 1, a: { d: [3, 1, 2], c: 'x' } })).toBe(
      '{"a":{"c":"x","d":[3,1,2]},"b":1}'
    );
    expect(canonicalJson({ b: 1, a: 2 })).toBe(canonicalJson({ a: 2, b: 1 }));
    expect(canonicalJson([2, 1])).not.toBe(canonicalJson([1, 2]));
  });

  it('matches JSON.stringify for undefined, escapes and negative zero', () => {
    expect(canonicalJson({ a: undefined, b: 'q" \n' })).toBe(JSON.stringify({ b: 'q" \n' }));
    expect(canonicalJson([undefined])).toBe('[null]');
    expect(canonicalJson(-0)).toBe('0');
    expect(canonicalJson({ __proto__x: 1 })).toBe('{"__proto__x":1}');
  });

  it('refuses values JSON cannot represent and circular structures', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, () => 1, Symbol('s'), 1n]) {
      expect(() => canonicalJson({ bad }), String(bad)).toThrow(TypeError);
    }
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(() => canonicalJson(loop)).toThrow(/circular/);
    // A shared (non-circular) reference is fine.
    const shared = { x: 1 };
    expect(canonicalJson({ a: shared, b: shared })).toBe('{"a":{"x":1},"b":{"x":1}}');
  });
});

describe('blueprintIdentity', () => {
  it('reads the 40 catalog blueprints', () => {
    expect(files.length).toBeGreaterThanOrEqual(40);
  });

  it('is the SHA-256 of the canonical JSON, without $schema', async () => {
    const blueprint = parseBlueprint(JSON.parse(readText(files[0]!)));
    const { $schema: _schema, ...content } = blueprint;
    const expected = createHash('sha256').update(canonicalJson(content), 'utf8').digest('hex');
    const identity = await blueprintIdentity(blueprint);
    expect(identity.sha256).toBe(expected);
    expect(identity.sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('derives a valid manifest namespace from the digest', async () => {
    const blueprint = parseBlueprint(JSON.parse(readText(files[0]!)));
    const { sha256, namespace } = await blueprintIdentity(blueprint);
    expect(namespace).toMatch(/^bp-[a-z2-7]{26}$/);
    expect(namespace.startsWith(BLUEPRINT_NAMESPACE_PREFIX)).toBe(true);
    expect(NamespaceSchema.parse(namespace)).toBe(namespace);
    // Base32 of the digest's first 130 bits, most significant first.
    const bits = [...Buffer.from(sha256, 'hex')]
      .map((byte) => byte.toString(2).padStart(8, '0'))
      .join('')
      .slice(0, 130);
    const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
    const expected = bits.match(/.{5}/g)!.map((group) => alphabet[Number.parseInt(group, 2)]);
    expect(namespace.slice(3)).toBe(expected.join(''));
  });

  it('ignores key order, whitespace, defaults and $schema', async () => {
    const text = readText(files[1]!);
    const raw = JSON.parse(text) as Record<string, unknown>;
    const base = await blueprintIdentity(parseBlueprint(raw));

    const minified = JSON.parse(JSON.stringify(raw));
    const reordered = reverseKeys(raw);
    const reformatted = JSON.parse(JSON.stringify(raw, null, 8));
    const { $schema: _schema, ...withoutSchema } = raw;
    const withSchema = { ...raw, $schema: 'https://example.com/editor-hint.json' };
    for (const variant of [minified, reordered, reformatted, withoutSchema, withSchema]) {
      expect(await blueprintIdentity(parseBlueprint(variant))).toEqual(base);
    }

    // Spelling out a default (tags: []) is the same product as omitting it.
    const { tags: _tags, ...withoutTags } = raw;
    if (Array.isArray(raw.tags) && raw.tags.length === 0) {
      expect(await blueprintIdentity(parseBlueprint(withoutTags))).toEqual(base);
    }
    const explicitDefaults = parseBlueprint({ ...withoutTags, tags: [] });
    const omittedDefaults = parseBlueprint(withoutTags);
    expect(await blueprintIdentity(explicitDefaults)).toEqual(
      await blueprintIdentity(omittedDefaults)
    );
  });

  it('changes with any content edit', async () => {
    const raw = JSON.parse(readText(files[2]!)) as { name: string; entities: unknown[] };
    const base = await blueprintIdentity(parseBlueprint(raw));
    const renamed = await blueprintIdentity(parseBlueprint({ ...raw, name: `${raw.name} 2` }));
    const reordered = await blueprintIdentity(
      parseBlueprint({ ...raw, entities: [...raw.entities].reverse() })
    );
    expect(renamed.sha256).not.toBe(base.sha256);
    expect(renamed.namespace).not.toBe(base.namespace);
    expect(reordered.sha256).not.toBe(base.sha256);
  });

  it('is stable: a pinned blueprint keeps its identity across runs and platforms', async () => {
    const pinned = parseBlueprint({
      formatVersion: 1,
      name: 'Identity Pin',
      entities: [
        {
          name: 'note',
          plural: 'notes',
          titleField: 'title',
          fields: [{ name: 'title', kind: 'text' }],
        },
      ],
      roles: [{ name: 'owner', permissions: { '*': ['*'] } }],
    });
    const identity = await blueprintIdentity(pinned);
    const again = await blueprintIdentity(pinned);
    expect(again).toEqual(identity);
    // Pinned: a change here means every stored player world would get a new namespace.
    expect(identity).toEqual({
      sha256: '8931dfd11218a789510f47df3ca6b0f7d8f5619d366fce6d89eb653b8d442e29',
      namespace: 'bp-rey57uisdctysuipi7ptzjvq67',
    });
  });

  it('gives every catalog blueprint a distinct identity', async () => {
    const identities = await Promise.all(
      files.map((name) => blueprintIdentity(parseBlueprint(JSON.parse(readText(name)))))
    );
    expect(new Set(identities.map((identity) => identity.sha256)).size).toBe(files.length);
    expect(new Set(identities.map((identity) => identity.namespace)).size).toBe(files.length);
    for (const { namespace } of identities)
      expect(NamespaceSchema.safeParse(namespace).success).toBe(true);
  });
});
