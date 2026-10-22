import { createRng, type Rng } from '@protoyard/core';
import { MINIMAL_EXAMPLES } from '../../src/catalog/index.ts';

/**
 * Seeded hostile block documents for the security fuzz tests (engine and
 * renderer). Deterministic: `createRng` only, never `Math.random`, so a
 * failure always reproduces from its document id. Control and bidi
 * characters are built with `String.fromCharCode`, never written literally.
 */

const ch = (...codes: number[]) => String.fromCharCode(...codes);
/** U+202E RIGHT-TO-LEFT OVERRIDE and friends, used in "Trojan Source" spoofing. */
export const BIDI = {
  rlo: ch(0x202e),
  lre: ch(0x202a),
  pdf: ch(0x202c),
  lri: ch(0x2066),
  pdi: ch(0x2069),
  rlm: ch(0x200f),
  bom: ch(0xfeff),
};
const NUL = ch(0x00);
const TAB = ch(0x09);
const LF = ch(0x0a);

/** URL tricks: the `safeHref` cases (packages/ai/src/markdown.ts) plus media and scheme variants. */
export const HOSTILE_URLS: readonly string[] = [
  'javascript:alert(1)',
  'JaVaScRiPt:alert(1)',
  ' javascript:alert(1)',
  `java${TAB}script:alert(1)`,
  `java${LF}script:alert(1)`,
  `${NUL}javascript:alert(1)`,
  'javascript&colon;alert(1)',
  'vbscript:msgbox(1)',
  'VBScript:msgbox(1)',
  'data:text/html,<script>alert(1)</script>',
  'data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==',
  'data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+PC9zdmc+',
  'data:image/svg+xml,<svg onload=alert(1)>',
  'data:application/javascript,alert(1)',
  '//evil.example.com/x.png',
  '///evil.example.com/x.png',
  '\\\\evil.example.com\\x.png',
  '/\\evil.example.com/x.png',
  '\\/evil.example.com/x.png',
  'https://evil.example.com/x.png',
  'http://evil.example.com/x.png',
  'HTTPS://EVIL.EXAMPLE.COM/X.PNG',
  'https://user:pass@evil.example.com/',
  'file:///etc/passwd',
  'blob:https://evil.example.com/1',
  'ftp://evil.example.com/x.png',
  'assets/../../secret.png',
  '../secret.png',
  'avatar:../../x',
  'avatar:av-999',
  `assets/${BIDI.rlo}gnp.exe`,
  `https://exa${BIDI.rlo}mple.com`,
];

/** Markup, template and markdown payloads that must stay text if accepted. */
export const HOSTILE_MARKUP: readonly string[] = [
  '<script>alert(1)</script>',
  '<img src=x onerror=alert(1)>',
  '<svg onload=alert(1)>',
  '"><svg/onload=alert(1)>',
  "'><iframe src=javascript:alert(1)>",
  '<a href="javascript:alert(1)">click</a>',
  '<style>body{background:url(javascript:alert(1))}</style>',
  '<object data="https://evil.example.com/x"></object>',
  '<base href="https://evil.example.com/">',
  '<meta http-equiv="refresh" content="0;url=https://evil.example.com">',
  '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>',
  '{@html "<b>x</b>"}',
  // A template literal payload, as plain text.
  // biome-ignore lint/suspicious/noTemplateCurlyInString: the literal `${…}` is the payload.
  '${alert(1)}',
  '{{constructor.constructor("alert(1)")()}}',
  '[click](javascript:alert(1))',
  '[click](vbscript:msgbox(1))',
  '[click](//evil.example.com)',
  '![x](https://evil.example.com/p.png)',
  '![x](data:image/svg+xml;base64,PHN2Zz4=)',
  '<https://evil.example.com>',
  '[x]: javascript:alert(1)\n\n[ref][x]',
  'expression(alert(1))',
  `safe ${BIDI.rlo}txt.exe${BIDI.pdf}`,
  `${BIDI.lri}admin${BIDI.pdi} ${BIDI.lre}x${BIDI.pdf}`,
  `${BIDI.bom}zero${BIDI.rlm}width`,
  `ctrl${NUL}char`,
];

/** Keys that try to smuggle behavior into a block. */
const EVIL_KEYS: readonly [string, unknown][] = [
  ['onclick', 'alert(1)'],
  ['onload', 'alert(1)'],
  ['html', '<script>alert(1)</script>'],
  ['innerHTML', '<img src=x onerror=alert(1)>'],
  ['style', 'background:url(javascript:alert(1))'],
  ['class', 'fixed inset-0 z-[9999]'],
  ['srcdoc', '<script>alert(1)</script>'],
  ['script', 'alert(1)'],
];

const PROTO_KEYS = ['__proto__', 'constructor', 'prototype'] as const;
const UNKNOWN_TYPES = ['script', 'html', 'iframe', 'raw', 'svg', 'style', 'object', '__proto__'];

export type HostileAttack =
  | 'url'
  | 'markup'
  | 'bidi'
  | 'deep-nesting'
  | 'huge-array'
  | 'non-finite'
  | 'prototype-key'
  | 'unknown-type'
  | 'evil-key'
  | 'combo';

export interface HostileDocument {
  /** Stable id: `seed#index`. */
  id: string;
  attacks: HostileAttack[];
  /** A block list as a value, or as JSON text (prototype keys survive only in text). */
  input: unknown;
}

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = (string | number)[];

const EXAMPLE_TYPES = Object.keys(MINIMAL_EXAMPLES).sort() as (keyof typeof MINIMAL_EXAMPLES)[];

function clone<T>(value: T): T {
  return structuredClone(value);
}

function leaves(
  value: unknown,
  predicate: (leaf: unknown, key: string | number) => boolean
): Path[] {
  const out: Path[] = [];
  const walk = (node: unknown, path: Path) => {
    if (Array.isArray(node)) {
      node.forEach((child, i) => {
        walk(child, [...path, i]);
      });
    } else if (node && typeof node === 'object') {
      for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
    } else if (path.length > 0 && predicate(node, path.at(-1) as string | number)) out.push(path);
  };
  walk(value, []);
  return out;
}

function containers(value: unknown, kind: 'array' | 'object'): Path[] {
  const out: Path[] = [];
  const walk = (node: unknown, path: Path) => {
    if (Array.isArray(node)) {
      if (kind === 'array') out.push(path);
      node.forEach((child, i) => {
        walk(child, [...path, i]);
      });
    } else if (node && typeof node === 'object') {
      if (kind === 'object') out.push(path);
      for (const [key, child] of Object.entries(node)) walk(child, [...path, key]);
    }
  };
  walk(value, []);
  return out;
}

function getAt(root: unknown, path: Path): unknown {
  return path.reduce<unknown>((node, key) => (node as Record<string | number, unknown>)[key], root);
}

function setAt(root: unknown, path: Path, value: unknown): void {
  const parent = getAt(root, path.slice(0, -1)) as Record<string | number, unknown>;
  parent[path.at(-1) as string | number] = value;
}

const URL_KEYS = new Set(['src', 'poster', 'image', 'href', 'url', 'avatar']);

function mutate(
  rng: Rng,
  blocks: Json[],
  attack: Exclude<HostileAttack, 'combo'>
): { text?: boolean } {
  const index = rng.int(0, blocks.length - 1);
  const block = blocks[index] as Json;
  switch (attack) {
    case 'url': {
      const preferred = leaves(
        block,
        (leaf, key) => typeof leaf === 'string' && URL_KEYS.has(String(key))
      );
      const any = leaves(block, (leaf) => typeof leaf === 'string');
      const targets = preferred.length > 0 && rng.chance(0.7) ? preferred : any;
      const path = targets.length > 0 ? rng.pick(targets) : null;
      const url = rng.pick(HOSTILE_URLS);
      if (path) setAt(block, path, url);
      else (block as Record<string, Json>).href = url;
      // Also try the URL keys a block does not declare.
      if (rng.chance(0.3))
        (block as Record<string, Json>)[rng.pick([...URL_KEYS])] = rng.pick(HOSTILE_URLS);
      return {};
    }
    case 'markup':
    case 'bidi': {
      const strings = leaves(block, (leaf, key) => typeof leaf === 'string' && key !== 'type');
      const payload =
        attack === 'markup'
          ? rng.pick(HOSTILE_MARKUP)
          : `${rng.pick(['', 'x'])}${rng.pick(Object.values(BIDI))}${rng.pick(['admin', 'txt.exe', 'gnp'])}`;
      const path = strings.length > 0 ? rng.pick(strings) : null;
      if (path) setAt(block, path, rng.chance(0.5) ? payload : `${getAt(block, path)} ${payload}`);
      return {};
    }
    case 'deep-nesting': {
      let deep: Json = rng.pick(['leaf', 1, true, null] as Json[]);
      const depth = rng.int(20, 400);
      for (let i = 0; i < depth; i += 1) deep = rng.chance(0.5) ? [deep] : { nested: deep };
      if (rng.chance(0.5)) {
        (block as Record<string, Json>).extra = deep;
      } else {
        // Nest real containers: columns inside columns past the container depth.
        let nested: Json = clone(block);
        for (let i = 0; i < rng.int(4, 40); i += 1) {
          nested = { type: 'columns', columns: [{ blocks: [nested] }, { blocks: [] }] } as Json;
        }
        blocks[index] = nested;
      }
      return {};
    }
    case 'huge-array': {
      const arrays = containers(block, 'array');
      const size = rng.pick([2_001, 2_500, 5_000]);
      if (arrays.length > 0 && rng.chance(0.6)) {
        const path = rng.pick(arrays);
        const array = getAt(block, path) as Json[];
        const sample = array[0] ?? 'x';
        setAt(
          block,
          path,
          Array.from({ length: size }, () => clone(sample))
        );
      } else {
        // A loop, not push(...spread): spreading 120,000 arguments overflows the stack.
        for (let i = 0; i < size; i += 1) blocks.push(clone(block));
      }
      return {};
    }
    case 'non-finite': {
      const numbers = leaves(block, (leaf) => typeof leaf === 'number');
      const value = rng.pick([
        Number.NaN,
        Number.POSITIVE_INFINITY,
        Number.NEGATIVE_INFINITY,
        Number.MAX_VALUE * 10,
      ]);
      const path = numbers.length > 0 ? rng.pick(numbers) : null;
      if (path) setAt(block, path, value as Json);
      else (block as Record<string, Json>).step = value as Json;
      return {};
    }
    case 'prototype-key': {
      const objects = containers(block, 'object');
      const target = getAt(block, rng.pick(objects.length > 0 ? objects : [[]])) as Record<
        string,
        Json
      >;
      const key = rng.pick(PROTO_KEYS);
      const payload: Json = rng.pick([
        { polluted: true },
        { toString: 'x' },
        { prototype: { polluted: true } },
      ] as Json[]);
      // A JSON text keeps `__proto__` as an own key, as a hostile file would.
      target[`@@${key}@@`] = payload;
      return { text: true };
    }
    case 'unknown-type': {
      (block as Record<string, Json>).type = rng.pick(UNKNOWN_TYPES);
      if (rng.chance(0.5)) (block as Record<string, Json>).html = rng.pick(HOSTILE_MARKUP);
      return {};
    }
    case 'evil-key': {
      const objects = containers(block, 'object');
      const target = getAt(block, rng.pick(objects.length > 0 ? objects : [[]])) as Record<
        string,
        Json
      >;
      const [key, value] = rng.pick(EVIL_KEYS);
      target[key] = value as Json;
      return {};
    }
  }
}

const SINGLE_ATTACKS: Exclude<HostileAttack, 'combo'>[] = [
  'url',
  'markup',
  'bidi',
  'deep-nesting',
  'huge-array',
  'non-finite',
  'prototype-key',
  'unknown-type',
  'evil-key',
];

/** `count` hostile documents from `seed`; the same arguments always give the same documents. */
export function hostileDocuments(count = 2_000, seed = 'blocks-security-fuzz'): HostileDocument[] {
  const root = createRng(seed);
  return Array.from({ length: count }, (_, index) => {
    const rng = root.fork(`doc-${index}`);
    const blocks: Json[] = Array.from(
      { length: rng.int(1, 3) },
      () => clone(MINIMAL_EXAMPLES[rng.pick(EXAMPLE_TYPES)]) as unknown as Json
    );
    const combo = rng.chance(0.2);
    const attacks: Exclude<HostileAttack, 'combo'>[] = combo
      ? rng.sample(SINGLE_ATTACKS, rng.int(2, 3))
      : [rng.pick(SINGLE_ATTACKS)];
    let text = rng.chance(0.25);
    for (const attack of attacks) if (mutate(rng, blocks, attack).text) text = true;
    const json = JSON.stringify(blocks, (_key, value) =>
      typeof value === 'number' && !Number.isFinite(value) ? `@@${String(value)}@@` : value
    );
    let input: unknown;
    if (text) {
      // Text form: the placeholders become real prototype keys and bare NaN/Infinity tokens.
      input = json
        .replace(/"@@(__proto__|constructor|prototype)@@"/g, '"$1"')
        .replace(/"@@(NaN|Infinity|-Infinity)@@"/g, '$1');
    } else {
      input = JSON.parse(json, (key, value) => {
        if (value === '@@NaN@@') return Number.NaN;
        if (value === '@@Infinity@@') return Number.POSITIVE_INFINITY;
        if (value === '@@-Infinity@@') return Number.NEGATIVE_INFINITY;
        return key.startsWith('@@') ? undefined : value;
      });
      // Value form: define prototype keys as own properties, as JSON.parse would.
      if (attacks.includes('prototype-key')) {
        const first = (input as Record<string, unknown>[])[0] as Record<string, unknown>;
        Object.defineProperty(first, rng.pick(PROTO_KEYS), {
          value: { polluted: true },
          enumerable: true,
          configurable: true,
          writable: true,
        });
      }
    }
    return { id: `${seed}#${index}`, attacks: combo ? ['combo', ...attacks] : attacks, input };
  });
}
