import { existsSync, lstatSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { PrototypeManifestSchema } from '@protoyard/core';
import {
  BUILTIN_THEMES,
  compileDesignSystemDocument,
  createDesignSystem,
  type DesignSystem,
  type DesignSystemExportFormat,
  type DesignSystemInput,
  designSystemContrast,
  designSystemFromTheme,
  exportDesignSystem,
  findLibraryThemeMeta,
  loadLibraryTheme,
} from '@protoyard/themes';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { resolveTarget } from '../lib/workspace.ts';

/**
 * `protoyard ds`: Texuli design systems (`format: "texuli/design-system"`).
 *
 * - `ds new <id>` makes a document from a brief or a few inputs, or imports a
 *   Protoyard theme (`--from-theme`), validates and compiles it, and writes
 *   `design-systems/<id>.json`.
 * - `ds validate <file>` checks an untrusted document and compiles it.
 * - `ds export <file>` writes CSS variables, a Tailwind preset or compiled JSON.
 * - `ds use <slug> <file>` compiles it into `src/design-system.ts`, adds the
 *   theme to `definePrototype({ themes })` and makes it the default theme.
 *
 * Every document is validated by Texuli at `trust: 'untrusted'` before it is
 * compiled or written; the same document always compiles to the same hash.
 */

const DESIGN_SYSTEM_DIR = 'design-systems';
const PROTOTYPE_FILE = 'src/prototype.ts';
const DESIGN_SYSTEM_FILE = 'src/design-system.ts';
const EXPORT_NAME = 'designSystemTheme';
/** Texuli's import cap for JSON text (1 MiB). */
const MAX_DOCUMENT_BYTES = 1_048_576;

const SHAPES = ['sharp', 'rounded', 'pill'] as const;
const DENSITIES = ['dense', 'compact', 'comfortable', 'spacious'] as const;
const MOTIONS = ['none', 'subtle', 'standard', 'expressive'] as const;
const CONTRASTS = ['AA', 'AAA'] as const;

function choice<T extends string>(
  options: Record<string, unknown>,
  key: string,
  label: string,
  values: readonly T[]
): T | undefined {
  const value = opt(options, key);
  if (value === undefined) return undefined;
  if (!values.includes(value as T)) {
    throw new CliError('usage', `Unknown ${label} "${value}".`, {
      hint: `Choose from: ${values.join(', ')}.`,
    });
  }
  return value as T;
}

function relativeTo(root: string, file: string): string {
  return file.startsWith(`${root}${sep}`) ? file.slice(root.length + 1) : basename(file);
}

/** A path inside the workspace, never through a symlink. */
function workspaceFile(root: string, file: string): string {
  const absolute = resolve(root, file);
  const inside = relative(root, absolute);
  if (inside.startsWith('..') || resolve(root, inside) !== absolute) {
    throw new CliError('unsafe_path', `${file} is outside the workspace.`);
  }
  if (existsSync(absolute) && lstatSync(absolute).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to use the symlink ${file}.`);
  }
  return absolute;
}

function readDocument(root: string, file: string): unknown {
  const absolute = workspaceFile(root, file);
  if (!existsSync(absolute)) throw new CliError('not_found', `No such file: ${file}.`);
  if (statSync(absolute).size > MAX_DOCUMENT_BYTES) {
    throw new CliError('validation', `${file} is larger than 1 MiB.`);
  }
  try {
    return JSON.parse(readFileSync(absolute, 'utf8')) as unknown;
  } catch (error) {
    throw new CliError(
      'validation',
      `Could not read ${file}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function compileOrFail(document: unknown, what: string) {
  const result = await compileDesignSystemDocument(document);
  if (!result.ok) {
    throw new CliError('validation', `${what} is not a valid design system.`, {
      data: { errors: result.errors },
      hint: result.errors.slice(0, 3).join(' · '),
    });
  }
  return result;
}

function summary(
  result: Extract<Awaited<ReturnType<typeof compileDesignSystemDocument>>, { ok: true }>
) {
  const { compiled } = result;
  return {
    id: compiled.id,
    name: compiled.name,
    version: compiled.version,
    hash: compiled.hash,
    modes: compiled.modes,
    variables: Object.keys(compiled.vars[compiled.modes[0] ?? 'light'] ?? {}).length,
    contrast: designSystemContrast(compiled),
    adjustments: compiled.report.adjustments.length,
    warnings: compiled.report.warnings.map((warning) => `${warning.path}: ${warning.message}`),
  };
}

async function themeById(id: string) {
  const builtin = BUILTIN_THEMES.find((theme) => theme.id === id);
  if (builtin) return builtin;
  if (await findLibraryThemeMeta(id)) return loadLibraryTheme(id);
  throw new CliError('not_found', `Unknown theme "${id}".`, {
    hint: 'List themes with `protoyard theme list`.',
  });
}

export const dsNewCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const id = args[0];
  if (!id) throw new CliError('usage', 'Missing <id>.');
  const fromTheme = opt(options, 'fromTheme');
  const radius = opt(options, 'radius');
  const input: DesignSystemInput = {
    id,
    ...(opt(options, 'name') ? { name: opt(options, 'name') as string } : {}),
    ...(opt(options, 'brief') ? { brief: opt(options, 'brief') as string } : {}),
    ...(opt(options, 'brand') ? { brand: opt(options, 'brand') as string } : {}),
    ...(opt(options, 'secondary') ? { secondary: opt(options, 'secondary') as string } : {}),
    ...(opt(options, 'accent') ? { accent: opt(options, 'accent') as string } : {}),
    ...(opt(options, 'font') ? { font: opt(options, 'font') as string } : {}),
    ...(opt(options, 'headingFont') ? { headingFont: opt(options, 'headingFont') as string } : {}),
    ...(opt(options, 'monoFont') ? { monoFont: opt(options, 'monoFont') as string } : {}),
  };
  const shape = choice(options, 'shape', 'shape', SHAPES);
  const density = choice(options, 'density', 'density', DENSITIES);
  const motion = choice(options, 'motion', 'motion', MOTIONS);
  const contrast = choice(options, 'contrast', 'contrast target', CONTRASTS);
  if (shape) input.shape = shape;
  if (density) input.density = density;
  if (motion) input.motion = motion;
  if (contrast) input.contrast = contrast;
  if (radius !== undefined) {
    const px = Number(radius);
    if (!Number.isFinite(px) || px < 0 || px > 64) {
      throw new CliError('usage', '--radius takes a number of pixels from 0 to 64.');
    }
    input.radius = px;
  }

  let document: DesignSystem;
  let notes: string[] = [];
  if (fromTheme) {
    const extra = Object.keys(input).filter((key) => key !== 'id' && key !== 'name');
    if (extra.length > 0) {
      throw new CliError('usage', '--from-theme imports a theme as it is; drop the other inputs.', {
        hint: `Remove: ${extra.join(', ')}.`,
      });
    }
    const imported = await designSystemFromTheme(await themeById(fromTheme), {
      id,
      ...(input.name ? { name: input.name } : {}),
    });
    document = imported.document;
    notes = imported.losses.map((loss) => `${loss.path}: ${loss.reason}`);
  } else {
    const created = await createDesignSystem(input);
    if (!created.ok) {
      throw new CliError('validation', 'Could not create the design system.', {
        data: { errors: created.errors },
        hint: created.errors.slice(0, 3).join(' · '),
      });
    }
    document = created.document;
    notes = created.warnings;
  }
  const result = await compileOrFail(document, `Design system "${id}"`);

  const out = workspaceFile(ctx.root, opt(options, 'out') ?? join(DESIGN_SYSTEM_DIR, `${id}.json`));
  const file = relativeTo(ctx.root, out);
  const dryRun = flag(options, 'dryRun');
  if (existsSync(out) && !flag(options, 'force')) {
    throw new CliError('conflict', `${file} already exists.`, {
      hint: 'Pass --force to replace it.',
    });
  }
  const text = `${JSON.stringify(document, null, 2)}\n`;
  if (!dryRun) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text, 'utf8');
  }
  const data = { ...summary(result), file, dryRun, written: !dryRun, notes, document };
  return {
    data,
    render(o) {
      o.always(
        `${dryRun ? 'Would write' : 'Wrote'} ${file}: ${data.name} (${data.id}@${data.version})`
      );
      renderSummary(o, data);
      for (const note of notes) o.always(`  note: ${note}`);
    },
  };
};

function renderSummary(
  o: Parameters<NonNullable<CommandResult['render']>>[0],
  data: ReturnType<typeof summary>
) {
  o.always(`  ${data.variables} --tx-* variables per mode · hash ${data.hash.slice(0, 12)}`);
  for (const [mode, report] of Object.entries(data.contrast)) {
    o.always(`  ${mode}: contrast ${report.passed}/${report.total} pairs pass`);
  }
}

export const dsValidateCommand: Handler = async (ctx, args): Promise<CommandResult> => {
  const file = args[0];
  if (!file) throw new CliError('usage', 'Missing <file>.');
  const result = await compileOrFail(readDocument(ctx.root, file), file);
  const data = { ...summary(result), file, valid: true };
  return {
    data,
    render(o) {
      o.always(`${file} is a valid design system: ${data.name} (${data.id}@${data.version})`);
      renderSummary(o, data);
    },
  };
};

export const dsExportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const file = args[0];
  if (!file) throw new CliError('usage', 'Missing <file>.');
  const format = (opt(options, 'format') ?? 'css') as DesignSystemExportFormat;
  const result = await compileOrFail(readDocument(ctx.root, file), file);
  const content = await exportDesignSystem(result.compiled, format);
  return {
    data: { id: result.compiled.id, format, content },
    render(o) {
      o.always(content.trimEnd());
    },
  };
};

/**
 * Adds `designSystemTheme` to `src/prototype.ts`: the import, then the theme
 * in `definePrototype({ themes })` (a new `themes` key when there is none).
 * Returns the new source, the same source when already wired, or `null` when
 * the file does not have the shape this edit understands.
 */
export function wireDesignSystem(source: string): string | null {
  const importLine = `import { ${EXPORT_NAME} } from './design-system.ts';`;
  let next = source;
  if (!next.includes(importLine)) {
    const imports = [...next.matchAll(/^import [^;]+;\s*$/gm)];
    const last = imports.at(-1);
    if (!last || last.index === undefined) return null;
    const end = last.index + last[0].trimEnd().length;
    next = `${next.slice(0, end)}\n${importLine}${next.slice(end)}`;
  }
  if (new RegExp(`themes:\\s*\\[[^\\]]*\\b${EXPORT_NAME}\\b`).test(next)) return next;
  const themes = /themes:\s*\[/.exec(next);
  if (themes) {
    const at = themes.index + themes[0].length;
    const empty = /^\s*\]/.test(next.slice(at));
    return `${next.slice(0, at)}${EXPORT_NAME}${empty ? '' : ', '}${next.slice(at)}`;
  }
  const define = /definePrototype\(\{\n/.exec(next);
  if (!define) return null;
  const at = define.index + define[0].length;
  return `${next.slice(0, at)}  themes: [${EXPORT_NAME}],\n${next.slice(at)}`;
}

/** True when the prototype's package.json lists @protoyard/runtime (a dependency or a devDependency). */
function dependsOnRuntime(dir: string): boolean {
  try {
    const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    return Boolean(
      manifest.dependencies?.['@protoyard/runtime'] ??
        manifest.devDependencies?.['@protoyard/runtime']
    );
  } catch {
    return false;
  }
}

export const dsUseCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slug = args[0];
  const file = args[1];
  if (!slug || !file) throw new CliError('usage', 'Provide <slug> and <file>.');
  const result = await compileOrFail(readDocument(ctx.root, file), file);
  const { entry, dir } = await resolveTarget(ctx, slug, 'prototype');
  const manifestFile = join(dir, 'protoyard.json');
  const prototypeFile = join(dir, PROTOTYPE_FILE);
  const designSystemFile = join(dir, DESIGN_SYSTEM_FILE);
  for (const target of [manifestFile, prototypeFile, designSystemFile]) {
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
      throw new CliError(
        'unsafe_path',
        `Refusing to write through the symlink ${relativeTo(ctx.root, target)}.`
      );
    }
  }
  if (!existsSync(prototypeFile)) {
    throw new CliError('validation', `${entry.path}/${PROTOTYPE_FILE} does not exist.`);
  }
  const manifestInput = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
  if (!PrototypeManifestSchema.safeParse(manifestInput).success) {
    throw new CliError(
      'validation',
      `Invalid ${entry.path}/protoyard.json; refusing to update it.`
    );
  }
  if (!dependsOnRuntime(dir)) {
    throw new CliError(
      'validation',
      `${entry.path} does not depend on @protoyard/runtime, which src/design-system.ts imports.`,
      { hint: 'Add "@protoyard/runtime": "workspace:*" to its package.json and run pnpm install.' }
    );
  }
  const prototypeSource = readFileSync(prototypeFile, 'utf8');
  const wired = wireDesignSystem(prototypeSource);
  if (wired === null) {
    throw new CliError(
      'validation',
      `${entry.path}/${PROTOTYPE_FILE} has no definePrototype({ … }) call this command can edit.`,
      {
        hint: `Add \`import { ${EXPORT_NAME} } from './design-system.ts';\` and \`themes: [${EXPORT_NAME}]\` by hand.`,
      }
    );
  }
  if (existsSync(designSystemFile) && !flag(options, 'force')) {
    const current = readFileSync(designSystemFile, 'utf8');
    if (!current.includes(`"id": ${JSON.stringify(result.compiled.id)}`)) {
      throw new CliError(
        'conflict',
        `${entry.path}/${DESIGN_SYSTEM_FILE} holds another design system.`,
        {
          hint: 'Pass --force to replace it.',
        }
      );
    }
  }
  const source = `// Written by \`protoyard ds use\` from ${relativeTo(ctx.root, resolve(ctx.root, file))} (hash ${result.compiled.hash.slice(0, 12)}).
// Re-run the command to update it; edit the design-system document, not this file.
import { defineDesignSystemTheme, type ShippedDesignSystem } from '@protoyard/runtime';

const compiled: ShippedDesignSystem = ${JSON.stringify(result.shipped, null, 2)};

export const ${EXPORT_NAME} = defineDesignSystemTheme(compiled);
`;
  const dryRun = flag(options, 'dryRun');
  const manifest = { ...manifestInput, defaultTheme: result.compiled.id };
  if (!dryRun) {
    writeFileSync(designSystemFile, source, 'utf8');
    if (wired !== prototypeSource) writeFileSync(prototypeFile, wired, 'utf8');
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }
  const files = [
    designSystemFile,
    ...(wired !== prototypeSource ? [prototypeFile] : []),
    manifestFile,
  ].map((target) => relativeTo(ctx.root, target));
  const data = {
    ...summary(result),
    slug: entry.slug,
    defaultTheme: result.compiled.id,
    files,
    bytes: Buffer.byteLength(source),
    dryRun,
    written: !dryRun,
  };
  return {
    data,
    render(o) {
      o.always(
        `${dryRun ? 'Would apply' : 'Applied'} ${data.name} (${data.id}) to ${entry.slug}: ${files.join(', ')}`
      );
      renderSummary(o, data);
    },
  };
};
