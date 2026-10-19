import { describe, expect, it } from 'vitest';
import {
  buildScenarioLink,
  parseManifest,
  parseScenarioLink,
  ReviewBuildSchema,
  resolveReviewBuild,
  safeParseManifest,
} from '../src/index.ts';
import {
  groupReviewThreads,
  REVIEW_FORMAT_VERSION,
  REVIEW_LIMITS,
  ReviewAnchorSchema,
  ReviewCommentSchema,
  ReviewContextSchema,
  ReviewThreadSchema,
  safeParseReviewComment,
} from '../src/review.ts';

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
  it('keeps manifests without review valid and unchanged', () => {
    const parsed = parseManifest(manifestBase);
    expect(parsed.build).toEqual({
      includeDevtools: false,
      demoBadge: true,
      base: './',
      offline: false,
      frameWhenEmbedded: false,
    });
    expect(parsed.build.review).toBeUndefined();
    expect(resolveReviewBuild(parsed.build.review)).toEqual({ enabled: false, adapter: 'local' });
  });

  it('applies defaults inside an explicit review block', () => {
    const parsed = parseManifest({ ...manifestBase, build: { review: {} } });
    expect(parsed.build.review).toEqual({ enabled: false, adapter: 'local' });
    expect(parsed.build.includeDevtools).toBe(false);
  });

  it('accepts every adapter and resolves the cloudflare store and endpoint', () => {
    for (const adapter of ['local', 'cloudflare', 'artifact'] as const) {
      expect(ReviewBuildSchema.safeParse({ enabled: true, adapter }).success, adapter).toBe(true);
    }
    expect(resolveReviewBuild({ enabled: true, adapter: 'cloudflare' })).toEqual({
      enabled: true,
      adapter: 'cloudflare',
      store: 'kv',
      endpoint: '/api/comments',
    });
    expect(resolveReviewBuild({ enabled: true, adapter: 'cloudflare', store: 'd1' }).store).toBe(
      'd1'
    );
    expect(
      resolveReviewBuild({
        enabled: true,
        adapter: 'http',
        endpoint: 'https://review.example.com/c',
      })
    ).toEqual({ enabled: true, adapter: 'http', endpoint: 'https://review.example.com/c' });
  });

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

describe('review links', () => {
  it('parses ?comments= and ?review=<key> into a review field', () => {
    expect(parseScenarioLink('?comments=1').review).toEqual({ comments: true });
    expect(parseScenarioLink('?comments=0').review).toEqual({ comments: false });
    expect(parseScenarioLink('?review=team-key-2026').review).toEqual({ key: 'team-key-2026' });
    expect(parseScenarioLink('?scenario=active-month&review=Ab_9-xyzQ&comments=1')).toEqual({
      scenario: 'active-month',
      review: { key: 'Ab_9-xyzQ', comments: true },
    });
  });

  it('ignores malformed review parameters', () => {
    for (const search of [
      '?comments=true',
      '?comments=',
      '?review=',
      '?review=short',
      `?review=${'k'.repeat(129)}`,
      '?review=<script>alert(1)</script>',
      '?review=a%20b%20c%20d%20e',
    ]) {
      expect(parseScenarioLink(search).review, search).toBeUndefined();
    }
    expect(parseScenarioLink('?scenario=active-month')).toEqual({ scenario: 'active-month' });
  });

  it('round-trips review parameters through buildScenarioLink', () => {
    const link = buildScenarioLink('/p/crm-demo/', {
      scenario: 'active-month',
      review: { key: 'team-key-2026', comments: true },
    });
    expect(link).toBe('/p/crm-demo/?scenario=active-month&review=team-key-2026&comments=1');
    expect(parseScenarioLink(new URL(link, 'http://x.example').search)).toEqual({
      scenario: 'active-month',
      review: { key: 'team-key-2026', comments: true },
    });
    expect(buildScenarioLink('/p/', { review: {} })).toBe('/p/');
  });
});

describe('review comment schema', () => {
  it('parses a root comment and a reply with the format version', () => {
    const parsed = ReviewCommentSchema.parse(root);
    expect(parsed.formatVersion).toBe(REVIEW_FORMAT_VERSION);
    expect(parsed.anchor?.offset).toEqual({ x: 0.25, y: 0.5 });
    const parsedReply = ReviewCommentSchema.parse(reply);
    expect(parsedReply.body).toContain('<script>');
    expect(parsedReply.anchor).toBeUndefined();
  });

  it('requires an anchor and context on the root comment of a thread', () => {
    const { anchor: _a, ...noAnchor } = root;
    const { context: _c, ...noContext } = root;
    expect(ReviewCommentSchema.safeParse(noAnchor).success).toBe(false);
    expect(ReviewCommentSchema.safeParse(noContext).success).toBe(false);
  });

  it('enforces body and name length caps', () => {
    const max = 'x'.repeat(REVIEW_LIMITS.bodyMaxChars);
    expect(ReviewCommentSchema.safeParse({ ...reply, body: max }).success).toBe(true);
    expect(ReviewCommentSchema.safeParse({ ...reply, body: `${max}x` }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, body: '' }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, body: '   \n ' }).success).toBe(false);
    const longName = 'n'.repeat(REVIEW_LIMITS.nameMaxChars + 1);
    expect(
      ReviewCommentSchema.safeParse({ ...reply, author: { ...reply.author, name: longName } })
        .success
    ).toBe(false);
    expect(
      ReviewCommentSchema.safeParse({ ...reply, author: { ...reply.author, name: ' ' } }).success
    ).toBe(false);
  });

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

  it('validates ids, slug, timestamps and rejects unknown keys', () => {
    expect(ReviewCommentSchema.safeParse({ ...reply, id: '../etc' }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, slug: 'Not A Slug' }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, createdAt: 'yesterday' }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, html: '<b>x</b>' }).success).toBe(false);
    expect(ReviewCommentSchema.safeParse({ ...reply, formatVersion: 2 }).success).toBe(false);
    expect(
      ReviewCommentSchema.safeParse({
        ...reply,
        resolvedAt: '2026-10-19T11:00:00.000Z',
        resolvedBy: reply.author,
        editedAt: '2026-10-19T10:30:00.000Z',
        updatedAt: '2026-10-19T11:00:00.000Z',
        reactions: { '+1': ['client_ana_0001'] },
      }).success
    ).toBe(true);
  });

  it('caps reactions', () => {
    const many = Object.fromEntries(
      Array.from({ length: REVIEW_LIMITS.reactionKinds + 1 }, (_, i) => [
        `r${i}`,
        ['client_ana_0001'],
      ])
    );
    expect(ReviewCommentSchema.safeParse({ ...reply, reactions: many }).success).toBe(false);
  });

  it('never throws on untrusted input through safeParseReviewComment', () => {
    for (const input of [null, 42, 'x', [], { body: 1 }]) {
      expect(safeParseReviewComment(input).success).toBe(false);
    }
  });
});

describe('review anchor and context', () => {
  it('bounds offsets and requires at least one locator', () => {
    expect(ReviewAnchorSchema.safeParse(anchor).success).toBe(true);
    expect(ReviewAnchorSchema.safeParse({ ...anchor, offset: { x: 1.2, y: 0 } }).success).toBe(
      false
    );
    expect(ReviewAnchorSchema.safeParse({ ...anchor, locators: [] }).success).toBe(false);
    expect(
      ReviewAnchorSchema.safeParse({ ...anchor, locators: [{ kind: 'xpath', value: '//a' }] })
        .success
    ).toBe(false);
    expect(
      ReviewAnchorSchema.safeParse({ ...anchor, route: { pattern: '/x', path: 'no-slash' } })
        .success
    ).toBe(false);
  });

  it('accepts a minimal context and rejects unknown shells', () => {
    expect(ReviewContextSchema.safeParse({ viewport: { width: 1280, height: 800 } }).success).toBe(
      true
    );
    expect(ReviewContextSchema.safeParse({ ...context, shell: 'hologram' }).success).toBe(false);
  });
});

describe('review threads', () => {
  it('groups comments into threads ordered by creation time and id', () => {
    const later = {
      ...root,
      id: '01JAXR9Z000000000000000000',
      threadId: '01JAXR9Z000000000000000000',
      createdAt: '2026-10-19T12:00:00.000Z',
    };
    const comments = [later, reply, root].map((c) => ReviewCommentSchema.parse(c));
    const { threads, orphans } = groupReviewThreads(comments);
    expect(threads.map((t) => t.id)).toEqual([root.id, later.id]);
    expect(threads[0]?.replies.map((r) => r.id)).toEqual([reply.id]);
    expect(threads[0]?.status).toBe('open');
    expect(orphans).toEqual([]);
    for (const thread of threads) expect(ReviewThreadSchema.safeParse(thread).success).toBe(true);
  });

  it('reports replies whose root is missing and marks resolved threads', () => {
    const resolved = ReviewCommentSchema.parse({
      ...root,
      resolvedAt: '2026-10-19T13:00:00.000Z',
      resolvedBy: root.author,
    });
    const stray = ReviewCommentSchema.parse({ ...reply, threadId: '01JAXRZZZZZZZZZZZZZZZZZZZZ' });
    const { threads, orphans } = groupReviewThreads([resolved, stray]);
    expect(threads[0]?.status).toBe('resolved');
    expect(orphans.map((c) => c.id)).toEqual([stray.id]);
  });
});
