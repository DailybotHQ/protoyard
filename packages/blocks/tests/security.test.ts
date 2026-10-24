import { safeHref } from '@protoyard/ai/markdown';
import { describe, expect, it } from 'vitest';
import {
  BLOCK_LIMITS,
  BLOCK_TYPES,
  classifyMediaSource,
  parseUntrustedBlocks,
  safeParseBlocks,
} from '../src/index.ts';
import { BIDI, HOSTILE_URLS, type HostileAttack, hostileDocuments } from './support/hostile.ts';

/**
 * AC-blocks-fuzz, engine half: 2,000 seeded hostile documents. Each one is
 * either rejected, or accepted only in a form that is inert: no smuggled
 * keys, no prototype keys, finite numbers, no control or bidi characters,
 * media only from local sources and links only through `safeHref`.
 */

const DOCUMENTS = hostileDocuments();
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
  it('is seeded: the same seed gives the same 2,000 documents, another seed differs', () => {
    expect(DOCUMENTS).toHaveLength(2_000);
    const again = hostileDocuments(50);
    const text = (docs: typeof DOCUMENTS) =>
      JSON.stringify(docs.map((doc) => [doc.id, doc.attacks, describeInput(doc.input)]));
    expect(text(again)).toBe(text(DOCUMENTS.slice(0, 50)));
    expect(text(hostileDocuments(50, 'another-seed'))).not.toBe(text(again));
  });

  it('covers every attack family many times', () => {
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
      expect(counts.get(attack) ?? 0, attack).toBeGreaterThan(100);
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

  it('rejects with path-addressed issues, never by throwing', () => {
    for (const { doc, result } of results) {
      if (result.success) continue;
      expect(result.issues.length, doc.id).toBeGreaterThan(0);
      for (const issue of result.issues) {
        expect(issue.jsonPath, doc.id).toMatch(/^\$/);
        expect(issue.message.length, doc.id).toBeGreaterThan(0);
      }
    }
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

  it('reaches both sides of the nesting limits with real columns, tabs and reveal', () => {
    const nesting = results.filter(
      ({ doc }) => doc.attacks.length === 1 && doc.attacks[0] === 'deep-nesting'
    );
    // Each container adds 3–4 JSON levels, so the JSON depth guard (12) usually
    // trips before the container rule (3); either one is a nesting refusal.
    const refusedForDepth = nesting.filter(
      ({ result }) =>
        !result.success &&
        result.issues.some(
          (issue) => issue.code === 'too-deep' || /nest at most/.test(issue.message)
        )
    );
    expect(refusedForDepth.length).toBeGreaterThan(50);
    // Shallow nesting stays valid and reaches the renderer.
    expect(nesting.filter(({ result }) => result.success).length).toBeGreaterThan(0);
  });

  it('rejects NaN and Infinity in the schema, not only as broken JSON', () => {
    const nonFinite = results.filter(
      ({ doc }) => doc.attacks.includes('non-finite') && typeof doc.input !== 'string'
    );
    expect(nonFinite.length).toBeGreaterThan(100);
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

  it('exercises both outcomes, so the renderer fuzz has accepted documents to draw', () => {
    const accepted = results.filter(({ result }) => result.success).length;
    expect(accepted).toBeGreaterThan(100);
    expect(results.length - accepted).toBeGreaterThan(500);
  });

  it('never pollutes Object.prototype', () => {
    // Every document above was already parsed; none may have reached the prototype.
    expect(results).toHaveLength(DOCUMENTS.length);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(Object.hasOwn(Object.prototype, 'polluted')).toBe(false);
  });
});

describe('the schema alone holds the same line for value inputs', () => {
  // A property test over every generated document: allow for a loaded machine.
  it('accepts only inert documents with safeParseBlocks', () => {
    const failures = DOCUMENTS.filter((doc) => typeof doc.input !== 'string')
      .map((doc) => ({ doc, result: safeParseBlocks(doc.input) }))
      .filter(({ result }) => result.success)
      .map(({ doc, result }) => ({
        id: doc.id,
        problems: inertViolations(result.data, { hygiene: false }),
      }))
      .filter((entry) => entry.problems.length > 0);
    expect(JSON.stringify(failures.slice(0, 5), null, 1)).toBe('[]');
  }, 30_000);

  it.each(['\u061c', '\u200e', '\u200f', '\ufeff'])(
    'rejects bidi mark %j in direct block schema input and strips it on untrusted input',
    (mark) => {
      const input = [{ type: 'heading', text: `A${mark}B`, level: 2 }];
      expect(safeParseBlocks(input).success).toBe(false);
      const loaded = parseUntrustedBlocks(input);
      expect(loaded.success).toBe(true);
      if (loaded.success) expect(loaded.blocks[0]).toMatchObject({ text: 'AB' });
    }
  );
});

describe('URL tricks in every URL-bearing field', () => {
  const imageWith = (src: string) => [{ type: 'image', src, alt: 'Cover', width: 1, height: 1 }];
  const videoWith = (extra: Record<string, string>) => [
    { type: 'video', src: './clips/demo.mp4', label: 'Demo', width: 16, height: 9, ...extra },
  ];
  const ctaWith = (href: string) => [{ type: 'cta', actions: [{ label: 'Open', href }] }];

  it.each(HOSTILE_URLS)('never accepts %j as media', (url) => {
    expect(parseUntrustedBlocks(imageWith(url)).success).toBe(false);
    expect(parseUntrustedBlocks(videoWith({ src: url })).success).toBe(false);
    expect(parseUntrustedBlocks(videoWith({ poster: url })).success).toBe(false);
  });

  it.each(HOSTILE_URLS.filter((url) => safeHref(url) !== url || DANGEROUS_SCHEME.test(url)))(
    'never accepts %j as a link',
    (url) => {
      expect(parseUntrustedBlocks(ctaWith(url)).success).toBe(false);
    }
  );

  it('still accepts the legitimate forms', () => {
    expect(parseUntrustedBlocks(imageWith('assets/cover.webp')).success).toBe(true);
    expect(parseUntrustedBlocks(imageWith('avatar:av-007')).success).toBe(true);
    expect(parseUntrustedBlocks(imageWith('data:image/png;base64,iVBORw0KGgo=')).success).toBe(
      true
    );
    expect(parseUntrustedBlocks(ctaWith('https://example.com/docs')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('mailto:team@example.com')).success).toBe(true);
  });

  it.each(['http://example.com/docs', '/pricing', 'guide/start.html'])(
    'rejects non-approved link target %j',
    (href) => {
      expect(parseUntrustedBlocks(ctaWith(href)).success).toBe(false);
    }
  );

  it('allows only HTTPS, mailto and same-document fragment links', () => {
    expect(parseUntrustedBlocks(ctaWith('https://example.com/docs')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('mailto:team@example.com')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('#waitlist')).success).toBe(true);
    expect(parseUntrustedBlocks(ctaWith('/waitlist')).success).toBe(false);
    expect(parseUntrustedBlocks(ctaWith('http://example.com/docs')).success).toBe(false);
  });
});
