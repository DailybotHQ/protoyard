// @vitest-environment node
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrototypeManifestSchema } from '@protoyard/core';
import { listThemeLibrary } from '@protoyard/themes';
import { afterEach, describe, expect, it } from 'vitest';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

describe('protoyard theme list, show and use', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('filters the theme library by collection and search', async () => {
    const seasonal = await cli(['--json', 'theme', 'list', '--collection', 'seasonal']);
    expect(seasonal.code).toBe(0);
    const seasonalThemes = seasonal.json<{
      data: { themes: Array<{ id: string; source: string; collection?: string }> };
    }>().data.themes;
    expect(seasonalThemes.length).toBeGreaterThan(0);
    expect(
      seasonalThemes.every((theme) => theme.source === 'library' && theme.collection === 'seasonal')
    ).toBe(true);

    const searched = await cli(['--json', 'theme', 'list', '--search', 'fintech-ledger']);
    expect(searched.code).toBe(0);
    expect(
      searched.json<{ data: { themes: Array<{ id: string }> } }>().data.themes.map(({ id }) => id)
    ).toContain('fintech-ledger');
    expect(listThemeLibrary().length).toBeGreaterThan(seasonalThemes.length);
  });

  it('shows light and dark swatches with text and UI contrast results', async () => {
    const result = await cli(['--json', 'theme', 'show', 'fintech-ledger']);
    expect(result.code).toBe(0);
    const data = result.json<{
      data: {
        source: string;
        swatches: { light: { primary: string }; dark: { background: string } };
        contrast: {
          light: { text: { pairs: unknown[] }; ui: { pairs: unknown[] } };
          dark: { text: { pairs: unknown[] }; ui: { pairs: unknown[] } };
        };
      };
    }>().data;
    expect(data.source).toBe('library');
    expect(data.swatches.light.primary).toMatch(/^#[0-9a-f]{6}$/i);
    expect(data.swatches.dark.background).toMatch(/^#[0-9a-f]{6}$/i);
    expect(data.contrast.light.text.pairs.length).toBeGreaterThan(0);
    expect(data.contrast.light.ui.pairs.length).toBeGreaterThan(0);
    expect(data.contrast.dark.text.pairs.length).toBeGreaterThan(0);
    expect(data.contrast.dark.ui.pairs.length).toBeGreaterThan(0);
  });

  it('sets only defaultTheme in the manifest and supports dry-run', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'theme-fixture');
    const manifestPath = join(ws.root, 'prototypes/theme-fixture/protoyard.json');
    const before = readFileSync(manifestPath, 'utf8');
    const dryRun = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'use',
      'theme-fixture',
      'fintech-ledger',
      '--dry-run',
    ]);
    expect(dryRun.code).toBe(0);
    expect(dryRun.json<{ data: { dryRun: boolean; written: boolean } }>().data).toMatchObject({
      dryRun: true,
      written: false,
    });
    expect(readFileSync(manifestPath, 'utf8')).toBe(before);

    const applied = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'use',
      'theme-fixture',
      'fintech-ledger',
    ]);
    expect(applied.code).toBe(0);
    const updated = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<string, unknown>;
    expect(updated).toMatchObject({ defaultTheme: 'fintech-ledger', scenarios: ['default'] });
    expect(PrototypeManifestSchema.safeParse(updated).success).toBe(true);
    expect(existsSync(join(ws.root, 'prototypes/theme-fixture/src/theme.ts'))).toBe(false);
  });

  it('returns not-found for unknown theme ids and usage for unknown collections', async () => {
    const unknownTheme = await cli(['--json', 'theme', 'show', 'not-a-theme']);
    expect(unknownTheme.code).toBe(3);
    expect(unknownTheme.json<{ error: { code: string } }>().error.code).toBe('not_found');

    const unknownCollection = await cli([
      '--json',
      'theme',
      'list',
      '--collection',
      'not-a-collection',
    ]);
    expect(unknownCollection.code).toBe(2);
    expect(unknownCollection.json<{ error: { code: string } }>().error.code).toBe('usage');
  });
});
