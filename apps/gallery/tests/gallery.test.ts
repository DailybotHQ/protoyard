import { describe, expect, it } from 'vitest';
import {
  createCommand,
  createRequest,
  interpretCreate,
  slugError,
  suggestSlug,
} from '../src/components/marketplace/model';
import { shellQuote } from '../src/lib/commands';
import { localDevUrl, readCreateAccess } from '../src/lib/control.svelte';
import { safePreviewUrl } from '../src/lib/devices';
import { renderMarkdown, rewriteDocLink } from '../src/lib/docs/index.ts';
import { buildSearchIndex, isDocsSearchIndex } from '../src/lib/docs/search.ts';
import { type SitemapSources, sitemapPaths } from '../src/pages/sitemap.xml.ts';

/**
 * The gallery's essential guards (PLAN_009): the marketplace create flow
 * (token-gated, never for blueprints, never opens a non-local URL, quoted CLI
 * commands) and the untrusted-input refusals on preview URLs, rendered docs,
 * the docs search index and sitemap slugs. Registry reading and the
 * thumbnail symlink regressions live in registry-plugin.test.ts.
 */

describe('marketplace create flow', () => {
  const template = { k: 'template' as const, s: 'chat-widget' };
  const prototype = { k: 'prototype' as const, s: 'crm-demo' };
  const blueprint = { k: 'blueprint' as const, s: 'booking-scheduling' };

  it('enables gallery creates only with a per-run token from /api/status', () => {
    expect(readCreateAccess({ ok: true, create: { enabled: true, token: 'abc' } })).toEqual({
      enabled: true,
      token: 'abc',
    });
    expect(readCreateAccess({ ok: true, create: { enabled: false } }).enabled).toBe(false);
    expect(readCreateAccess({ ok: true, create: { enabled: true, token: '' } }).enabled).toBe(
      false
    );
    expect(readCreateAccess({ ok: true, create: { enabled: true, token: 7 } }).enabled).toBe(false);
    // An older control server with no `create` field: creating stays off.
    expect(readCreateAccess({ ok: true, running: [] }).enabled).toBe(false);
  });

  it('validates slugs and builds /api/new requests for templates and prototypes, never blueprints', () => {
    expect(slugError('Team CRM')).toMatch(/kebab-case/);
    expect(slugError('team-crm')).toBe('');
    expect(suggestSlug('Équipe CRM — 2026!')).toBe('equipe-crm-2026');
    expect(createRequest(template, { slug: 'my-widget', name: ' Help ' })).toEqual({
      slug: 'my-widget',
      from: 'chat-widget',
      name: 'Help',
    });
    expect(createRequest(prototype, { slug: 'my-crm' })).toEqual({
      slug: 'my-crm',
      from: 'crm-demo',
    });
    expect(createRequest(blueprint, { slug: 'my-booking' })).toBeNull();
  });

  it('shows shell-quoted CLI commands for the read-only gallery', () => {
    expect(shellQuote('$(rm -rf ~)')).toBe(`'$(rm -rf ~)'`);
    expect(createCommand(template, { slug: 'my-widget', name: "Ann's help" })).toBe(
      "pnpm protoyard new my-widget --from chat-widget --name 'Ann'\\''s help'"
    );
    expect(createCommand(blueprint, { slug: 'my-booking' })).toBe(
      'pnpm protoyard generate my-booking --blueprint blueprints/booking-scheduling.json'
    );
  });

  it('interprets /api/new outcomes and never opens a non-local URL', () => {
    const local = (url: string) => (url.startsWith('http://127.0.0.1:') ? url : null);
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: true, url: 'http://127.0.0.1:5180/' },
        true,
        local
      )
    ).toEqual({ state: 'running', slug: 'my-crm', url: 'http://127.0.0.1:5180/' });
    expect(
      interpretCreate(
        { ok: true, slug: 'my-crm', linked: true, url: 'https://evil.example/' },
        true,
        local
      )
    ).toMatchObject({ state: 'created', error: expect.stringMatching(/non-local/) });
    expect(interpretCreate({ ok: false, error: 'my-crm already exists' }, false, local)).toEqual({
      state: 'failed',
      error: 'my-crm already exists',
    });
  });
});

describe('gallery untrusted-input guards', () => {
  it('only frames http(s) previews and only links local dev servers', () => {
    expect(safePreviewUrl('http://localhost:5173')).toBe('http://localhost:5173/');
    expect(safePreviewUrl('javascript:alert(1)')).toBeNull();
    expect(safePreviewUrl('not a url')).toBeNull();
    expect(localDevUrl('http://127.0.0.1:5174')).toBe('http://127.0.0.1:5174/');
    expect(localDevUrl('https://evil.example/')).toBeNull();
    expect(localDevUrl('javascript:alert(1)')).toBeNull();
  });

  it('renders docs with raw HTML escaped, code inert and unsafe links refused', () => {
    const rendered = renderMarkdown(
      [
        '# Safe title',
        '',
        '<script>alert(1)</script> [unsafe](javascript:alert(1))',
        '',
        '```html',
        '<img src=x onerror=alert(1)>',
        '```',
      ].join('\n'),
      'PLAYER.md'
    );
    expect(rendered.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(rendered.html).not.toContain('<script>');
    expect(rendered.html).not.toContain('<img');
    expect(rendered.html).not.toContain('href="javascript:');
    expect(rewriteDocLink('PLAYER.md', 'javascript:alert(1)')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '//example.com/path')).toBeNull();
    expect(rewriteDocLink('PLAYER.md', '../../../../outside.md')).toBeNull();
  });

  it('refuses a docs search index with unsafe or foreign hrefs', () => {
    const rendered = renderMarkdown(
      '# Sharing\n\n## Share links\n\nLinks stay short.',
      'PLAYER.md'
    );
    const good = buildSearchIndex([{ slug: 'player', filename: 'PLAYER.md', ...rendered }], '/');
    const entry = good.entries[0];
    if (!entry) throw new Error('fixture');
    expect(isDocsSearchIndex(good)).toBe(true);
    for (const href of ['javascript:alert(1)', '//evil.example/docs/', 'https://evil.example/']) {
      expect(isDocsSearchIndex({ ...good, entries: [{ ...entry, href }] }), href).toBe(false);
    }
    expect(isDocsSearchIndex(null)).toBe(false);
  });

  it('omits unsafe slugs and unsupported marketplace source kinds from the sitemap', () => {
    const sources: SitemapSources = {
      prototypes: [{ slug: '../escape' }, { slug: 'valid-app' }],
      templates: [{ slug: 'has space' }],
      shelf: [
        { k: 'blueprint', s: 'valid-deck', contentKind: 'deck' },
        { k: 'deck', s: 'alias-deck', contentKind: 'deck' },
        { k: 'blueprint', s: '../outside', contentKind: 'page' },
      ],
      docs: [{ slug: 'player' }],
    } as SitemapSources;
    const paths = sitemapPaths(sources);
    expect(paths).toContain('/p/valid-app/');
    expect(paths).toContain('/marketplace/blueprint/valid-deck/');
    expect(paths.some((path) => path.includes('escape') || path.includes('space'))).toBe(false);
    expect(paths.some((path) => path.includes('outside'))).toBe(false);
    expect(paths).not.toContain('/marketplace/deck/alias-deck/');
  });
});
