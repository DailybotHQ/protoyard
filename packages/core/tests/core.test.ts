import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import {
  checkSlug,
  createIdFactory,
  createPermissionPolicy,
  createRng,
  createSimulationClock,
  createSimulationEnvironment,
  parseInput,
  parseScenarioLink,
  ReviewBuildSchema,
  safeParseManifest,
  slugify,
  utf8ByteLengthExceeds,
  ValidationError,
  validateSnapshot,
} from '../src/index.ts';
import { ReviewCommentSchema, safeParseReviewComment } from '../src/review.ts';

describe('slugs', () => {
  it('accepts kebab-case and rejects traversal, reserved and malformed input', () => {
    expect(checkSlug('my-crm').ok).toBe(true);
    for (const bad of [
      '../etc',
      'My-CRM',
      'a',
      'crm--demo',
      '-crm',
      'crm/x',
      'templates',
      '9lives',
    ]) {
      expect(checkSlug(bad).ok, bad).toBe(false);
    }
    expect(slugify('  My CRM v2! ')).toBe('my-crm-v2');
  });
});

describe('manifest', () => {
  it('applies defaults and rejects unknown keys', () => {
    const ok = safeParseManifest({
      id: 'example.crm',
      slug: 'crm-demo',
      name: 'CRM',
      version: '0.1.0',
      storage: { namespace: 'crm-demo', schemaVersion: 1 },
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.build.includeDevtools).toBe(false);
    expect(safeParseManifest({ id: 'x', slug: 'crm' }).success).toBe(false);
  });
});

describe('determinism', () => {
  it('produces the same stream for the same seed', () => {
    const a = createRng(42);
    const b = createRng(42);
    expect(Array.from({ length: 5 }, () => a.int(0, 1000))).toEqual(
      Array.from({ length: 5 }, () => b.int(0, 1000))
    );
    expect(createRng(42).fork('deals').next()).toBe(createRng(42).fork('deals').next());
    const ids = createIdFactory();
    expect([ids.next('deal'), ids.next('deal'), ids.next('company')]).toEqual([
      'deal_0001',
      'deal_0002',
      'company_0001',
    ]);
  });
});

describe('clock', () => {
  it('separates preview from committed time', () => {
    const clock = createSimulationClock({ referenceTime: '2026-10-16T10:00:00Z' });
    clock.preview({ days: 7 });
    expect(clock.isPreviewing()).toBe(true);
    expect(clock.committed().toISOString()).toBe('2026-10-16T10:00:00.000Z');
    clock.clearPreview();
    clock.commitAdvance({ days: 1 });
    expect(clock.now().toISOString()).toBe('2026-10-17T10:00:00.000Z');
    expect(() => clock.commitAdvance({ days: -1 })).toThrow();
    clock.resetClock();
    expect(clock.now().toISOString()).toBe('2026-10-16T10:00:00.000Z');
  });
});

describe('policy', () => {
  it('honors wildcard, denials and record rules', () => {
    const policy = createPermissionPolicy({
      roles: { admin: ['*', '-billing:manage'], viewer: ['deals:read'], rep: ['deals:update'] },
      rules: {
        'deals:update': (p, deal) => (deal as { ownerId: string }).ownerId === p.persona.id,
      },
    });
    const principal = (role: string) => ({
      persona: { id: 'u1' } as never,
      organization: null,
      membership: null,
      role,
      capabilities: policy.capabilitiesFor(role),
    });
    expect(policy.can(principal('admin'), 'deals:delete')).toBe(true);
    expect(policy.can(principal('admin'), 'billing:manage')).toBe(false);
    expect(policy.can(principal('viewer'), 'deals:update')).toBe(false);
    expect(policy.can(principal('rep'), 'deals:update', { ownerId: 'u1' })).toBe(true);
    expect(policy.can(principal('rep'), 'deals:update', { ownerId: 'u2' })).toBe(false);
    expect(() => policy.assert(principal('viewer'), 'deals:create')).toThrow(/Permission denied/);
  });
});

describe('environment', () => {
  it('fails reproducibly and respects offline', async () => {
    const env = createSimulationEnvironment({ sleep: async () => {} });
    await expect(env.run('save', () => 1)).resolves.toBe(1);
    env.set({ network: 'offline' });
    await expect(env.run('save', () => 1)).rejects.toMatchObject({ code: 'offline' });
    env.set({ network: 'online', failureMode: 'server-error', failureRate: 1 });
    await expect(env.run('save', () => 1)).rejects.toMatchObject({ code: 'server-error' });
    env.set({ failureScope: ['agents.'] });
    await expect(env.run('save', () => 1)).resolves.toBe(1);
    await expect(env.run('agents.atlas', () => 1)).rejects.toMatchObject({ code: 'server-error' });
  });
});

describe('links, overrides and snapshots', () => {
  it('parses only safe link params', () => {
    expect(parseScenarioLink('?scenario=active-month&actor=user_0002&seed=42&mode=dark')).toEqual({
      scenario: 'active-month',
      actor: 'user_0002',
      seed: 42,
      mode: 'dark',
    });
    expect(parseScenarioLink('?scenario=<script>&seed=-1')).toEqual({});
    expect(parseScenarioLink('?sandbox=compare-a').sandbox).toBe('compare-a');
    expect(parseScenarioLink('?sandbox=../x').sandbox).toBeUndefined();
  });

  it('rejects snapshots for another prototype', () => {
    const result = validateSnapshot(
      {
        format: 'protoyard.snapshot',
        formatVersion: 1,
        id: 's1',
        name: 'x',
        prototypeId: 'example.other',
        prototypeVersion: '0.1.0',
        schemaVersion: 1,
        scenarioId: null,
        scenarioVersion: null,
        seed: null,
        referenceTime: null,
        createdAt: '2026-10-16T10:00:00Z',
        actorId: null,
        organizationId: null,
        clock: null,
        environment: {},
        tables: [],
      },
      { prototypeId: 'example.crm', schemaVersion: 1, tables: [] }
    );
    expect(result.ok).toBe(false);
  });
});

describe('snapshot size limit', () => {
  it('measures UTF-8 bytes, not UTF-16 code units', () => {
    expect(utf8ByteLengthExceeds('a'.repeat(10), 10)).toBe(false);
    expect(utf8ByteLengthExceeds('a'.repeat(11), 10)).toBe(true);
    // 4 emoji = 8 UTF-16 code units but 16 UTF-8 bytes.
    expect(utf8ByteLengthExceeds('😀😀😀😀', 10)).toBe(true);
    expect(utf8ByteLengthExceeds('😀😀', 10)).toBe(false);
  });
});

// --- merged from review.test.ts ---

const manifestBase = {
  id: 'example.crm',
  slug: 'crm-demo',
  name: 'CRM',
  version: '0.1.0',
  storage: { namespace: 'crm-demo', schemaVersion: 1 },
};

const anchor = {
  route: { pattern: '/deals/:id', path: '/deals/deal_0001' },
  locators: [
    { kind: 'py-anchor', value: 'deal-header' },
    { kind: 'css-path', value: 'main > section:nth-of-type(1)' },
  ],
  fingerprint: 'Acme renewal',
  offset: { x: 0.25, y: 0.5 },
};

const context = {
  scenario: 'active-month',
  persona: 'user_0002',
  shell: 'phone',
  orientation: 'portrait',
  theme: 'violet',
  mode: 'dark',
  layout: 'sidebar',
  viewport: { width: 390, height: 844 },
  buildId: '2026-10-19T10-00-00Z',
};

const root = {
  id: '01JAXR5Q7Z8KC2V3M4N5P6Q7R8',
  threadId: '01JAXR5Q7Z8KC2V3M4N5P6Q7R8',
  slug: 'crm-demo',
  body: 'The total should include tax.',
  author: { name: 'Ana Reviewer', clientId: 'client_ana_0001' },
  createdAt: '2026-10-19T10:00:00.000Z',
  anchor,
  context,
};

const reply = {
  id: '01JAXR6A0000000000000000AB',
  threadId: root.id,
  slug: 'crm-demo',
  body: 'Agreed. <script>alert(1)</script> stays plain text.',
  author: { name: 'Ben Builder', clientId: 'client_ben_0001' },
  createdAt: '2026-10-19T10:05:00.000Z',
};

describe('manifest build.review', () => {
  it('requires an endpoint for http and rejects unsafe endpoints', () => {
    expect(ReviewBuildSchema.safeParse({ enabled: true, adapter: 'http' }).success).toBe(false);
    const bad = [
      'http://review.example.com/c',
      'https://user:pass@review.example.com/c',
      '//review.example.com/c',
      'javascript:alert(1)',
      'api/comments',
      'https://review.example.com/c?key=secret',
      `/${'a'.repeat(300)}`,
    ];
    for (const endpoint of bad) {
      expect(
        ReviewBuildSchema.safeParse({ enabled: true, adapter: 'http', endpoint }).success,
        endpoint
      ).toBe(false);
    }
    for (const endpoint of [
      '/api/comments',
      'https://review.example.com/c',
      'http://localhost:8787/c',
    ]) {
      expect(
        ReviewBuildSchema.safeParse({ enabled: true, adapter: 'http', endpoint }).success,
        endpoint
      ).toBe(true);
    }
  });

  it('rejects secrets, unknown keys and a store on a non-cloudflare adapter', () => {
    expect(ReviewBuildSchema.safeParse({ enabled: true, key: 'secret-key-1' }).success).toBe(false);
    expect(ReviewBuildSchema.safeParse({ adapter: 'firebase' }).success).toBe(false);
    expect(ReviewBuildSchema.safeParse({ adapter: 'local', store: 'd1' }).success).toBe(false);
    expect(
      safeParseManifest({ ...manifestBase, build: { review: { enabled: 'yes' } } }).success
    ).toBe(false);
  });
});

describe('review comment schema', () => {
  it('rejects control and bidi override characters but keeps newlines and tabs', () => {
    expect(ReviewCommentSchema.safeParse({ ...reply, body: 'line one\n\tline two' }).success).toBe(
      true
    );
    for (const body of ['nul\u0000byte', 'bell\u0007', 'escape\u001b[31m', 'flip\u202Etxt.exe']) {
      expect(ReviewCommentSchema.safeParse({ ...reply, body }).success, JSON.stringify(body)).toBe(
        false
      );
    }
    expect(
      ReviewCommentSchema.safeParse({
        ...reply,
        author: { ...reply.author, name: 'Ana\nReviewer' },
      }).success
    ).toBe(false);
  });

  it('never throws on untrusted input through safeParseReviewComment', () => {
    for (const input of [null, 42, 'x', [], { body: 1 }]) {
      expect(safeParseReviewComment(input).success).toBe(false);
    }
  });
});

// --- merged from validation.test.ts ---

const ContactSchema = z.object({
  name: z.string().trim().min(2, 'Name must have at least 2 characters'),
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  tags: z.array(z.string()).default([]),
});

function rejection(schema: z.ZodType, input: unknown): ValidationError {
  try {
    parseInput(schema, input);
  } catch (error) {
    expect(error).toBeInstanceOf(ValidationError);
    return error as ValidationError;
  }
  throw new Error('parseInput accepted invalid input');
}

describe('parseInput', () => {
  it('throws a ValidationError keyed by field with the first issue as message', () => {
    const error = rejection(ContactSchema, { name: 'A', email: 'nope' });
    expect(error.name).toBe('ValidationError');
    expect(error.issues).toEqual({
      name: 'Name must have at least 2 characters',
      email: 'Enter a valid email address',
    });
    expect(error.message).toBe('Name must have at least 2 characters');
  });
});
