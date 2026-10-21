import { existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve, sep } from 'node:path';
import { PrototypeManifestSchema, type Theme, ThemeSchema } from '@protoyard/core';
import {
  BUILTIN_THEMES,
  contrastRatio,
  createThemeFromSeed,
  getLibraryThemeMeta,
  importThemeTokens,
  listCollections,
  listThemeLibrary,
  loadLibraryTheme,
  searchThemeLibrary,
  TEXT_CONTRAST_PAIRS,
  THEME_COLLECTIONS,
  ThemeTokenContrastError,
  UI_CONTRAST_PAIRS,
} from '@protoyard/themes';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { exportTheme, type ThemeExportFormat } from '../lib/theme-export.ts';
import { resolveTarget } from '../lib/workspace.ts';

const THEME_FILE = 'src/theme.ts';

export const themeListCommand: Handler = async (_ctx, _args, options): Promise<CommandResult> => {
  const collection = opt(options, 'collection');
  const search = opt(options, 'search')?.trim();
  if (collection && !THEME_COLLECTIONS.includes(collection as (typeof THEME_COLLECTIONS)[number])) {
    throw new CliError('usage', `Unknown theme collection "${collection}".`, {
      hint: `Choose from: ${listCollections()
        .map(({ id }) => id)
        .join(', ')}.`,
    });
  }
  const library = search ? searchThemeLibrary(search) : listThemeLibrary();
  const filteredLibrary = library.filter((theme) => !collection || theme.collection === collection);
  const themes = [
    ...(!collection && !search
      ? BUILTIN_THEMES.map((theme) => ({ id: theme.id, name: theme.name, source: 'builtin' }))
      : []),
    ...filteredLibrary.map((theme) => ({ ...theme, source: 'library' })),
  ];
  return {
    data: {
      count: themes.length,
      themes,
      ...(collection ? { collection } : {}),
      ...(search ? { search } : {}),
    },
    render(out) {
      for (const theme of themes) out.always(`${theme.id}\t${theme.name}\t${theme.source}`);
    },
  };
};

export const themeShowCommand: Handler = async (_ctx, args): Promise<CommandResult> => {
  const id = args[0];
  if (!id) throw new CliError('usage', 'Missing <theme-id>.');
  const { theme, source } = await resolveTheme(id);
  const swatches = Object.fromEntries(
    (['light', 'dark'] as const).map((mode) => [
      mode,
      Object.fromEntries(
        (['primary', 'secondary', 'accent', 'background', 'foreground'] as const).map((token) => [
          token,
          theme[mode][token],
        ])
      ),
    ])
  ) as Record<
    'light' | 'dark',
    Record<'primary' | 'secondary' | 'accent' | 'background' | 'foreground', string>
  >;
  const contrast = Object.fromEntries(
    (['light', 'dark'] as const).map((mode) => [
      mode,
      {
        text: contrastSummary(theme, mode, TEXT_CONTRAST_PAIRS, 4.5),
        ui: contrastSummary(theme, mode, UI_CONTRAST_PAIRS, 3),
      },
    ])
  ) as Record<
    'light' | 'dark',
    {
      text: ReturnType<typeof contrastSummary>;
      ui: ReturnType<typeof contrastSummary>;
    }
  >;
  return {
    data: { id: theme.id, name: theme.name, source, swatches, contrast },
    render(out) {
      out.always(`${out.c.bold(theme.name)} (${source}) · ${theme.id}`);
      for (const mode of ['light', 'dark'] as const) {
        const colors = swatches[mode];
        const checks = contrast[mode];
        out.always(
          `${mode}: primary ${colors.primary} · secondary ${colors.secondary} · accent ${colors.accent} · background ${colors.background} · foreground ${colors.foreground}`
        );
        out.always(
          `  Contrast: text ${checks.text.passed ? 'PASS' : 'FAIL'} (${checks.text.passedCount}/${checks.text.total}); UI ${checks.ui.passed ? 'PASS' : 'FAIL'} (${checks.ui.passedCount}/${checks.ui.total})`
        );
      }
    },
  };
};

export const themeUseCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slug = args[0];
  const themeId = args[1];
  if (!slug || !themeId) throw new CliError('usage', 'Provide <slug> and <theme-id>.');
  await resolveTheme(themeId);
  const { entry, dir } = await resolveTarget(ctx, slug, 'prototype');
  const file = join(dir, 'protoyard.json');
  if (lstatSync(file).isSymbolicLink()) {
    throw new CliError('unsafe_path', 'Refusing to write through a symlinked protoyard.json.');
  }
  let input: unknown;
  try {
    input = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    throw new CliError(
      'validation',
      `Could not read ${entry.path}/protoyard.json: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  const parsed = PrototypeManifestSchema.safeParse(input);
  if (!parsed.success || !input || typeof input !== 'object' || Array.isArray(input)) {
    throw new CliError(
      'validation',
      `Invalid ${entry.path}/protoyard.json; refusing to update it.`,
      {
        data: parsed.success
          ? undefined
          : parsed.error.issues.map((issue) => ({
              path: issue.path.join('.'),
              message: issue.message,
            })),
      }
    );
  }
  const dryRun = flag(options, 'dryRun');
  const updated = { ...(input as Record<string, unknown>), defaultTheme: themeId };
  if (!dryRun) writeFileSync(file, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
  const relative = file.startsWith(`${ctx.root}${sep}`)
    ? file.slice(ctx.root.length + 1)
    : basename(file);
  return {
    data: { slug: entry.slug, id: themeId, file: relative, dryRun, written: !dryRun },
    render(out) {
      out.always(
        `${dryRun ? 'Would set' : 'Set'} ${relative} defaultTheme to "${themeId}"${dryRun ? '' : '.'}`
      );
    },
  };
};

async function resolveTheme(id: string): Promise<{ theme: Theme; source: 'builtin' | 'library' }> {
  const builtin = BUILTIN_THEMES.find((candidate) => candidate.id === id);
  if (builtin) return { theme: builtin, source: 'builtin' };
  if (getLibraryThemeMeta(id)) return { theme: await loadLibraryTheme(id), source: 'library' };
  throw new CliError('not_found', `Unknown theme "${id}".`, {
    hint: `Known themes: ${[...BUILTIN_THEMES.map(({ id: themeId }) => themeId), ...listThemeLibrary().map(({ id: themeId }) => themeId)].join(', ')}`,
  });
}

function contrastSummary(
  theme: Theme,
  mode: 'light' | 'dark',
  pairs: readonly (readonly [string, string])[],
  minimum: number
) {
  const results = pairs.map(([foreground, background]) => {
    const ratio = contrastRatio(
      theme[mode][foreground as keyof Theme['light']],
      theme[mode][background as keyof Theme['light']]
    );
    return { foreground, background, ratio, minimum, passes: ratio >= minimum };
  });
  return {
    passed: results.every(({ passes }) => passes),
    passedCount: results.filter(({ passes }) => passes).length,
    total: results.length,
    pairs: results,
  };
}

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
  const tokenId = opt(options, 'name');
  if (!args[1] && tokenId) {
    const file = args[0];
    if (!file) throw new CliError('usage', 'Missing <tokens.json>.');
    let input: unknown;
    try {
      input = JSON.parse(readFileSync(resolve(ctx.root, file), 'utf8'));
    } catch (error) {
      throw new CliError(
        'validation',
        `Could not read design tokens: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    try {
      const { theme, contrast } = importThemeTokens(input, { id: tokenId });
      return {
        data: {
          id: theme.id,
          name: theme.name,
          theme,
          contrast,
          css: exportTheme(theme, 'css'),
          tailwind: exportTheme(theme, 'tailwind'),
        },
        render(out) {
          out.always(`Imported ${theme.name} (${theme.id}) from design tokens.`);
          for (const mode of ['light', 'dark'] as const) {
            const report = contrast[mode];
            out.always(
              `${mode}: WCAG AA ${report.passed ? 'PASS' : 'FAIL'} (${report.passedCount}/${report.total} pairs)`
            );
          }
          out.always('Theme JSON, CSS variables and Tailwind tokens are available with --json.');
        },
      };
    } catch (error) {
      if (error instanceof ThemeTokenContrastError) {
        throw new CliError('validation', error.message, {
          data: { failures: error.failures, contrast: error.contrast },
        });
      }
      throw new CliError('validation', error instanceof Error ? error.message : String(error));
    }
  }
  if (tokenId) {
    throw new CliError('usage', 'Use --name only with `theme import <tokens.json> --name <id>`.');
  }
  if (!args[0] || !args[1]) {
    throw new CliError('usage', 'Provide <slug> and <file>, or <tokens.json> with --name <id>.');
  }
  const { entry, dir } = await resolveTarget(ctx, args[0], 'prototype');
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
  if (
    input &&
    typeof input === 'object' &&
    !Array.isArray(input) &&
    (input as Record<string, unknown>).format === 'protoyard-theme/v1'
  ) {
    input = (input as Record<string, unknown>).theme;
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
  const source = `import { defineTheme } from '@protoyard/core';\n\nexport const ${themeExportName(theme.id)} = defineTheme(${JSON.stringify(theme, null, 2)});\n`;
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

/**
 * The `src/theme.ts` export name for a theme id: `brand-2024` → `brand2024Theme`.
 * Theme ids allow digits after a dash and a trailing dash, which a naive
 * `-<letter>` camel-case would leave in the name and break the build.
 */
export function themeExportName(id: string): string {
  const name = `${id.replace(/-+([a-z0-9])/g, (_match, char: string) => char.toUpperCase()).replace(/-+$/, '')}Theme`;
  if (!/^[A-Za-z_$][\w$]*$/.test(name)) {
    throw new CliError('validation', `Theme id "${id}" cannot be turned into an export name.`);
  }
  return name;
}
