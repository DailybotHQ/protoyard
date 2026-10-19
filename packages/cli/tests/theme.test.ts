// @vitest-environment node
import { readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { themeExportName } from '../src/commands/theme.ts';
import { addPrototype, cli, createWorkspace, type TempWorkspace } from './helpers.ts';

const repositoryRoot = process.cwd();

describe('protoyard theme', () => {
  let ws: TempWorkspace | undefined;

  afterEach(() => {
    ws?.cleanup();
    ws = undefined;
  });

  it('lists themes and exports a built-in as W3C design tokens', async () => {
    const listed = await cli(['--json', 'theme', 'list']);
    expect(listed.code).toBe(0);
    expect(
      listed.json<{ data: { themes: Array<{ id: string; source: string }> } }>().data.themes
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'violet', source: 'builtin' }),
        expect.objectContaining({ id: 'fintech-ledger', source: 'library' }),
      ])
    );

    const exported = await cli(['--json', 'theme', 'export', 'violet', '--format', 'tokens']);
    expect(exported.code).toBe(0);
    const content = exported.json<{ data: { content: string; format: string } }>().data;
    expect(content.format).toBe('tokens');
    expect(JSON.parse(content.content)).toMatchObject({
      $schema: expect.stringContaining('design-tokens'),
      color: { light: { background: { $type: 'color' } }, dark: {} },
    });
  });

  it('exports CSS custom properties and Tailwind @theme tokens', async () => {
    const css = await cli(['--json', 'theme', 'export', 'fintech-ledger', '--format', 'css']);
    expect(css.code).toBe(0);
    expect(css.json<{ data: { content: string } }>().data.content).toContain(':root {');
    expect(css.json<{ data: { content: string } }>().data.content).toContain('--py-background:');

    const tailwind = await cli(['--json', 'theme', 'export', 'violet', '--format', 'tailwind']);
    expect(tailwind.code).toBe(0);
    expect(tailwind.json<{ data: { content: string } }>().data.content).toContain('@theme {');
    expect(tailwind.json<{ data: { content: string } }>().data.content).toContain(
      '--color-primary:'
    );
  });

  it('creates a typed theme for a known prototype and honors dry-run and overwrite guards', async () => {
    ws = createThemeWorkspace();
    const create = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'theme-fixture',
      '--id',
      'brand-light',
      '--name',
      'Brand Light',
      '--seed',
      '#0f766e',
    ]);
    expect(create.code).toBe(0);
    expect(create.json<{ data: { file: string; written: boolean } }>().data).toMatchObject({
      file: 'prototypes/theme-fixture/src/theme.ts',
      written: true,
    });

    const conflict = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'theme-fixture',
      '--id',
      'another',
      '--seed',
      '#123456',
    ]);
    expect(conflict.code).toBe(1);
    expect(conflict.json<{ error: { code: string } }>().error.code).toBe('conflict');

    const dryRun = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'theme-fixture',
      '--id',
      'brand-light',
      '--seed',
      '#0f766e',
      '--force',
      '--dry-run',
    ]);
    expect(dryRun.code).toBe(0);
    expect(dryRun.json<{ data: { written: boolean; dryRun: boolean } }>().data).toMatchObject({
      written: false,
      dryRun: true,
    });
  });

  it('rejects unknown prototypes and reports AA failing pairs for imported JSON', async () => {
    ws = createThemeWorkspace();
    const unknown = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'missing',
      '--id',
      'brand',
      '--seed',
      '#123456',
    ]);
    expect(unknown.code).toBe(3);

    ws.write('theme.json', lowContrastTheme);
    const imported = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'import',
      'theme-fixture',
      'theme.json',
    ]);
    expect(imported.code).toBe(4);
    expect(
      imported.json<{
        error: { code: string; message: string };
        data: Array<{ foreground: string }>;
      }>().error
    ).toMatchObject({ code: 'validation', message: expect.stringContaining('fails WCAG AA') });
    expect(imported.json<{ data: Array<{ foreground: string }> }>().data.length).toBeGreaterThan(0);
  });

  it('imports valid JSON theme data as a typed file', async () => {
    ws = createThemeWorkspace();
    ws.write('theme.json', validTheme);
    const customExport = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'export',
      '--from',
      'theme.json',
      '--format',
      'tokens',
    ]);
    expect(customExport.code).toBe(0);
    expect(customExport.json<{ data: { id: string; format: string } }>().data).toMatchObject({
      id: 'brand-imported',
      format: 'tokens',
    });

    const imported = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'import',
      'theme-fixture',
      'theme.json',
    ]);
    expect(imported.code).toBe(0);
    expect(imported.json<{ data: { id: string; written: boolean } }>().data).toMatchObject({
      id: 'brand-imported',
      written: true,
    });

    const created = await cli([
      '--root',
      ws.root,
      '--json',
      'theme',
      'create',
      'theme-fixture',
      '--from',
      'theme.json',
      '--force',
      '--dry-run',
    ]);
    expect(created.code).toBe(0);
    expect(created.json<{ data: { id: string; dryRun: boolean } }>().data).toMatchObject({
      id: 'brand-imported',
      dryRun: true,
    });
  });
});

describe('themeExportName', () => {
  it('turns every valid theme id into a JavaScript identifier', () => {
    expect(themeExportName('brand')).toBe('brandTheme');
    expect(themeExportName('brand-imported')).toBe('brandImportedTheme');
    expect(themeExportName('brand-2024')).toBe('brand2024Theme');
    expect(themeExportName('x-')).toBe('xTheme');
    expect(themeExportName('a--b')).toBe('aBTheme');
  });

  it('writes a buildable export for an id with a digit after a dash', async () => {
    const workspace = createThemeWorkspace();
    try {
      workspace.write('theme.json', { ...validTheme, id: 'brand-2024' });
      const imported = await cli([
        '--root',
        workspace.root,
        '--json',
        'theme',
        'import',
        'theme-fixture',
        'theme.json',
      ]);
      expect(imported.code).toBe(0);
      const source = readFileSync(
        join(workspace.root, 'prototypes', 'theme-fixture', 'src', 'theme.ts'),
        'utf8'
      );
      expect(source).toContain('export const brand2024Theme = defineTheme(');
      expect(source).not.toMatch(/export const [^ ]*-/);
    } finally {
      workspace.cleanup();
    }
  });
});

function createThemeWorkspace(): TempWorkspace {
  const workspace = createWorkspace();
  symlinkSync(join(repositoryRoot, 'node_modules'), join(workspace.root, 'node_modules'), 'dir');
  symlinkSync(join(repositoryRoot, 'packages'), join(workspace.root, 'packages'), 'dir');
  addPrototype(workspace, 'theme-fixture');
  return workspace;
}

const validTheme = {
  id: 'brand-imported',
  name: 'Imported Brand',
  description: 'Fixture theme.',
  fontFamily: 'system-ui, sans-serif',
  fontFamilyMono: 'monospace',
  radius: '0.625rem',
  density: 1,
  light: {
    background: '#ffffff',
    foreground: '#000000',
    surface: '#ffffff',
    surfaceForeground: '#000000',
    elevated: '#ffffff',
    muted: '#f3f4f6',
    mutedForeground: '#444444',
    border: '#cccccc',
    input: '#cccccc',
    ring: '#000000',
    primary: '#000000',
    primaryForeground: '#ffffff',
    secondary: '#000000',
    secondaryForeground: '#ffffff',
    accent: '#000000',
    accentForeground: '#ffffff',
    destructive: '#000000',
    destructiveForeground: '#ffffff',
    success: '#000000',
    successForeground: '#ffffff',
    warning: '#000000',
    warningForeground: '#ffffff',
    info: '#000000',
    infoForeground: '#ffffff',
    sidebar: '#ffffff',
    sidebarForeground: '#000000',
    sidebarBorder: '#cccccc',
    chart1: '#111111',
    chart2: '#222222',
    chart3: '#333333',
    chart4: '#444444',
    chart5: '#555555',
    shadow: '#000000',
  },
  dark: {
    background: '#000000',
    foreground: '#ffffff',
    surface: '#000000',
    surfaceForeground: '#ffffff',
    elevated: '#000000',
    muted: '#111111',
    mutedForeground: '#ffffff',
    border: '#cccccc',
    input: '#cccccc',
    ring: '#ffffff',
    primary: '#ffffff',
    primaryForeground: '#000000',
    secondary: '#ffffff',
    secondaryForeground: '#000000',
    accent: '#ffffff',
    accentForeground: '#000000',
    destructive: '#ffffff',
    destructiveForeground: '#000000',
    success: '#ffffff',
    successForeground: '#000000',
    warning: '#ffffff',
    warningForeground: '#000000',
    info: '#ffffff',
    infoForeground: '#000000',
    sidebar: '#000000',
    sidebarForeground: '#ffffff',
    sidebarBorder: '#cccccc',
    chart1: '#111111',
    chart2: '#222222',
    chart3: '#333333',
    chart4: '#444444',
    chart5: '#555555',
    shadow: '#000000',
  },
};

const lowContrastTheme = {
  ...validTheme,
  id: 'low-contrast',
  light: { ...validTheme.light, foreground: '#999999' },
};
