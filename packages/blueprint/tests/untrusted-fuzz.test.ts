// @vitest-environment node
/// <reference types="node" />
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRng, hashString, type Rng } from '@protoyard/core';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS,
  loadUntrustedBlueprint,
  loadUntrustedDocument,
  parseBlueprint,
  safeParseAnyBlueprint,
  type UntrustedBlueprintIssue,
  type UntrustedBlueprintResult,
} from '../src/index.ts';

/**
 * Deterministic fuzzing of the untrusted blueprint loader (ADR-030). A seeded
 * mutator (core `createRng`, no new dependency) applies structural mutations
 * to the catalog blueprints. For every input the loader must return a valid
 * blueprint or typed issues, within a time cap, and never fall into its
 * catch-all (which would mean an unexpected internal error was swallowed).
 */

const SEED = 'plan004-untrusted-fuzz-v1';
const ITERATIONS = 2_000;
/** Generous for a loaded CI runner; a typical input takes a few milliseconds. */
const PER_INPUT_MS = 1_000;

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const CATALOG = readdirSync(join(ROOT, 'blueprints'))
  .filter((name) => name.endsWith('.json') && !name.startsWith('.'))
  .sort()
  .map((name) => readFileSync(join(ROOT, 'blueprints', name), 'utf8'));

const ISSUE_CODES: readonly UntrustedBlueprintIssue['code'][] = [
  'invalid-input',
  'too-large',
  'too-deep',
  'too-many',
  'unsafe-key',
  'invalid-json',
  'invalid-blueprint',
];
/** The loader's catch-all message: seeing it means an internal error was swallowed. */
const CATCH_ALL = 'Blueprint could not be safely loaded.';
const CONTROL_OR_BIDI =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to detect them.
  /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;
const NASTY_CHARS = [
  '\u0000',
  '\u0007',
  '\u001b',
  '\u007f',
  '\u0085',
  '\u202e',
  '\u2066',
  '\u200f',
  '\ufeff',
  '\n',
  '\t',
];

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Container = Json[] | { [key: string]: Json };
type FuzzInput = { kind: string; input: string | Json };

/** Every container in the tree with the path to it, so mutations can target any depth. */
function containers(
  node: Json,
  path: (string | number)[] = []
): { node: Container; path: (string | number)[] }[] {
  if (node === null || typeof node !== 'object') return [];
  const out: { node: Container; path: (string | number)[] }[] = [{ node, path }];
  const entries = Array.isArray(node) ? node.map((v, i) => [i, v] as const) : Object.entries(node);
  for (const [key, value] of entries) out.push(...containers(value, [...path, key]));
  return out;
}

function keysOf(node: Container): (string | number)[] {
  return Array.isArray(node) ? node.map((_, i) => i) : Object.keys(node);
}

function get(node: Container, key: string | number): Json {
  return Array.isArray(node) ? (node[key as number] ?? null) : (node[key as string] ?? null);
}

function set(node: Container, key: string | number, value: Json): void {
  if (Array.isArray(node)) node[key as number] = value;
  else node[key as string] = value;
}

function randomScalar(rng: Rng): Json {
  return rng.pick<Json>([
    null,
    true,
    false,
    0,
    -1,
    1e308,
    -0,
    2 ** 53 + 1,
    0.5,
    '',
    'x'.repeat(rng.int(1, 300)),
    '<script>alert(1)</script>',
    'javascript:alert(1)',
    '{{constructor}}',
  ]);
}

function nest(depth: number): Json {
  let value: Json = 'deep';
  for (let i = 0; i < depth; i += 1) value = i % 2 ? [value] : { d: value };
  return value;
}

/** One structural mutation of the tree in place; returns its label. */
function mutateTree(root: Json, rng: Rng): string {
  const all = containers(root);
  const target = rng.pick(all);
  const keys = keysOf(target.node);
  const key = keys.length ? rng.pick(keys) : 0;
  const op = rng.int(0, 11);
  switch (op) {
    case 0:
      if (Array.isArray(target.node)) target.node.splice(key as number, 1);
      else delete target.node[key as string];
      return 'delete';
    case 1:
      set(target.node, key, randomScalar(rng));
      return 'retype';
    case 2: {
      const value = get(target.node, key);
      if (Array.isArray(target.node)) {
        const times = rng.pick([1, 5, 80]);
        for (let i = 0; i < times; i += 1) target.node.push(structuredClone(value));
        return `duplicate-x${times}`;
      }
      set(target.node, `${String(key)}Copy`, structuredClone(value));
      return 'duplicate-key';
    }
    case 3: {
      const value = get(target.node, key);
      set(target.node, key, Array.isArray(value) ? { ...value } : [value]);
      return 'container-swap';
    }
    case 4:
      set(target.node, key, nest(rng.pick([10, 31, 33, 200])));
      return 'nest';
    case 5: {
      const value = get(target.node, key);
      const char = rng.pick(NASTY_CHARS);
      if (typeof value === 'string') {
        const at = rng.int(0, value.length);
        set(target.node, key, `${value.slice(0, at)}${char}${value.slice(at)}`);
      } else if (!Array.isArray(target.node)) {
        target.node[`${String(key)}${char}`] = value;
      }
      return 'control-chars';
    }
    case 6:
      set(target.node, key, 'x'.repeat(rng.pick([1_000, 70_000, 300_000])));
      return 'long-string';
    case 7: {
      // Cross-references: entity, relation and screen names that point nowhere.
      const value = get(target.node, key);
      if (typeof value === 'string') set(target.node, key, `${value}-renamed`);
      return 'rename';
    }
    case 8: {
      const value = get(target.node, key);
      if (typeof value === 'number')
        set(target.node, key, rng.pick([-value, value * 1000, 500, 501]));
      else set(target.node, key, rng.int(-5, 1_000_000));
      return 'number';
    }
    case 9:
      if (!Array.isArray(target.node)) target.node.seedCount = rng.pick([1, 500, 501, 100_000]);
      return 'seed-count';
    case 10:
      if (root && typeof root === 'object' && !Array.isArray(root)) {
        root.formatVersion = rng.pick<Json>([0, 2, '1', null]);
      }
      return 'format-version';
    default:
      if (!Array.isArray(target.node))
        target.node[rng.pick(['extra', 'onload', '$ref'])] = randomScalar(rng);
      return 'unknown-key';
  }
}

/** Text-level mutations JSON objects cannot express. */
function mutateText(text: string, rng: Rng): { kind: string; input: string } {
  switch (rng.int(0, 5)) {
    case 0:
      return { kind: 'truncate', input: text.slice(0, rng.int(0, text.length - 1)) };
    case 1: {
      // An own `__proto__` or `constructor` key, as a crafted link would carry.
      const key = rng.pick(['__proto__', 'constructor', '__pro\u200eto__']);
      return { kind: 'unsafe-key', input: text.replace(/^\{/, `{"${key}":{"polluted":true},`) };
    }
    case 2:
      return { kind: 'deep-text', input: `${'['.repeat(rng.pick([33, 5_000]))}${']'.repeat(10)}` };
    case 3:
      return { kind: 'bom-and-padding', input: `\ufeff  ${text}\n\n` };
    case 4: {
      const at = rng.int(0, text.length);
      return {
        kind: 'garbage',
        input: `${text.slice(0, at)}${rng.pick(['}', ',', '"', '\\', 'NaN'])}${text.slice(at)}`,
      };
    }
    default:
      return {
        kind: 'oversized',
        input: `${text.slice(0, -1)},"pad":"${'p'.repeat(DEFAULT_UNTRUSTED_BLUEPRINT_LIMITS.maxBytes)}"}`,
      };
  }
}

/** The reproducible corpus: same seed, same inputs, in the same order. */
function corpus(seed: string, iterations: number): FuzzInput[] {
  const rng = createRng(seed);
  const inputs: FuzzInput[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const caseRng = rng.fork(`case-${i}`);
    const text = caseRng.pick(CATALOG);
    if (caseRng.chance(0.2)) {
      inputs.push(mutateText(text, caseRng));
      continue;
    }
    const tree = JSON.parse(text) as Json;
    const labels: string[] = [];
    const count = caseRng.int(1, 3);
    for (let m = 0; m < count; m += 1) labels.push(mutateTree(tree, caseRng));
    // Half the cases arrive as text (links, files), half as parsed data (postMessage).
    inputs.push({
      kind: labels.join('+'),
      input: caseRng.chance(0.5) ? JSON.stringify(tree) : tree,
    });
  }
  return inputs;
}

function strings(node: unknown, out: string[] = []): string[] {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const item of node) strings(item, out);
  else if (node && typeof node === 'object') {
    for (const [key, value] of Object.entries(node)) {
      out.push(key);
      strings(value, out);
    }
  }
  return out;
}

/** The oracle: a valid blueprint, or well-formed typed issues. Returns the outcome label. */
function check(result: UntrustedBlueprintResult, label: string): string {
  if (result.success) {
    expect(result.issues, label).toEqual([]);
    // What the loader accepts is a real blueprint: it survives a JSON round trip and the schema.
    expect(() => parseBlueprint(JSON.parse(JSON.stringify(result.blueprint))), label).not.toThrow();
    for (const text of strings(result.blueprint))
      expect(CONTROL_OR_BIDI.test(text), label).toBe(false);
    return 'ok';
  }
  expect(result.blueprint, label).toBeNull();
  expect(result.issues.length, label).toBeGreaterThan(0);
  for (const issue of result.issues) {
    expect(ISSUE_CODES, label).toContain(issue.code);
    expect(Array.isArray(issue.path), label).toBe(true);
    for (const part of issue.path) expect(['string', 'number'], label).toContain(typeof part);
    expect(issue.message.length, label).toBeGreaterThan(0);
    expect(issue.fix.length, label).toBeGreaterThan(0);
    expect(issue.message, `${label}: swallowed internal error`).not.toBe(CATCH_ALL);
  }
  return result.issues[0]!.code;
}

describe('untrusted loader fuzzing', () => {
  it('fuzzes from the 40 catalog blueprints', () => {
    expect(CATALOG.length).toBeGreaterThanOrEqual(40);
  });

  it('builds the same corpus from the same seed', () => {
    const fingerprint = (inputs: FuzzInput[]) =>
      hashString(
        inputs
          .map(
            (item) =>
              `${item.kind}:${typeof item.input === 'string' ? item.input : JSON.stringify(item.input)}`
          )
          .join('\n')
      );
    expect(fingerprint(corpus(SEED, 200))).toBe(fingerprint(corpus(SEED, 200)));
    expect(fingerprint(corpus(SEED, 200))).not.toBe(fingerprint(corpus(`${SEED}-other`, 200)));
  });

  it(`returns a valid blueprint or typed issues for ${ITERATIONS} mutated inputs, each within ${PER_INPUT_MS} ms`, () => {
    const inputs = corpus(SEED, ITERATIONS);
    expect(inputs).toHaveLength(ITERATIONS);
    const outcomes = new Map<string, number>();
    let slowest = 0;
    for (const [index, { kind, input }] of inputs.entries()) {
      const label = `case ${index} (${kind})`;
      const started = performance.now();
      let result: UntrustedBlueprintResult | undefined;
      expect(() => {
        result = loadUntrustedBlueprint(input);
      }, label).not.toThrow();
      const elapsed = performance.now() - started;
      slowest = Math.max(slowest, elapsed);
      expect(elapsed, `${label} took ${elapsed.toFixed(1)} ms`).toBeLessThan(PER_INPUT_MS);
      const outcome = check(result!, label);
      outcomes.set(outcome, (outcomes.get(outcome) ?? 0) + 1);
    }
    // The corpus reaches both sides and every defense, not just one easy rejection.
    for (const expected of [
      'ok',
      'invalid-blueprint',
      'invalid-json',
      'too-large',
      'too-deep',
      'too-many',
      'unsafe-key',
    ]) {
      expect(
        outcomes.get(expected) ?? 0,
        `outcome ${expected} in ${JSON.stringify([...outcomes])}`
      ).toBeGreaterThan(0);
    }
    expect(slowest).toBeLessThan(PER_INPUT_MS);
  }, 180_000);

  it('gives the same result for the same input every time', () => {
    for (const { kind, input } of corpus(SEED, 150)) {
      const first = loadUntrustedBlueprint(structuredClone(input));
      const second = loadUntrustedBlueprint(structuredClone(input));
      expect(second, kind).toEqual(first);
    }
  });

  it('strips control and bidi characters instead of rejecting otherwise valid text', () => {
    const raw = JSON.parse(CATALOG[0]!) as { name: string; description?: string };
    const result = loadUntrustedBlueprint({
      ...raw,
      name: `Ac\u202eme\u0000 ${raw.name}`,
      description: 'Line\u2066 one',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.blueprint.name).toBe(`Acme ${raw.name}`);
      expect(result.blueprint.description).toBe('Line one');
    }
  });
});

/**
 * The same mutators over the content-kind fixtures (deck, page, doc) plus a
 * few catalog apps, through `loadUntrustedDocument`. Accepted documents must
 * parse again, and keep no control or bidi character except a newline or tab
 * in a multiline field.
 */
const KIND_FIXTURES = ['intro.deck.json', 'landing.page.json', 'quarterly-report.doc.json'].map(
  (name) => readFileSync(join(ROOT, 'packages/blueprint/tests/fixtures/kinds', name), 'utf8')
);
const KIND_ITERATIONS = 600;
const CONTROL_OR_BIDI_EXCEPT_NL_TAB =
  // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to detect them.
  /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069\ufeff]/;

function kindCorpus(seed: string, iterations: number): FuzzInput[] {
  const rng = createRng(seed);
  const sources = [...KIND_FIXTURES, ...CATALOG.slice(0, 3)];
  const inputs: FuzzInput[] = [];
  for (let i = 0; i < iterations; i += 1) {
    const caseRng = rng.fork(`kind-case-${i}`);
    const text = caseRng.pick(sources);
    if (caseRng.chance(0.2)) {
      inputs.push(mutateText(text, caseRng));
      continue;
    }
    const tree = JSON.parse(text) as Json;
    const labels: string[] = [];
    for (let m = 0; m < caseRng.int(1, 3); m += 1) labels.push(mutateTree(tree, caseRng));
    inputs.push({
      kind: labels.join('+'),
      input: caseRng.chance(0.5) ? JSON.stringify(tree) : tree,
    });
  }
  return inputs;
}

describe('untrusted document loader fuzzing (all kinds)', () => {
  it(`returns a valid document or typed issues for ${KIND_ITERATIONS} mutated deck, page, doc and app inputs`, async () => {
    const outcomes = new Map<string, number>();
    const kinds = new Set<string>();
    for (const [index, { kind, input }] of kindCorpus(`${SEED}-kinds`, KIND_ITERATIONS).entries()) {
      const label = `kind case ${index} (${kind})`;
      const started = performance.now();
      const result = await loadUntrustedDocument(input);
      const elapsed = performance.now() - started;
      expect(elapsed, `${label} took ${elapsed.toFixed(1)} ms`).toBeLessThan(PER_INPUT_MS);
      if (result.success) {
        expect(result.issues, label).toEqual([]);
        const again = await safeParseAnyBlueprint(JSON.parse(JSON.stringify(result.blueprint)));
        expect(again.success, label).toBe(true);
        for (const text of strings(result.blueprint)) {
          expect(CONTROL_OR_BIDI_EXCEPT_NL_TAB.test(text), label).toBe(false);
        }
        kinds.add('kind' in result.blueprint ? result.blueprint.kind : 'app');
        outcomes.set('ok', (outcomes.get('ok') ?? 0) + 1);
        continue;
      }
      expect(result.blueprint, label).toBeNull();
      expect(result.issues.length, label).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(ISSUE_CODES, label).toContain(issue.code);
        for (const part of issue.path) expect(['string', 'number'], label).toContain(typeof part);
        expect(issue.message, `${label}: swallowed internal error`).not.toMatch(
          /could not be safely loaded/
        );
      }
      const code = result.issues[0]?.code ?? 'none';
      outcomes.set(code, (outcomes.get(code) ?? 0) + 1);
    }
    // Every kind survives some mutations, and the defenses are all reached.
    for (const kind of ['app', 'deck', 'page', 'doc'])
      expect(kinds, `accepted ${kind}`).toContain(kind);
    for (const expected of ['ok', 'invalid-blueprint', 'invalid-json', 'too-deep', 'unsafe-key']) {
      expect(
        outcomes.get(expected) ?? 0,
        `outcome ${expected} in ${JSON.stringify([...outcomes])}`
      ).toBeGreaterThan(0);
    }
  }, 180_000);
});
