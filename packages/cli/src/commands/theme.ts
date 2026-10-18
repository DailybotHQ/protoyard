import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, resolve, sep } from 'node:path';
import { type Theme, ThemeSchema } from '@protoyard/core';
import {
  BUILTIN_THEMES,
  contrastRatio,
  createThemeFromSeed,
  getLibraryThemeMeta,
  listThemeLibrary,
  loadLibraryTheme,
  TEXT_CONTRAST_PAIRS,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { exportTheme, type ThemeExportFormat } from '../lib/theme-export.ts';
import { resolveTarget } from '../lib/workspace.ts';

const THEME_FILE = 'src/theme.ts';

export const themeListCommand: Handler = async (): Promise<CommandResult> => {
  const themes = [
    ...BUILTIN_THEMES.map((theme) => ({ id: theme.id, name: theme.name, source: 'builtin' })),
    ...listThemeLibrary().map((theme) => ({ ...theme, source: 'library' })),
  ];
  return {
    data: { themes },
    render(out) {
      for (const theme of themes) out.always(`${theme.id}\t${theme.name}\t${theme.source}`);
    },
  };
};

export const themeCreateCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0], 'prototype');
  const id = opt(options, 'id');
  const name = opt(options, 'name') ?? titleFromId(id ?? '');
  const seed = opt(options, 'seed');
  const secondary = opt(options, 'secondary');
  const sourceFile = opt(options, 'from');
  if (Boolean(seed) === Boolean(sourceFile)) {
    throw new CliError('usage', 'Provide exactly one of --seed or --from.');
  }
  if (seed && !id) throw new CliError('usage', 'Provide --id when creating a theme from --seed.');
  const theme = sourceFile
    ? readTheme(resolve(ctx.root, sourceFile))
    : buildSeedTheme(id as string, name, seed as string, secondary);
  return writeTheme(ctx.root, dir, entry.slug, theme, options);
};

export const themeImportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0], 'prototype');
  if (!args[1]) throw new CliError('usage', 'Missing <file>.');
  const theme = readTheme(resolve(ctx.root, args[1]));
  return writeTheme(ctx.root, dir, entry.slug, theme, options);
};

export const themeExportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const id = args[0];
  const sourceFile = opt(options, 'from');
  if (Boolean(id) === Boolean(sourceFile)) {
    throw new CliError('usage', 'Provide exactly one of <theme-id> or --from.');
  }
  let theme: Theme;
  if (sourceFile) {
    theme = readTheme(resolve(ctx.root, sourceFile));
  } else {
    const themeId = id as string;
    const builtin = BUILTIN_THEMES.find((candidate) => candidate.id === themeId);
    const library = getLibraryThemeMeta(themeId);
    if (!builtin && !library) {
      throw new CliError('not_found', `Unknown theme "${themeId}".`, {
        hint: `Known themes: ${[...BUILTIN_THEMES.map((candidate) => candidate.id), ...listThemeLibrary().map((candidate) => candidate.id)].join(', ')}`,
      });
    }
    theme = builtin ?? (await loadLibraryTheme(themeId));
  }
  const format = (opt(options, 'format') ?? 'css') as ThemeExportFormat;
  const content = exportTheme(theme, format);
  return {
    data: { id: theme.id, format, content },
    render(out) {
      out.always(content.trimEnd());
    },
  };
};

function buildSeedTheme(id: string, name: string, seed: string, secondary?: string): Theme {
  try {
    return validateTheme(
      createThemeFromSeed({ id, name, seed, ...(secondary ? { secondary } : {}) })
    );
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('validation', error instanceof Error ? error.message : String(error));
  }
}

function readTheme(file: string): Theme {
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CliError(
      'validation',
      `Could not read theme JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  try {
    return validateTheme(ThemeSchema.parse(input));
  } catch (error) {
    if (error instanceof CliError) throw error;
    throw new CliError('validation', error instanceof Error ? error.message : String(error));
  }
}

function validateTheme(theme: Theme): Theme {
  for (const mode of ['light', 'dark'] as const) {
    const palette = theme[mode];
    const failures = [
      ...TEXT_CONTRAST_PAIRS.map(([foreground, background]) => ({
        foreground,
        background,
        minimum: 4.5,
      })),
      ...UI_CONTRAST_PAIRS.map(([foreground, background]) => ({
        foreground,
        background,
        minimum: 3,
      })),
    ].flatMap(({ foreground, background, minimum }) => {
      try {
        const ratio = contrastRatio(palette[foreground], palette[background]);
        return ratio >= minimum ? [] : [{ foreground, background, minimum, ratio }];
      } catch {
        return [{ foreground, background, minimum, ratio: 0 }];
      }
    });
    if (failures.length > 0) {
      throw new CliError('validation', `Theme "${theme.id}" fails WCAG AA in ${mode} mode.`, {
        data: failures,
      });
    }
  }
  return theme;
}

function writeTheme(
  root: string,
  prototypeDir: string,
  slug: string,
  theme: Theme,
  options: Record<string, unknown>
): CommandResult {
  const file = resolve(prototypeDir, THEME_FILE);
  const relative = file.startsWith(`${root}${sep}`) ? file.slice(root.length + 1) : basename(file);
  const force = flag(options, 'force');
  const dryRun = flag(options, 'dryRun');
  if (existsSync(file) && !force) {
    throw new CliError('conflict', `${relative} already exists.`, {
      hint: 'Pass --force to replace the existing theme file.',
    });
  }
  const source = `import { defineTheme } from '@protoyard/core';\n\nexport const ${theme.id.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase())}Theme = defineTheme(${JSON.stringify(theme, null, 2)});\n`;
  if (!dryRun) {
    mkdirSync(resolve(prototypeDir, 'src'), { recursive: true });
    writeFileSync(file, source, 'utf8');
  }
  return {
    data: { slug, id: theme.id, file: relative, dryRun, written: !dryRun },
    render(out) {
      out.always(
        `${dryRun ? 'Would write' : 'Wrote'} ${relative}${dryRun ? `\n${source.trimEnd()}` : ''}`
      );
    },
  };
}

function titleFromId(id: string): string {
  return id
    .split('-')
    .map((part) => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ');
}
