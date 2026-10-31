// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrototypeManifestSchema } from '@protoyard/core';
import {
  ALL_LIBRARY_THEME_IDS,
  BUILTIN_THEMES,
  EXPANDED_LIBRARY_THEME_IDS,
  listThemeLibrary,
  violetTheme,
} from '@protoyard/themes';
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

  it('lists every library theme by default: the built-ins, the catalog and the expanded set', async () => {
    const result = await cli(['--json', 'theme', 'list']);
    expect(result.code).toBe(0);
    const data = result.json<{
      data: { count: number; themes: Array<{ id: string; source: string }> };
    }>().data;
    const ids = data.themes.map(({ id }) => id);
    expect(ids).toEqual([...BUILTIN_THEMES.map(({ id }) => id), ...ALL_LIBRARY_THEME_IDS]);
    expect(data.count).toBe(BUILTIN_THEMES.length + 204);
    // Search and the collection filter reach expanded themes too.
    const expanded = EXPANDED_LIBRARY_THEME_IDS[0] as string;
    const searched = await cli(['--json', 'theme', 'list', '--search', expanded]);
    expect(searched.json<{ data: { themes: Array<{ id: string }> } }>().data.themes[0]?.id).toBe(
      expanded
    );
    const mono = await cli(['--json', 'theme', 'list', '--collection', 'mono']);
    const monoIds = mono
      .json<{ data: { themes: Array<{ id: string }> } }>()
      .data.themes.map(({ id }) => id);
    expect(monoIds.length).toBeGreaterThan(listThemeLibrary({ collection: 'mono' }).length);
    expect(monoIds.some((id) => EXPANDED_LIBRARY_THEME_IDS.includes(id))).toBe(true);
  });

  it('filters by mood and rejects an unknown mood', async () => {
    const calm = await cli(['--json', 'theme', 'list', '--mood', 'calm']);
    expect(calm.code).toBe(0);
    const data = calm.json<{
      data: { mood: string; themes: Array<{ id: string; source: string; mood: string[] }> };
    }>().data;
    expect(data.mood).toBe('calm');
    expect(data.themes.length).toBeGreaterThan(listThemeLibrary({ mood: 'calm' }).length);
    expect(
      data.themes.every((theme) => theme.source === 'library' && theme.mood.includes('calm'))
    ).toBe(true);
    const bad = await cli(['--json', 'theme', 'list', '--mood', 'grumpy']);
    expect(bad.code).toBe(2);
    expect(bad.json<{ error: { code: string } }>().error.code).toBe('usage');
  });

  it('shows, exports and applies an expanded library theme', async () => {
    const expanded = EXPANDED_LIBRARY_THEME_IDS.at(-1) as string;
    const shown = await cli(['--json', 'theme', 'show', expanded]);
    expect(shown.code).toBe(0);
    expect(shown.json<{ data: { id: string; source: string } }>().data).toMatchObject({
      id: expanded,
      source: 'library',
    });
    const exported = await cli(['--json', 'theme', 'export', expanded, '--format', 'css']);
    expect(exported.code).toBe(0);
    expect(exported.json<{ data: { content: string } }>().data.content).toContain('--tx-primary:');

    ws = createWorkspace();
    addPrototype(ws, 'theme-expanded');
    const applied = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'use',
      'theme-expanded',
      expanded,
    ]);
    expect(applied.code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(ws.root, 'prototypes/theme-expanded/protoyard.json'), 'utf8')
    ) as Record<string, unknown>;
    expect(manifest.defaultTheme).toBe(expanded);
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

  it('imports bare themes and creates from the protoyard-theme/v1 wrapper', async () => {
    ws = createWorkspace();
    addPrototype(ws, 'theme-bare');
    addPrototype(ws, 'theme-wrapped');
    const bareFile = join(ws.root, 'bare.theme.json');
    const wrappedFile = join(ws.root, 'wrapped.theme.json');
    writeFileSync(bareFile, JSON.stringify(violetTheme), 'utf8');
    writeFileSync(
      wrappedFile,
      JSON.stringify({ format: 'protoyard-theme/v1', theme: violetTheme }),
      'utf8'
    );

    const imported = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'import',
      'theme-bare',
      bareFile,
    ]);
    expect(imported.code).toBe(0);
    expect(existsSync(join(ws.root, 'prototypes/theme-bare/src/theme.ts'))).toBe(true);

    const created = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'theme-wrapped',
      '--from',
      wrappedFile,
    ]);
    expect(created.code).toBe(0);
    expect(readFileSync(join(ws.root, 'prototypes/theme-wrapped/src/theme.ts'), 'utf8')).toContain(
      'violetTheme'
    );
  });
});
