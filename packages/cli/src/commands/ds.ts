import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrototypeManifestSchema, type Theme, ThemeSchema } from '@protoyard/core';
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
import { GENERATED_MARKER } from '../lib/codegen/header.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import {
  APPROVAL_FILE,
  type Approval,
  COMPONENTS_FILE,
  componentDrift,
  contentHash,
  DESIGN_SYSTEMS_DIR,
  type DesignSystemLocation,
  DOCUMENT_FILE,
  emptyComponentsManifest,
  isDesignSystemId,
  locateDesignSystem,
  lockRefusal,
  readApproval,
  readComponents,
  readDocumentFile,
} from '../lib/design-systems.ts';
import { inspectSpec } from '../lib/inspect.ts';
import { CliError } from '../lib/output.ts';
import { workspaceLayout } from '../lib/paths.ts';
import { resolvePackageBin, run } from '../lib/process.ts';
import { CLI_VERSION, resolveTarget } from '../lib/workspace.ts';
import { workspaceFile } from '../lib/workspace-file.ts';
import { specForPrototype } from './spec.ts';

/**
 * `protoyard ds`: Texuli design systems (`format: "texuli/design-system"`).
 *
 * - `ds new <id>` makes a document from a brief or a few inputs, or imports a
 *   Protoyard theme (`--from-theme`), validates and compiles it, and writes
 *   the folder `design-systems/<id>/` (or a flat file with `--out`).
 * - `ds validate <file>` checks an untrusted document and compiles it.
 * - `ds export <file>` writes CSS variables, a Tailwind preset or compiled JSON.
 * - `ds use <slug> <file>` compiles it into `src/design-system.ts`, adds the
 *   theme to `definePrototype({ themes })` and makes it the default theme.
 *
 * Every document is validated by Texuli at `trust: 'untrusted'` before it is
 * compiled or written; the same document always compiles to the same hash.
 */

const PROTOTYPE_FILE = 'src/prototype.ts';
const DESIGN_SYSTEM_FILE = 'src/design-system.ts';
const EXPORT_NAME = 'designSystemTheme';

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

function readDocument(root: string, ref: string): unknown {
  return readDocumentFile(locateDesignSystem(root, ref));
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

const themeRunnerFile = import.meta.url.endsWith('.ts')
  ? '../runners/load-theme.ts'
  : '../runners/load-theme.js';
const RESULT_MARKER = '@@PROTOYARD_RESULT@@';

/**
 * A prototype's own theme, from a workspace module (`--from-theme-file`). The
 * module runs under tsx in a child process, the same trust level as
 * `src/prototype.ts` in `spec` and `validate`; its JSON is checked with
 * `ThemeSchema` before use.
 */
async function themeFromFile(root: string, file: string, exportName?: string): Promise<Theme> {
  const path = workspaceFile(root, file);
  if (!existsSync(path) || !statSync(path).isFile()) {
    throw new CliError('not_found', `No such file: ${relativeTo(root, path)}.`);
  }
  const cliPackageDir = fileURLToPath(new URL('../..', import.meta.url));
  const tsx = resolvePackageBin('tsx', 'tsx', [root, dirname(path), cliPackageDir]);
  if (!tsx)
    throw new CliError('not_found', 'tsx is not installed.', { hint: 'Run `pnpm install`.' });
  const runner = fileURLToPath(new URL(themeRunnerFile, import.meta.url));
  const result = await run(
    process.execPath,
    [tsx, runner, path, ...(exportName ? [exportName] : [])],
    { cwd: dirname(path), timeoutMs: 60_000 }
  );
  const marker = result.stdout.lastIndexOf(RESULT_MARKER);
  const payload =
    marker === -1
      ? {
          fatal: (result.stderr || result.spawnError || 'no output')
            .trim()
            .split('\n')
            .slice(-4)
            .join(' '),
        }
      : (JSON.parse(
          result.stdout
            .slice(marker + RESULT_MARKER.length)
            .trim()
            .split('\n')[0] ?? '{}'
        ) as { theme?: unknown; fatal?: string });
  if ('fatal' in payload && payload.fatal) {
    throw new CliError('validation', `Could not load a theme from ${relativeTo(root, path)}.`, {
      hint: payload.fatal,
    });
  }
  const parsed = ThemeSchema.safeParse((payload as { theme?: unknown }).theme);
  if (!parsed.success) {
    throw new CliError('validation', `${relativeTo(root, path)} does not export a valid theme.`, {
      hint: parsed.error.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join(' · '),
    });
  }
  return parsed.data;
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
  const fromThemeFile = opt(options, 'fromThemeFile');
  if (fromTheme && fromThemeFile) {
    throw new CliError('usage', 'Pass --from-theme or --from-theme-file, not both.');
  }
  if (opt(options, 'export') && !fromThemeFile) {
    throw new CliError('usage', '--export goes with --from-theme-file.');
  }
  if (fromTheme || fromThemeFile) {
    const flagName = fromTheme ? '--from-theme' : '--from-theme-file';
    const extra = Object.keys(input).filter((key) => key !== 'id' && key !== 'name');
    if (extra.length > 0) {
      throw new CliError('usage', `${flagName} imports a theme as it is; drop the other inputs.`, {
        hint: `Remove: ${extra.join(', ')}.`,
      });
    }
    const source = fromTheme
      ? await themeById(fromTheme)
      : await themeFromFile(ctx.root, fromThemeFile as string, opt(options, 'export'));
    const imported = await designSystemFromTheme(source, {
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

  // A folder by default (lockable: approval and component library live next
  // to the document); `--out <file>` writes a flat document as before.
  const outOption = opt(options, 'out');
  const folder = outOption === undefined;
  if (folder && !isDesignSystemId(id)) {
    throw new CliError('usage', `"${id}" is not a design-system id (lowercase kebab-case).`);
  }
  const out = workspaceFile(ctx.root, outOption ?? join(DESIGN_SYSTEMS_DIR, id, DOCUMENT_FILE));
  const file = relativeTo(ctx.root, out);
  const dryRun = flag(options, 'dryRun');
  if (existsSync(out) && !flag(options, 'force')) {
    throw new CliError('conflict', `${file} already exists.`, {
      hint: 'Pass --force to replace it.',
    });
  }
  const text = `${JSON.stringify(document, null, 2)}\n`;
  const extra: string[] = [];
  if (!dryRun) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, text, 'utf8');
    if (folder) {
      const dir = dirname(out);
      const approval: Approval = { status: 'draft', version: result.compiled.version };
      writeFileSync(join(dir, APPROVAL_FILE), `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
      const componentsFile = join(dir, COMPONENTS_FILE);
      if (!existsSync(componentsFile)) {
        writeFileSync(
          componentsFile,
          `${JSON.stringify(emptyComponentsManifest(), null, 2)}\n`,
          'utf8'
        );
      }
      extra.push(relativeTo(ctx.root, join(dir, APPROVAL_FILE)));
      extra.push(relativeTo(ctx.root, componentsFile));
    }
  }
  const data = {
    ...summary(result),
    file,
    layout: folder ? ('folder' as const) : ('flat' as const),
    status: 'draft' as const,
    files: [file, ...extra],
    dryRun,
    written: !dryRun,
    notes,
    document,
  };
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
  const ref = args[0];
  if (!ref) throw new CliError('usage', 'Missing <id|file>.');
  const location = locateDesignSystem(ctx.root, ref);
  const document = readDocumentFile(location);
  const result = await compileOrFail(document, location.file);
  const file = location.file;
  if (location.layout === 'folder' && result.compiled.id !== location.id) {
    throw new CliError(
      'validation',
      `${file} declares id "${result.compiled.id}", but its folder is design-systems/${location.id}/.`,
      { hint: 'Rename the folder or the document id so they match.' }
    );
  }
  const approval = readApproval(location);
  const components = readComponents(location);
  const drift = components ? componentDrift(location, components) : [];
  const lockable =
    location.layout === 'folder' ? lockRefusal(location, document, result.compiled.version) : null;
  const data = {
    ...summary(result),
    file,
    layout: location.layout,
    valid: true,
    contentHash: contentHash(document),
    status: approval?.status ?? 'draft',
    ...(approval ? { approval } : {}),
    components:
      components?.components.map((c) => ({ name: c.name, version: c.version, status: c.status })) ??
      [],
    drift,
    lockable: location.layout === 'folder' && lockable === null,
    ...(lockable ? { lockRefusal: lockable } : {}),
  };
  if (drift.length > 0) {
    throw new CliError(
      'validation',
      `${COMPONENTS_FILE} of design system "${location.id}" does not match its components.`,
      {
        data,
        hint: drift
          .slice(0, 5)
          .map((d) => `${d.file}: ${d.problem}`)
          .join(' · '),
      }
    );
  }
  return {
    data,
    render(o) {
      o.always(`${file} is a valid design system: ${data.name} (${data.id}@${data.version})`);
      renderSummary(o, data);
      if (location.layout === 'folder') {
        o.always(`  status ${data.status} · ${data.components.length} library component(s)`);
      }
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
  if (define) {
    const at = define.index + define[0].length;
    return `${next.slice(0, at)}  themes: [${EXPORT_NAME}],\n${next.slice(at)}`;
  }
  return wireKindOptions(next);
}

/**
 * Deck, page and doc prototypes: their `prototype.ts` calls
 * `defineKindPrototype(…, { …, brandTheme, defaultThemeId })` (deck) or
 * `definePrototypeFromPage(page, { … })` / `definePrototypeFromDoc(doc, { … })`
 * (page, doc). The design system becomes the brand theme they register and
 * open in. Returns `null` when no such call is found.
 */
function wireKindOptions(source: string): string | null {
  const brand = `brandTheme: ${EXPORT_NAME}`;
  if (source.includes(brand)) return source;
  const kindCall = /(defineKindPrototype|definePrototypeFrom(?:Page|Doc))\(/.exec(source);
  if (!kindCall) return null;
  const after = source.slice(kindCall.index);
  const open = /,\s*\{\n/.exec(after);
  if (!open) return null;
  const start = kindCall.index + open.index + open[0].length;
  let body = source.slice(start);
  // A deck passes its blueprint brand as `brandTheme` and `defaultThemeId`: replace both.
  const hadBrand = /^\s*brandTheme(?::[^,\n]*)?,\s*\n/m.test(body);
  body = body
    .replace(/^(\s*)brandTheme(?::[^,\n]*)?,[ \t]*\n/m, '')
    .replace(/^(\s*)defaultThemeId(?::[^,\n]*)?,[ \t]*\n/m, '');
  const indent = /^([ \t]*)\S/.exec(body)?.[1] ?? '    ';
  const lines = `${indent}${brand},\n${indent}defaultThemeId: ${EXPORT_NAME}.id,\n`;
  const next = `${source.slice(0, start)}${lines}${body}`;
  return hadBrand ? dropUnusedBrandImport(next) : next;
}

/** After a deck's brand is replaced, its `brand-theme.ts` import is unused. */
function dropUnusedBrandImport(source: string): string {
  const line = /^import \{[^}]*\bbrandTheme\b[^}]*\} from '\.\/brand-theme\.ts';\n/m.exec(source);
  if (!line) return source;
  const rest = source.slice(0, line.index) + source.slice(line.index + line[0].length);
  return /\b(brandTheme|defaultThemeId)\b(?!:)/.test(
    rest.replace(/brandTheme: |defaultThemeId: /g, '')
  )
    ? source
    : rest;
}

interface PackageManifest {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

function readPackage(dir: string): PackageManifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as PackageManifest;
  } catch {
    return null;
  }
}

function lists(pkg: PackageManifest | null, name: string): boolean {
  return Boolean(pkg?.dependencies?.[name] ?? pkg?.devDependencies?.[name]);
}

/**
 * The package `src/design-system.ts` imports `defineDesignSystemTheme` from:
 * `@protoyard/runtime` (app prototypes) or `@protoyard/themes`. A prototype
 * with neither (a deck) gets `@protoyard/themes` added to its package.json,
 * at the installed version in a consumer workspace and `workspace:*` here.
 */
function designSystemImport(
  root: string,
  pkg: PackageManifest | null
): { from: string; add?: { name: string; specifier: string } } {
  if (lists(pkg, '@protoyard/runtime')) return { from: '@protoyard/runtime' };
  if (lists(pkg, '@protoyard/themes')) return { from: '@protoyard/themes' };
  const specifier = workspaceLayout(root) === 'consumer' ? CLI_VERSION : 'workspace:*';
  return { from: '@protoyard/themes', add: { name: '@protoyard/themes', specifier } };
}

/** Refreshes the prototype's generated spec regions; never fails `ds use`. */
async function refreshSpec(
  ctx: Parameters<Handler>[0],
  dir: string
): Promise<{ refreshed: boolean; reason?: string }> {
  try {
    const facts = await inspectSpec(ctx.root, dir);
    const result = await specForPrototype(dir, facts, { mode: 'write', init: false });
    const failed = result.files.find((f) => f.error);
    return failed ? { refreshed: false, reason: failed.error } : { refreshed: true };
  } catch (error) {
    return { refreshed: false, reason: (error as Error).message };
  }
}

/** A design-system document, located, read and compiled (Texuli at `trust: 'untrusted'`). */
export interface ResolvedDesignSystem {
  location: DesignSystemLocation;
  document: unknown;
  result: CompiledDesignSystemResult;
}

type CompiledDesignSystemResult = Extract<
  Awaited<ReturnType<typeof compileDesignSystemDocument>>,
  { ok: true }
>;

/**
 * Locates, reads and compiles a design system by id or workspace file, and
 * checks that a folder's document declares the folder's id. Writes nothing.
 */
export async function resolveDesignSystem(
  root: string,
  ref: string
): Promise<ResolvedDesignSystem> {
  const location = locateDesignSystem(root, ref);
  const document = readDocumentFile(location);
  const result = await compileOrFail(document, location.file);
  if (location.layout === 'folder' && result.compiled.id !== location.id) {
    throw new CliError(
      'validation',
      `${location.file} declares id "${result.compiled.id}", but its folder is design-systems/${location.id}/.`
    );
  }
  return { location, document, result };
}

/**
 * Throws when a resolved design system cannot be locked (flat, draft, approved
 * at another version, or changed since approval). `what` names the prototype
 * in the message.
 */
export function assertLockable(resolved: ResolvedDesignSystem, what: string): void {
  const refusal = lockRefusal(
    resolved.location,
    resolved.document,
    resolved.result.compiled.version
  );
  if (refusal) {
    throw new CliError('validation', `Cannot lock ${what}: ${refusal}`, {
      hint: 'A locked prototype only accepts an approved design system.',
      data: { designSystem: resolved.location.id ?? resolved.location.file, lockable: false },
    });
  }
}

/** The import line a prototype definition uses for its applied design system. */
export const DESIGN_SYSTEM_IMPORT = `import { ${EXPORT_NAME} } from './design-system.ts';`;

export interface ApplyDesignSystemInput {
  /** The prototype folder (a staging folder is fine: nothing is resolved from the registry). */
  dir: string;
  /** Workspace-relative POSIX path of the prototype, for messages and the files list. */
  path: string;
  slug: string;
  /** A design-system id or workspace document path. */
  ref: string;
  lock: boolean;
  upgrade: boolean;
  /** Write a binding even without `lock` (an unlocked binding: `new --ds --unlocked`). */
  bind?: boolean;
  force: boolean;
  dryRun: boolean;
  /** Refresh the generated spec regions after writing (callers that write the spec later pass false). */
  refreshSpec: boolean;
  /** A design system the caller already resolved (skips reading the document twice). */
  resolved?: ResolvedDesignSystem;
  /**
   * The definition the caller is about to write in place of `src/prototype.ts`
   * (a regeneration plan), checked instead of the file on disk. Dry runs only:
   * it lets a caller check every refusal before its first write.
   */
  plannedDefinition?: string;
}

export interface Binding {
  id: string;
  version: string;
  locked: boolean;
}

export interface AppliedDesignSystem extends ReturnType<typeof summary> {
  slug: string;
  defaultTheme: string;
  files: string[];
  bytes: number;
  dryRun: boolean;
  written: boolean;
  added?: { name: string; specifier: string };
  designSystem?: Binding;
  changes?: { changed: string[]; added: string[]; removed: string[] };
  spec: { refreshed: boolean; reason?: string };
  next: string[];
}

/**
 * The core of `ds use`, shared with `new --ds` and `generate --ds`: compiles
 * the design system into `src/design-system.ts`, wires it into
 * `definePrototype({ themes })` or a kind prototype's brand options, sets
 * `defaultTheme`, writes the manifest binding (`--lock`, `--upgrade`) and adds
 * the theme package when the prototype lists none. Every target is checked
 * (symlinks, manifest, a definition it can edit, another design system in
 * place) before the first write.
 */
export async function applyDesignSystem(
  ctx: Parameters<Handler>[0],
  input: ApplyDesignSystemInput
): Promise<AppliedDesignSystem> {
  const resolved = input.resolved ?? (await resolveDesignSystem(ctx.root, input.ref));
  const { location, result } = resolved;
  const file = location.file;
  const { dir, path: label, slug } = input;
  const manifestFile = join(dir, 'protoyard.json');
  const prototypeFile = join(dir, PROTOTYPE_FILE);
  const designSystemFile = join(dir, DESIGN_SYSTEM_FILE);
  const show = (rel: string) => `${label}/${rel}`;
  for (const [target, rel] of [
    [manifestFile, 'protoyard.json'],
    [prototypeFile, PROTOTYPE_FILE],
    [designSystemFile, DESIGN_SYSTEM_FILE],
  ] as const) {
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
      throw new CliError('unsafe_path', `Refusing to write through the symlink ${show(rel)}.`);
    }
  }
  if (!existsSync(prototypeFile)) {
    throw new CliError('validation', `${show(PROTOTYPE_FILE)} does not exist.`);
  }
  const manifestInput = JSON.parse(readFileSync(manifestFile, 'utf8')) as Record<string, unknown>;
  if (!PrototypeManifestSchema.safeParse(manifestInput).success) {
    throw new CliError('validation', `Invalid ${show('protoyard.json')}; refusing to update it.`);
  }
  const binding = bindingFor(manifestInput, result.compiled.id, result.compiled.version, {
    lock: input.lock,
    upgrade: input.upgrade,
    bind: input.bind ?? false,
    slug,
  });
  if (binding?.locked) assertLockable(resolved, slug);
  const packageFile = join(dir, 'package.json');
  const pkg = readPackage(dir);
  if (!pkg) {
    throw new CliError('validation', `${show('package.json')} is missing or not valid JSON.`);
  }
  if (lstatSync(packageFile).isSymbolicLink()) {
    throw new CliError(
      'unsafe_path',
      `Refusing to write through the symlink ${show('package.json')}.`
    );
  }
  const dependency = designSystemImport(ctx.root, pkg);
  if (input.plannedDefinition !== undefined && !input.dryRun) {
    throw new CliError('failure', 'A planned definition can only be checked in a dry run.');
  }
  const prototypeSource = input.plannedDefinition ?? readFileSync(prototypeFile, 'utf8');
  // A generated definition is rewritten by regeneration. It is accepted only
  // when the generator itself wired the design system (`generate --ds`): then
  // regeneration keeps it, and `ds use --upgrade` only rewrites the
  // non-generated src/design-system.ts.
  if (
    prototypeSource.includes(GENERATED_MARKER) &&
    !prototypeSource.includes(DESIGN_SYSTEM_IMPORT)
  ) {
    throw new CliError(
      'validation',
      `${show(PROTOTYPE_FILE)} is written by \`protoyard generate\`; regeneration would drop the design system.`,
      {
        hint: `Bind it at generation instead: protoyard generate ${slug} --blueprint ${label}/blueprint.json --ds ${result.compiled.id}`,
      }
    );
  }
  const wired = wireDesignSystem(prototypeSource);
  if (wired === null) {
    throw new CliError(
      'validation',
      `${show(PROTOTYPE_FILE)} has no definePrototype({ … }) call this command can edit.`,
      {
        hint: `Add \`${DESIGN_SYSTEM_IMPORT}\` and \`themes: [${EXPORT_NAME}]\` by hand.`,
      }
    );
  }
  if (existsSync(designSystemFile) && !input.force) {
    const current = readFileSync(designSystemFile, 'utf8');
    if (!current.includes(`"id": ${JSON.stringify(result.compiled.id)}`)) {
      throw new CliError('conflict', `${show(DESIGN_SYSTEM_FILE)} holds another design system.`, {
        hint: 'Pass --force to replace it.',
      });
    }
  }
  const source = `// Written by \`protoyard ds use\` from ${JSON.stringify(file)} (hash ${result.compiled.hash.slice(0, 12)}).
// Re-run the command to update it; edit the design-system document, not this file.
import { defineDesignSystemTheme, type ShippedDesignSystem } from '${dependency.from}';

// Exported for tests and for hosts that need every compiled variable
// (\`designSystemVars(compiled, mode)\` in @protoyard/themes) or a deck resolver
// (\`deckDesignSystems(compiled)\` in @protoyard/decks-ui).
export const compiled: ShippedDesignSystem = ${JSON.stringify(result.shipped, null, 2)};

export const ${EXPORT_NAME} = defineDesignSystemTheme(compiled);
`;
  const { dryRun } = input;
  const previous = existsSync(designSystemFile)
    ? shippedFromSource(readFileSync(designSystemFile, 'utf8'))
    : null;
  const changes =
    binding && previous && input.upgrade ? diffShipped(previous, result.shipped) : null;
  const manifest = {
    ...manifestInput,
    defaultTheme: result.compiled.id,
    ...(binding ? { designSystem: binding } : {}),
  };
  if (!dryRun) {
    writeFileSync(designSystemFile, source, 'utf8');
    if (wired !== prototypeSource) writeFileSync(prototypeFile, wired, 'utf8');
    writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
    if (dependency.add) {
      const next = {
        ...pkg,
        dependencies: {
          ...(pkg.dependencies ?? {}),
          [dependency.add.name]: dependency.add.specifier,
        },
      };
      writeFileSync(packageFile, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
    }
  }
  const files = [
    DESIGN_SYSTEM_FILE,
    ...(wired !== prototypeSource ? [PROTOTYPE_FILE] : []),
    'protoyard.json',
    ...(dependency.add ? ['package.json'] : []),
  ].map(show);
  // The manifest's default theme changed: refresh the generated spec regions
  // now, unless a new dependency still has to be installed first.
  const spec = !input.refreshSpec
    ? { refreshed: false, reason: 'written by the caller' }
    : dryRun || dependency.add
      ? { refreshed: false, reason: dryRun ? 'dry run' : 'install the new dependency first' }
      : await refreshSpec(ctx, dir);
  return {
    ...summary(result),
    slug,
    defaultTheme: result.compiled.id,
    files,
    bytes: Buffer.byteLength(source),
    dryRun,
    written: !dryRun,
    ...(dependency.add ? { added: dependency.add } : {}),
    ...(binding ? { designSystem: binding } : {}),
    ...(changes ? { changes } : {}),
    spec,
    next: [
      ...(dependency.add ? ['pnpm install'] : []),
      ...(spec.refreshed ? [] : [`pnpm protoyard spec ${slug} --write`]),
      `pnpm protoyard validate ${slug} --build`,
    ],
  };
}

export const dsUseCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slug = args[0];
  const ref = args[1];
  if (!slug || !ref) throw new CliError('usage', 'Provide <slug> and <id|file>.');
  const resolved = await resolveDesignSystem(ctx.root, ref);
  const { entry, dir } = await resolveTarget(ctx, slug, 'prototype');
  const data = await applyDesignSystem(ctx, {
    dir,
    path: entry.path,
    slug: entry.slug,
    ref,
    resolved,
    lock: flag(options, 'lock'),
    upgrade: flag(options, 'upgrade'),
    force: flag(options, 'force'),
    dryRun: flag(options, 'dryRun'),
    refreshSpec: true,
  });
  const binding = data.designSystem;
  const changes = data.changes;
  return {
    data,
    render(o) {
      o.always(
        `${data.dryRun ? 'Would apply' : 'Applied'} ${data.name} (${data.id}) to ${entry.slug}: ${data.files.join(', ')}`
      );
      renderSummary(o, data);
      if (binding) {
        o.always(
          `  ${binding.locked ? 'locked' : 'bound'} to ${binding.id}@${binding.version}${
            changes
              ? ` · ${changes.changed.length} changed, ${changes.added.length} added, ${changes.removed.length} removed values`
              : ''
          }`
        );
      }
      if (!data.dryRun) o.always(`Next: ${data.next.join(' && ')}`);
    },
  };
};

/**
 * `ds migrate <id>`: moves the flat `design-systems/<id>.json` into the
 * folder layout (`document.json`, a draft `approval.json`, an empty
 * `components.json`). Prototypes that pointed at the flat file keep working:
 * `ds use` and `ds validate` resolve the id to the folder.
 */
export const dsMigrateCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const id = args[0];
  if (!id || !isDesignSystemId(id)) {
    throw new CliError('usage', 'Provide a design-system id (lowercase kebab-case).');
  }
  const flat = workspaceFile(ctx.root, join(DESIGN_SYSTEMS_DIR, `${id}.json`));
  const dir = workspaceFile(ctx.root, join(DESIGN_SYSTEMS_DIR, id));
  if (!existsSync(flat)) {
    throw new CliError('not_found', `No flat design system design-systems/${id}.json to migrate.`);
  }
  if (existsSync(dir)) {
    throw new CliError('conflict', `design-systems/${id}/ already exists.`, {
      hint: 'Remove or rename it first; migrate never merges into an existing folder.',
    });
  }
  const location = locateDesignSystem(ctx.root, `${DESIGN_SYSTEMS_DIR}/${id}.json`);
  const document = readDocumentFile(location);
  const result = await compileOrFail(document, location.file);
  if (result.compiled.id !== id) {
    throw new CliError(
      'validation',
      `design-systems/${id}.json declares id "${result.compiled.id}"; its folder would not match.`
    );
  }
  const dryRun = flag(options, 'dryRun');
  const files = [
    `${DESIGN_SYSTEMS_DIR}/${id}/${DOCUMENT_FILE}`,
    `${DESIGN_SYSTEMS_DIR}/${id}/${APPROVAL_FILE}`,
    `${DESIGN_SYSTEMS_DIR}/${id}/${COMPONENTS_FILE}`,
  ];
  if (!dryRun) {
    // Write the folder next to the flat file, then swap: an interrupted run
    // leaves the flat document in place.
    const staging = workspaceFile(ctx.root, join(DESIGN_SYSTEMS_DIR, `.${id}.migrating`));
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(staging, { recursive: true });
    writeFileSync(join(staging, DOCUMENT_FILE), readFileSync(flat, 'utf8'), 'utf8');
    const approval: Approval = { status: 'draft', version: result.compiled.version };
    writeFileSync(join(staging, APPROVAL_FILE), `${JSON.stringify(approval, null, 2)}\n`, 'utf8');
    writeFileSync(
      join(staging, COMPONENTS_FILE),
      `${JSON.stringify(emptyComponentsManifest(), null, 2)}\n`,
      'utf8'
    );
    renameSync(staging, dir);
    rmSync(flat);
  }
  const data = { id, from: `${DESIGN_SYSTEMS_DIR}/${id}.json`, files, status: 'draft', dryRun };
  return {
    data,
    render(o) {
      o.always(
        `${dryRun ? 'Would migrate' : 'Migrated'} ${data.from} → ${DESIGN_SYSTEMS_DIR}/${id}/ (status draft)`
      );
      o.always(`Next: review it, then \`protoyard ds approve ${id}\` and a reviewed commit.`);
    },
  };
};

/**
 * The manifest binding `ds use` writes. `--lock` pins the exact version and
 * locks; an existing binding is kept (and stays locked) and only moves to a
 * new version with `--upgrade`. Without either, an unbound prototype stays
 * unbound, as before, unless `bind` asks for an unlocked binding
 * (`new --ds --unlocked`, `generate --ds --unlocked`).
 */
export function bindingFor(
  manifest: Record<string, unknown>,
  id: string,
  version: string,
  options: { lock: boolean; upgrade: boolean; slug: string; bind?: boolean }
): Binding | null {
  const current = manifest.designSystem as Binding | undefined;
  if (options.upgrade && !current) {
    throw new CliError(
      'usage',
      `${options.slug} is not bound to a design system; --upgrade moves a binding.`,
      {
        hint: `Bind it first: protoyard ds use ${options.slug} ${id} --lock`,
      }
    );
  }
  if (!current) {
    if (options.lock) return { id, version, locked: true };
    return options.bind ? { id, version, locked: false } : null;
  }
  if (current.locked && current.id !== id) {
    throw new CliError(
      'conflict',
      `${options.slug} is locked to design system "${current.id}"; it cannot take "${id}".`,
      {
        hint: 'A locked prototype keeps its design system. Create a new prototype for another one.',
      }
    );
  }
  if (current.id === id && current.version !== version && !options.upgrade) {
    throw new CliError(
      'conflict',
      `${options.slug} pins ${current.id}@${current.version}; the document is ${version}.`,
      { hint: `Move the pin on purpose: protoyard ds use ${options.slug} ${id} --upgrade` }
    );
  }
  return { id, version, locked: current.locked || options.lock };
}

const SHIPPED_START = 'export const compiled: ShippedDesignSystem = ';

/** The compiled JSON a previous `ds use` wrote into src/design-system.ts, or null. */
export function shippedFromSource(source: string): unknown {
  const start = source.indexOf(SHIPPED_START);
  if (start < 0) return null;
  const from = start + SHIPPED_START.length;
  const end = source.indexOf(';\n', from);
  if (end < 0) return null;
  try {
    return JSON.parse(source.slice(from, end)) as unknown;
  } catch {
    return null;
  }
}

function leaves(value: unknown, prefix: string, out: Map<string, string>): void {
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      leaves(child, prefix ? `${prefix}.${key}` : key, out);
    }
    return;
  }
  out.set(prefix, JSON.stringify(value));
}

/** What changed between two compiled design systems, by leaf path (hash excluded). */
export function diffShipped(
  before: unknown,
  after: unknown
): { changed: string[]; added: string[]; removed: string[] } {
  const a = new Map<string, string>();
  const b = new Map<string, string>();
  leaves(before, '', a);
  leaves(after, '', b);
  a.delete('hash');
  b.delete('hash');
  const changed: string[] = [];
  const added: string[] = [];
  const removed: string[] = [];
  for (const [path, value] of b) {
    if (!a.has(path)) added.push(path);
    else if (a.get(path) !== value) changed.push(path);
  }
  for (const path of a.keys()) if (!b.has(path)) removed.push(path);
  return { changed: changed.sort(), added: added.sort(), removed: removed.sort() };
}
