// @vitest-environment node

import { violetTheme } from '@protoyard/themes';
import { afterEach, describe, expect, it } from 'vitest';
import { exportTheme } from '../src/lib/theme-export.ts';
import { cli, createWorkspace, type TempWorkspace } from './helpers.ts';

describe('protoyard theme import from design tokens', () => {
  let workspace: TempWorkspace | undefined;

  afterEach(() => {
    workspace?.cleanup();
    workspace = undefined;
  });

  it('returns a validated theme, contrast report, CSS and Tailwind tokens', async () => {
    workspace = createWorkspace();
    workspace.write('tokens.json', JSON.parse(exportTheme(violetTheme, 'tokens')));

    const result = await cli([
      '--root',
      workspace.root,
      '--json',
      'theme',
      'import',
      'tokens.json',
      '--name',
      'brand-kit',
    ]);

    expect(result.code).toBe(0);
    expect(
      result.json<{
        data: {
          id: string;
          theme: { id: string };
          contrast: { light: { passed: boolean }; dark: { passed: boolean } };
          css: string;
          tailwind: string;
        };
      }>().data
    ).toMatchObject({
      id: 'brand-kit',
      theme: { id: 'brand-kit' },
      contrast: { light: { passed: true }, dark: { passed: true } },
    });
    const data = result.json<{ data: { css: string; tailwind: string } }>().data;
    expect(data.css).toContain('--tx-background:');
    expect(data.tailwind).toContain('@theme {');
  });

  it('returns the failing contrast pairs and rejects a low-contrast token file', async () => {
    workspace = createWorkspace();
    const tokens = JSON.parse(exportTheme(violetTheme, 'tokens'));
    tokens.color.light.foreground.$value = '#999999';
    workspace.write('low-contrast.json', tokens);

    const result = await cli([
      '--root',
      workspace.root,
      '--json',
      'theme',
      'import',
      'low-contrast.json',
      '--name',
      'low-contrast-kit',
    ]);

    expect(result.code).toBe(4);
    expect(
      result.json<{
        error: { code: string; message: string };
        data: {
          failures: Array<{ foreground: string }>;
          contrast: { light: { passed: boolean }; dark: { passed: boolean } };
        };
      }>()
    ).toMatchObject({
      error: {
        code: 'validation',
        message: expect.stringContaining('fails WCAG AA in light mode'),
      },
      data: {
        failures: expect.arrayContaining([expect.objectContaining({ foreground: 'foreground' })]),
        contrast: { light: { passed: false }, dark: { passed: true } },
      },
    });
  });

  it('requires --name for a token file and keeps the prototype theme import signature', async () => {
    workspace = createWorkspace();
    workspace.write('tokens.json', JSON.parse(exportTheme(violetTheme, 'tokens')));

    const missingName = await cli([
      '--root',
      workspace.root,
      '--json',
      'theme',
      'import',
      'tokens.json',
    ]);
    expect(missingName.code).toBe(2);

    const missingThemeFile = await cli([
      '--root',
      workspace.root,
      '--json',
      'theme',
      'import',
      'sample-prototype',
    ]);
    expect(missingThemeFile.code).toBe(2);
  });
});
