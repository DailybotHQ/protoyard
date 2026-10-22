// @vitest-environment node
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  decodeBlueprintShare,
  decodeDocumentShare,
  readBlueprintShareFragment,
} from '@protoyard/blueprint';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openInPlayerUrl, openInPlayerUrlForEntry } from '../src/lib/open-in-player.ts';

const fixture = JSON.parse(
  readFileSync(join(process.cwd(), 'blueprints/field-service-dispatch.json'), 'utf8')
) as unknown;

describe('open in player URLs', () => {
  afterEach(() => vi.unstubAllEnvs());

  it.each([
    ['deck', 'packages/blueprint/tests/fixtures/kinds/minimal.deck.json'],
    ['page', 'packages/blueprint/tests/fixtures/kinds/landing.page.json'],
    ['doc', 'packages/blueprint/tests/fixtures/kinds/quarterly-report.doc.json'],
  ] as const)('creates a validated player share link for a %s blueprint', async (kind, path) => {
    const input = JSON.parse(readFileSync(join(process.cwd(), path), 'utf8')) as unknown;
    const url = await openInPlayerUrl(input);
    expect(url).toMatch(/^\/play\/#bp=1\./);

    const fragment = readBlueprintShareFragment(url?.slice('/play/'.length) ?? '');
    const decoded = await decodeDocumentShare(fragment ?? '');
    expect(decoded.success).toBe(true);
    if (decoded.success) expect(decoded.blueprint).toMatchObject({ kind });
  });

  it('uses the configured base path and an encoded blueprint share fragment', async () => {
    vi.stubEnv('BASE_URL', '/protoyard/');
    const url = await openInPlayerUrl(fixture);
    expect(url).toMatch(/^\/protoyard\/play\/#bp=1\./);

    const fragment = readBlueprintShareFragment(url?.slice('/protoyard/play/'.length) ?? '');
    expect(fragment).toMatch(/^1\.[A-Za-z0-9_-]+$/);
    const decoded = await decodeBlueprintShare(fragment ?? '');
    expect(decoded).toMatchObject({ success: true, blueprint: { name: 'Waymark Field Service' } });
  });

  it('loads blueprints only for eligible prototype and blueprint entries', async () => {
    const root = mkdtempSync(join(tmpdir(), 'protoyard-open-player-'));
    try {
      mkdirSync(join(root, 'prototypes', 'field-service'), { recursive: true });
      mkdirSync(join(root, 'blueprints'), { recursive: true });
      cpSync(
        join(process.cwd(), 'blueprints/field-service-dispatch.json'),
        join(root, 'prototypes', 'field-service', 'blueprint.json')
      );
      cpSync(
        join(process.cwd(), 'blueprints/field-service-dispatch.json'),
        join(root, 'blueprints', 'dispatch.json')
      );

      const prototypeUrl = await openInPlayerUrlForEntry(
        { kind: 'prototype', path: 'prototypes/field-service' },
        root
      );
      const catalogUrl = await openInPlayerUrlForEntry(
        { kind: 'blueprint', path: 'blueprints/dispatch.json' },
        root
      );
      const templateUrl = await openInPlayerUrlForEntry(
        { kind: 'template', path: 'templates/blank' },
        root
      );

      expect(prototypeUrl).toMatch(/^\/play\/#bp=1\./);
      expect(catalogUrl).toMatch(/^\/play\/#bp=1\./);
      expect(templateUrl).toBeNull();
      expect(
        await openInPlayerUrlForEntry({ kind: 'blueprint', path: '../../outside.json' }, root)
      ).toBeNull();
      expect(
        await openInPlayerUrlForEntry(
          { kind: 'prototype', path: 'prototypes/without-blueprint' },
          root
        )
      ).toBeNull();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('omits an action for invalid or oversized blueprints', async () => {
    expect(await openInPlayerUrl({ nonsense: true })).toBeNull();
    const largeBlueprint = {
      ...(fixture as Record<string, unknown>),
      padding: 'x'.repeat(300_000),
    };
    expect(await openInPlayerUrl(largeBlueprint)).toBeNull();
  });

  it('wires the conditional action into both gallery detail routes without replacing previews', () => {
    const prototypePage = readFileSync(
      join(process.cwd(), 'apps/gallery/src/pages/p/[slug].astro'),
      'utf8'
    );
    const marketplacePage = readFileSync(
      join(process.cwd(), 'apps/gallery/src/pages/marketplace/[kind]/[slug].astro'),
      'utf8'
    );

    for (const page of [prototypePage, marketplacePage]) {
      expect(page).toContain('openInPlayerUrlForEntry');
      expect(page).toContain('href={playerHref}');
      expect(page).toContain('data-testid="open-in-player"');
    }
    expect(prototypePage).toContain('<LivePreview');
    expect(marketplacePage).toContain('<LivePreview');
    expect(marketplacePage).toContain('entry.contentKind');
    expect(marketplacePage).toContain("entry.contentKind !== 'app'");
    expect(marketplacePage).toContain('Try this {contentKind}');
  });
});
