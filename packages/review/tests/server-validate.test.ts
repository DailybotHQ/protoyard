// @vitest-environment node
import { REVIEW_LIMITS, ReviewCommentSchema } from '@protoyard/core/review';
import { describe, expect, it } from 'vitest';
import { SERVER_REVIEW_LIMITS, validateReviewComment } from '../src/server/validate.ts';
import { sampleComment } from './conformance.ts';

type Json = Record<string, unknown>;

const root = (): Json =>
  JSON.parse(
    JSON.stringify(
      sampleComment('demo-app', {
        id: 'comment-root-001',
        threadId: 'comment-root-001',
        context: {
          scenario: 'busy-quarter',
          persona: 'owner_1',
          shell: 'phone',
          orientation: 'portrait',
          theme: 'ocean-blue',
          mode: 'dark',
          layout: 'sidebar',
          viewport: { width: 390, height: 844 },
          buildId: 'build-2026',
        },
        reactions: { '+1': ['client-aaaaaaaa'], eyes: ['client-bbbbbbbb', 'client-cccccccc'] },
        updatedAt: '2026-10-19T11:00:00.000Z',
        editedAt: '2026-10-19T10:30:00+02:00',
        resolvedAt: '2026-10-19T12:00Z',
        resolvedBy: { name: 'Sam Owner', clientId: 'client-owner-1' },
      })
    )
  ) as Json;

const reply = (): Json => {
  const { anchor: _a, context: _c, ...rest } = root();
  return { ...rest, id: 'comment-reply-01' };
};

/** Sets `value` at a dotted path on a deep copy (`undefined` deletes the key). */
function at(base: Json, path: string, value: unknown): Json {
  const copy = JSON.parse(JSON.stringify(base)) as Json;
  const keys = path.split('.');
  let node: Json = copy;
  for (const key of keys.slice(0, -1)) node = node[key] as Json;
  const last = keys[keys.length - 1] as string;
  if (value === undefined) delete node[last];
  else node[last] = value;
  return copy;
}

const long = (n: number, ch = 'a') => ch.repeat(n);
const TYPE_PROBES: unknown[] = [undefined, null, 0, 1.5, -1, '', 'x', true, [], {}, ['a']];

const STRING_PATHS: Record<string, unknown[]> = {
  formatVersion: [1, 2, 0, '1'],
  id: ['abcdefghij', 'abcdefghi', long(64), long(65), 'has space!x', 'ok_id-1234', 'é'.repeat(12)],
  threadId: ['comment-root-001', 'short', long(64, 'Z')],
  slug: [
    'ab',
    'a',
    'demo-app',
    'Demo-app',
    'demo--app',
    'demo-',
    '9demo',
    long(48),
    long(49),
    'api',
  ],
  body: [
    ' ',
    '\n\t',
    'ok',
    'tab\tnew\nline\r',
    'bell\u0007',
    'del\u007f',
    'c1\u0085',
    'bidi‮',
    'iso⁦',
    'ls ok',
    long(2000),
    long(2001),
    '<script>alert(1)</script>',
  ],
  'author.name': ['', '  ', 'A', long(60), long(61), 'tab\tname', 'ls ', 'ps ', 'bidi‪', 'Zoë'],
  'author.clientId': ['abcdefgh', 'abcdefg', long(128), long(129), 'a:b.c-d_e', 'bad/slash'],
  createdAt: [
    '2026-10-19T10:00:00.000Z',
    '2026-10-19T10:00Z',
    '2026-10-19T10:00:00+05:30',
    '2026-10-19T10:00:00.123456789Z',
    '2026-10-19T10:00:00.1234567890Z',
    '2026-10-19',
    '2026-10-19 10:00:00Z',
    '2026-13-45T10:00:00Z',
    '2026-02-30T10:00:00Z',
    '2026-10-19T25:00:00Z',
    '2026-10-19T10:00:00',
  ],
  updatedAt: ['2026-10-19T10:00:00Z', 'nope'],
  editedAt: ['2026-10-19T10:00:00Z', ''],
  resolvedAt: ['2026-10-19T10:00:00Z', '10:00'],
  'resolvedBy.name': ['Pat', ''],
  'resolvedBy.clientId': ['client-xyz-1', 'x'],
  'anchor.route.pattern': ['/', '/deals/:id', 'deals', `/${long(499)}`, `/${long(500)}`],
  'anchor.route.path': ['/x', '', 'x/'],
  'anchor.fingerprint': ['', long(120), long(121)],
  'anchor.offset.x': [0, 1, 0.5, -0.01, 1.01, '0.5', -0],
  'anchor.offset.y': [0, 1, 2],
  'context.scenario': ['busy', 'Busy', '1busy', long(64), `a${long(64)}`, 'a-b-'],
  'context.persona': ['A_b-9', '', long(64), long(65), 'a.b'],
  'context.shell': [
    'auto',
    'none',
    'phone',
    'tablet',
    'desktop-window',
    'browser',
    'widget-host',
    'extension-popup',
    'side-panel',
    'watch',
  ],
  'context.orientation': ['portrait', 'landscape', 'upside'],
  'context.theme': ['dark-ocean', 'Dark'],
  'context.mode': ['light', 'dark', 'system', 'auto'],
  'context.layout': ['sidebar', ''],
  'context.viewport.width': [1, 20000, 0, 20001, 10.5, '100'],
  'context.viewport.height': [1, 800, -5],
  'context.buildId': ['', 'b', long(80), long(81)],
};

const STRUCTURE: Array<[string, Json]> = [
  ['root', root()],
  ['reply', reply()],
  ['reply with anchor only', { ...reply(), anchor: root().anchor }],
  ['root without anchor', at(root(), 'anchor', undefined)],
  ['root without context', at(root(), 'context', undefined)],
  ['without formatVersion', at(root(), 'formatVersion', undefined)],
  ['unknown top-level key', { ...root(), role: 'admin' }],
  ['unknown author key', at(root(), 'author.email', 'riley@example.com')],
  ['unknown anchor key', at(root(), 'anchor.extra', 1)],
  ['unknown route key', at(root(), 'anchor.route.extra', '/x')],
  ['unknown offset key', at(root(), 'anchor.offset.z', 0)],
  ['unknown context key', at(root(), 'context.extra', 'x')],
  ['unknown viewport key', at(root(), 'context.viewport.depth', 1)],
  ['unknown locator key', at(root(), 'anchor.locators.0.extra', 1)],
  ['no locators', at(root(), 'anchor.locators', [])],
  ['five locators', at(root(), 'anchor.locators', Array(5).fill({ kind: 'id', value: 'x' }))],
  ['six locators', at(root(), 'anchor.locators', Array(6).fill({ kind: 'id', value: 'x' }))],
  [
    'locator kinds',
    at(
      root(),
      'anchor.locators',
      ['py-anchor', 'test-id', 'id', 'role-path', 'css-path'].map((kind) => ({ kind, value: 'v' }))
    ),
  ],
  ['bad locator kind', at(root(), 'anchor.locators.0.kind', 'xpath')],
  ['empty locator value', at(root(), 'anchor.locators.0.value', '')],
  ['max locator value', at(root(), 'anchor.locators.0.value', long(500))],
  ['long locator value', at(root(), 'anchor.locators.0.value', long(501))],
  ['locator not object', at(root(), 'anchor.locators.0', 'id')],
  ['locators not array', at(root(), 'anchor.locators', { 0: { kind: 'id', value: 'x' } })],
  ['missing viewport', at(root(), 'context.viewport', undefined)],
  ['missing offset', at(root(), 'anchor.offset', undefined)],
  ['missing route', at(root(), 'anchor.route', undefined)],
  ['empty reactions', at(root(), 'reactions', {})],
  ['reaction array', at(root(), 'reactions', [])],
  ['reaction null', at(root(), 'reactions', null)],
  ['reaction empty key', at(root(), 'reactions', { '': ['client-aaaaaaaa'] })],
  ['reaction max key', at(root(), 'reactions', { [long(16)]: [] })],
  ['reaction long key', at(root(), 'reactions', { [long(17)]: [] })],
  ['reaction not array', at(root(), 'reactions', { eyes: 'client-aaaaaaaa' })],
  ['reaction bad id', at(root(), 'reactions', { eyes: ['bad'] })],
  ['reaction 200 ids', at(root(), 'reactions', { eyes: Array(200).fill('client-aaaaaaaa') })],
  ['reaction 201 ids', at(root(), 'reactions', { eyes: Array(201).fill('client-aaaaaaaa') })],
  [
    'reaction 20 kinds',
    at(
      root(),
      'reactions',
      Object.fromEntries(Array.from({ length: 20 }, (_, i) => [`k${i}`, []]))
    ),
  ],
  [
    'reaction 21 kinds',
    at(
      root(),
      'reactions',
      Object.fromEntries(Array.from({ length: 21 }, (_, i) => [`k${i}`, []]))
    ),
  ],
];

function fixtures(): Array<[string, unknown]> {
  const out: Array<[string, unknown]> = [...STRUCTURE];
  for (const probe of [null, [], 'x', 1, true, undefined])
    out.push([`document ${String(probe)}`, probe]);
  for (const [path, values] of Object.entries(STRING_PATHS)) {
    for (const value of [...values, ...TYPE_PROBES]) {
      out.push([`${path} = ${JSON.stringify(value)}`, at(root(), path, value)]);
      if (!path.startsWith('anchor') && !path.startsWith('context'))
        out.push([`reply ${path} = ${JSON.stringify(value)}`, at(reply(), path, value)]);
    }
  }
  for (const path of [
    'author',
    'resolvedBy',
    'anchor',
    'context',
    'anchor.route',
    'anchor.offset',
    'context.viewport',
  ]) {
    for (const value of TYPE_PROBES)
      out.push([`${path} = ${JSON.stringify(value)}`, at(root(), path, value)]);
  }
  return out;
}

describe('server comment validator parity with ReviewCommentSchema', () => {
  it('mirrors REVIEW_LIMITS', () => {
    expect(SERVER_REVIEW_LIMITS).toEqual(REVIEW_LIMITS);
  });

  const cases = fixtures();

  it('covers many valid and invalid documents', () => {
    const results = cases.map(([, input]) => ReviewCommentSchema.safeParse(input).success);
    expect(cases.length).toBeGreaterThan(400);
    expect(results.filter(Boolean).length).toBeGreaterThan(100);
    expect(results.filter((ok) => !ok).length).toBeGreaterThan(200);
  });

  it.each(cases)('%s', (_name, input) => {
    const expected = ReviewCommentSchema.safeParse(input);
    const actual = validateReviewComment(input);
    expect(actual.success).toBe(expected.success);
    if (expected.success && actual.success) {
      expect(actual.data).toStrictEqual(expected.data);
      expect(JSON.stringify(actual.data)).toBe(JSON.stringify(expected.data));
    }
    if (!actual.success) expect(actual.issues.length).toBeGreaterThan(0);
  });

  it('returns copies, never the input objects', () => {
    const input = root();
    const result = validateReviewComment(input);
    if (!result.success) throw new Error('expected success');
    expect(result.data).not.toBe(input);
    expect(result.data.author).not.toBe(input.author);
    expect(result.data.anchor).not.toBe(input.anchor);
    expect(result.data.reactions).not.toBe(input.reactions);
  });

  it('keeps a __proto__ reaction key as data instead of a prototype', () => {
    const input = JSON.parse(JSON.stringify(root()).replace('"eyes"', '"__proto__"')) as unknown;
    const result = validateReviewComment(input);
    if (!result.success) throw new Error('expected success');
    expect(Object.getPrototypeOf(result.data.reactions)).toBe(Object.prototype);
    expect(Object.keys(result.data.reactions ?? {})).toContain('__proto__');
  });
});
