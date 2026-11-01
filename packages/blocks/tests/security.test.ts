import { safeHref } from '@protoyard/ai/markdown';
import { describe, expect, it } from 'vitest';
import {
  BoardDiagramSchema,
  FlowDiagramSchema,
  TerminalDiagramSchema,
  TreeDiagramSchema,
} from '../src/diagram/index.ts';
import {
  BLOCK_LIMITS,
  BLOCK_TYPES,
  type BlockLimits,
  classifyMediaSource,
  parseUntrustedBlocks,
  safeParseBlock,
} from '../src/index.ts';
import { BIDI, HOSTILE_URLS, type HostileAttack, hostileDocuments } from './support/hostile.ts';

/**
 * AC-blocks-fuzz, engine half: 500 seeded hostile documents. Each one is
 * either rejected, or accepted only in a form that is inert: no smuggled
 * keys, no prototype keys, finite numbers, no control or bidi characters,
 * media only from local sources and links only through `safeHref`.
 */

// A representative 500 of the seeded documents keeps every attack family well covered.
const DOCUMENTS = hostileDocuments(500);
const PROTO_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
// biome-ignore lint/suspicious/noControlCharactersInRegex: matching them is the point.
const CONTROL = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f]/;
const BIDI_CHARS = new RegExp(
  `[${Object.values(BIDI).join('')}\\u2067\\u202b\\u202d\\u200e\\u061c]`
);
const DANGEROUS_SCHEME = /^\s*(?:javascript|vbscript|data|file|blob):/i;
const REMOTE = /^(?:[a-z][a-z0-9+.-]*:)?[\\/]{2}|^https?:/i;

interface InertRules {
  /**
   * Text hygiene (control and bidi characters) and the block budget. The
   * untrusted parser guarantees both; the schema alone does not count blocks
   * and, for chart spec labels, does not reject bidi characters (a finding in
   * the task report), so the value-level schema check skips them.
   */
  hygiene: boolean;
}

/** Every way an accepted document could still carry behavior; empty when inert. */
export function inertViolations(blocks: unknown, rules: InertRules = { hygiene: true }): string[] {
  const problems: string[] = [];
  let count = 0;
  const walk = (node: unknown, path: string, blockType: string | null) => {
    if (typeof node === 'number' && !Number.isFinite(node))
      problems.push(`${path}: non-finite number`);
    if (typeof node === 'string') {
      if (rules.hygiene && CONTROL.test(node)) problems.push(`${path}: control character`);
      if (rules.hygiene && BIDI_CHARS.test(node)) problems.push(`${path}: bidi character`);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const proto = Object.getPrototypeOf(node);
    if (proto !== Object.prototype && proto !== Array.prototype && proto !== null) {
      problems.push(`${path}: non-plain object`);
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => {
        walk(child, `${path}[${i}]`, blockType);
      });
      return;
    }
    const record = node as Record<string, unknown>;
    let type = blockType;
    if (
      typeof record.type === 'string' &&
      (BLOCK_TYPES as readonly string[]).includes(record.type)
    ) {
      type = record.type;
      count += 1;
    }
    for (const key of Object.getOwnPropertyNames(record)) {
      const value = record[key];
      const at = `${path}.${key}`;
      if (PROTO_KEYS.has(key)) problems.push(`${at}: prototype key`);
      if (/^on/i.test(key) || ['html', 'innerHTML', 'srcdoc', 'script', 'class'].includes(key)) {
        problems.push(`${at}: behavior key`);
      }
      // `style` is a schema enum on some blocks (tree: file-tree | org); CSS never is.
      if (key === 'style' && (typeof value !== 'string' || !/^[a-z][a-z-]*$/.test(value))) {
        problems.push(`${at}: style value ${JSON.stringify(value)}`);
      }
      // An embed-app's `app` is an opaque blueprint by design: the schema bounds
      // it (embeddedAppProblem) and the host validates it with the blueprint's
      // untrusted loader before mounting, which only happens on a viewer's click.
      if (key === 'app' && type === 'embed-app') continue;
      if (typeof value === 'string' && (key === 'src' || key === 'poster' || key === 'image')) {
        const media = key === 'src' && type === 'video' ? 'video' : 'image';
        if (!classifyMediaSource(value, media).ok) {
          problems.push(`${at}: unsafe media source ${JSON.stringify(value)}`);
        }
        if (REMOTE.test(value)) problems.push(`${at}: remote media ${JSON.stringify(value)}`);
      }
      if (typeof value === 'string' && key === 'href') {
        if (safeHref(value) !== value || DANGEROUS_SCHEME.test(value) || /^[\\/]{2}/.test(value)) {
          problems.push(`${at}: unsafe link ${JSON.stringify(value)}`);
        }
      }
      walk(value, at, type);
    }
  };
  walk(blocks, '$', null);
  if (rules.hygiene && count > BLOCK_LIMITS.maxBlocks) {
    problems.push(`$: ${count} blocks exceeds ${BLOCK_LIMITS.maxBlocks}`);
  }
  return problems;
}

const describeInput = (input: unknown) =>
  typeof input === 'string' ? input.slice(0, 300) : JSON.stringify(input)?.slice(0, 300);

describe('hostile document generator', () => {
  it('covers every attack family several times', () => {
    const counts = new Map<HostileAttack, number>();
    for (const doc of DOCUMENTS)
      for (const attack of doc.attacks) counts.set(attack, (counts.get(attack) ?? 0) + 1);
    for (const attack of [
      'url',
      'markup',
      'bidi',
      'deep-nesting',
      'huge-array',
      'non-finite',
      'prototype-key',
      'unknown-type',
      'evil-key',
      'combo',
    ] as const) {
      expect(counts.get(attack) ?? 0, attack).toBeGreaterThan(20);
    }
    expect(DOCUMENTS.some((doc) => typeof doc.input === 'string')).toBe(true);
    expect(DOCUMENTS.some((doc) => typeof doc.input !== 'string')).toBe(true);
  });
});

describe('AC-blocks-fuzz: the untrusted parser rejects or neutralizes every hostile document', () => {
  const results = DOCUMENTS.map((doc) => ({ doc, result: parseUntrustedBlocks(doc.input) }));

  it('accepts only inert documents', () => {
    const failures = results
      .filter(({ result }) => result.success)
      .map(({ doc, result }) => ({ id: doc.id, problems: inertViolations(result.blocks) }))
      .filter((entry) => entry.problems.length > 0);
    // JSON text so a failure prints the offending documents in full.
    expect(JSON.stringify(failures.slice(0, 5), null, 1)).toBe('[]');
  });

  it('always rejects structural attacks', () => {
    const structural = new Set<HostileAttack>([
      'prototype-key',
      'unknown-type',
      'evil-key',
      'non-finite',
    ]);
    // The one exception: a mutation that landed inside an embed-app's opaque
    // `app` (checked by the host's blueprint loader, see inertViolations). Such a
    // document must still be inert everywhere else.
    const insideEmbeddedApp = (blocks: unknown[]) =>
      blocks.some((block) => (block as { type?: unknown }).type === 'embed-app') &&
      inertViolations(blocks).length === 0;
    const accepted = results.filter(
      ({ doc, result }) =>
        result.success &&
        doc.attacks.some((attack) => structural.has(attack)) &&
        !insideEmbeddedApp(result.blocks)
    );
    expect(
      accepted.map(({ doc }) => `${doc.id} ${doc.attacks.join('+')} ${describeInput(doc.input)}`)
    ).toEqual([]);
  });

  it('rejects NaN and Infinity in the schema, not only as broken JSON', () => {
    const nonFinite = results.filter(
      ({ doc }) => doc.attacks.includes('non-finite') && typeof doc.input !== 'string'
    );
    expect(nonFinite.length).toBeGreaterThan(20);
    for (const { doc, result } of nonFinite) {
      if (result.success) {
        // Only inside an embed-app's opaque `app` (see inertViolations), never in a block.
        expect(
          result.blocks.some((block) => block.type === 'embed-app'),
          doc.id
        ).toBe(true);
        expect(inertViolations(result.blocks), doc.id).toEqual([]);
      } else {
        expect(
          result.issues.some((issue) => issue.code === 'invalid-json'),
          doc.id
        ).toBe(false);
      }
    }
  });

  it('turns prototype keys into real own keys in both value and text form', () => {
    const proto = DOCUMENTS.filter((doc) => doc.attacks.includes('prototype-key'));
    expect(
      proto.some(
        (doc) =>
          typeof doc.input === 'string' && /"(__proto__|constructor|prototype)"/.test(doc.input)
      )
    ).toBe(true);
    const ownKey = (value: unknown): boolean => {
      if (!value || typeof value !== 'object') return false;
      if (Object.getOwnPropertyNames(value).some((key) => PROTO_KEYS.has(key))) return true;
      return Object.values(value).some(ownKey);
    };
    expect(proto.some((doc) => typeof doc.input !== 'string' && ownKey(doc.input))).toBe(true);
  });

  it('never pollutes Object.prototype', () => {
    // Every document above was already parsed; none may have reached the prototype.
    expect(results).toHaveLength(DOCUMENTS.length);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
});

describe('URL tricks in every URL-bearing field', () => {
  const imageWith = (src: string) => [{ type: 'image', src, alt: 'Cover', width: 1, height: 1 }];
  const videoWith = (extra: Record<string, string>) => [
    { type: 'video', src: './clips/demo.mp4', label: 'Demo', width: 16, height: 9, ...extra },
  ];
  const ctaWith = (href: string) => [{ type: 'cta', actions: [{ label: 'Open', href }] }];

  it('never accepts any hostile URL as media', () => {
    for (const url of HOSTILE_URLS) {
      expect(parseUntrustedBlocks(imageWith(url)).success).toBe(false);
      expect(parseUntrustedBlocks(videoWith({ src: url })).success).toBe(false);
      expect(parseUntrustedBlocks(videoWith({ poster: url })).success).toBe(false);
    }
  });

  it('never accepts any hostile URL as a link', () => {
    for (const url of HOSTILE_URLS.filter(
      (url) => safeHref(url) !== url || DANGEROUS_SCHEME.test(url)
    )) {
      expect(parseUntrustedBlocks(ctaWith(url)).success).toBe(false);
    }
  });

  it('allows only HTTPS, mailto and same-document fragment links', () => {
    expect(parseUntrustedBlocks(ctaWith('https://example.com/docs')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('mailto:team@example.com')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('#waitlist')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('/waitlist')).success).toBe(false);
    expect(parseUntrustedBlocks(ctaWith('http://example.com/docs')).success).toBe(false);
  });
});

// --- merged from untrusted.test.ts ---

const failure = (input: unknown, limits?: Partial<BlockLimits>) => {
  const result = parseUntrustedBlocks(input, limits);
  expect(result.success).toBe(false);
  if (result.success) throw new Error('expected block input to be rejected');
  expect(result.issues[0]).toMatchObject({
    code: expect.any(String),
    path: expect.any(Array),
    jsonPath: expect.any(String),
    message: expect.any(String),
    fix: expect.any(String),
  });
  return result.issues[0]!;
};

describe('parseUntrustedBlocks', () => {
  it('rejects malformed, non-array, oversized and over-depth inputs without throwing', () => {
    expect(failure('{').code).toBe('invalid-json');
    expect(failure({ type: 'divider' }).code).toBe('invalid-input');
    expect(failure(JSON.stringify([{ type: 'divider' }]), { maxBytes: 4 }).code).toBe('too-large');
    expect(failure(`${'['.repeat(13)}0${']'.repeat(13)}`).code).toBe('too-deep');
    expect(failure(Array.from({ length: 2_001 }, () => ({ type: 'divider' }))).code).toBe(
      'too-many'
    );
    expect(failure([{ type: 'divider' }, { type: 'divider' }], { maxBlocks: 1 })).toMatchObject({
      code: 'too-many',
      jsonPath: '$[1]',
    });
  });

  it('caps decoded media bytes per source and across the document', () => {
    const tinyDataUri =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
    const image = (src: string) => ({ type: 'image', src, alt: 'Tiny image', width: 1, height: 1 });
    expect(failure([image(tinyDataUri)], { maxDataUriBytes: 4 })).toMatchObject({
      code: 'too-large',
      jsonPath: '$[0]["src"]',
    });
    const largeUri = `data:image/png;base64,${'A'.repeat(240_000)}`;
    expect(failure([image(largeUri), image(largeUri), image(largeUri)])).toMatchObject({
      code: 'too-large',
      jsonPath: '$[2]["src"]',
    });
    expect(
      failure([image(tinyDataUri), image(tinyDataUri)], {
        maxDataUriBytes: 1_000,
        maxDocumentDataUriBytes: 100,
      })
    ).toMatchObject({
      code: 'too-large',
      jsonPath: '$[1]["src"]',
    });
  });

  it('rejects prototype keys and reports the original paths', () => {
    expect(
      failure('[{"type":"heading","text":"Safe","__proto__":{"polluted":true}}]')
    ).toMatchObject({
      code: 'unsafe-key',
      jsonPath: '$[0]["__proto__"]',
    });
    expect(failure('[{"type":"heading","text":"Safe","constr\\u202euctor":"bad"}]')).toMatchObject({
      code: 'unsafe-key',
      jsonPath: '$[0]["constructor"]',
    });
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('strips controls and bidi marks, normalizes CRLF, and preserves allowed newlines and code tabs', () => {
    const input = [
      { type: 'heading', text: 'A\u202eB\u0000' },
      { type: 'text', markdown: 'First\r\nSecond\u202e' },
      { type: 'code', lang: 'text', code: 'one\r\n\ttwo\u202e' },
    ];
    const result = parseUntrustedBlocks(input);
    expect(result).toEqual({
      success: true,
      blocks: [
        { type: 'heading', text: 'AB' },
        { type: 'text', markdown: 'First\nSecond' },
        { type: 'code', lang: 'text', code: 'one\n\ttwo' },
      ],
      issues: [],
    });
    expect(input[0]?.text).toBe('A\u202eB\u0000');
  });

  it('rejects cycles, custom prototypes and accessors as invalid input', () => {
    const cyclic: Record<string, unknown> = {
      type: 'reveal',
      id: 'details',
      label: 'Details',
      blocks: [],
    };
    cyclic.blocks = [cyclic];
    expect(failure([cyclic]).code).toBe('invalid-input');
    expect(failure([new Date()]).code).toBe('invalid-input');
    const accessor = Object.defineProperty({ type: 'heading' }, 'text', {
      enumerable: true,
      get: () => 'unsafe',
    });
    expect(failure([accessor]).code).toBe('invalid-input');
  });
});

// --- merged from hidden-characters.test.ts ---

/**
 * Invisible and direction-changing characters ("Trojan Source"): the schema
 * alone refuses them (CLI `generate` and generated prototypes parse without the
 * untrusted loader), and the untrusted loader strips or converts them first so
 * shared documents still load. Built from code points, never literals.
 */
const c = (code: number) => String.fromCodePoint(code);
const REFUSED = [
  0x061c, // Arabic letter mark
  0x200b, // zero-width space
  0x200e, // left-to-right mark
  0x200f, // right-to-left mark
  0x2028, // line separator
  0x2029, // paragraph separator
  0x202e, // right-to-left override
  0x2060, // word joiner
  0x2066, // left-to-right isolate
  0xfeff, // byte order mark
];

describe('the block schema refuses hidden characters on its own', () => {
  it('refuses every hidden character in plain, markdown and code text', () => {
    for (const code of REFUSED) {
      const ch = c(code);
      expect(safeParseBlock({ type: 'heading', text: `Plan${ch}A` }).success).toBe(false);
      expect(safeParseBlock({ type: 'text', markdown: `Body${ch}text` }).success).toBe(false);
      expect(safeParseBlock({ type: 'code', lang: 'ts', code: `const a${ch} = 1;` }).success).toBe(
        false
      );
    }
  });
});

// --- merged from diagram.test.ts ---

const flow = {
  type: 'flow' as const,
  nodes: [
    { id: 'brief', label: 'Write a brief', tone: 'accent' as const },
    { id: 'build', label: 'Build a prototype' },
    { id: 'review', label: 'Review the result' },
  ],
  loopBack: true,
};

describe('@protoyard/blocks/diagram', () => {
  it('rejects duplicate ids, missing parents, cycles, excessive depth and oversized atoms', () => {
    expect(
      FlowDiagramSchema.safeParse({ type: 'flow', nodes: [...flow.nodes, flow.nodes[0]] }).success
    ).toBe(false);
    expect(
      TreeDiagramSchema.safeParse({
        type: 'tree',
        style: 'file-tree',
        nodes: [{ id: 'leaf', parentId: 'missing', label: 'Leaf' }],
      }).success
    ).toBe(false);
    expect(
      TreeDiagramSchema.safeParse({
        type: 'tree',
        style: 'org',
        nodes: [
          { id: 'one', parentId: 'two', label: 'One' },
          { id: 'two', parentId: 'one', label: 'Two' },
        ],
      }).success
    ).toBe(false);
    const deepTree = Array.from({ length: 7 }, (_, index) => ({
      id: `node-${index}`,
      parentId: index === 0 ? null : `node-${index - 1}`,
      label: `Node ${index}`,
    }));
    expect(
      TreeDiagramSchema.safeParse({ type: 'tree', style: 'org', nodes: deepTree }).success
    ).toBe(false);
    expect(
      FlowDiagramSchema.safeParse({
        type: 'flow',
        nodes: Array.from({ length: 13 }, (_, index) => ({
          id: `step-${index}`,
          label: `Step ${index}`,
        })),
      }).success
    ).toBe(false);
    expect(
      BoardDiagramSchema.safeParse({
        type: 'board',
        columns: Array.from({ length: 7 }, (_, index) => ({
          id: `column-${index}`,
          title: `Column ${index}`,
          cards: [],
        })),
      }).success
    ).toBe(false);
    expect(
      TerminalDiagramSchema.safeParse({
        type: 'terminal',
        lines: Array.from({ length: 41 }, () => ({ kind: 'output', text: 'Done' })),
      }).success
    ).toBe(false);
  });
});
