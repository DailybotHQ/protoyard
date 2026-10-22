import { type Dirent, existsSync, readdirSync, statSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { closestIds } from '@protoyard/blueprint';
import { MANIFEST_FILENAME, type PrototypeManifest } from '@protoyard/core';
import {
  formatFixtureFinding,
  type ScanFixtureFileInput,
  scanFixtureFiles,
} from '@protoyard/scenarios';
import { BUILTIN_THEMES, THEME_LIBRARY_META } from '@protoyard/themes';
import { buildPrototype } from '../lib/build.ts';
import { checkBlueprintDrift, SNAPSHOT_PATH } from '../lib/codegen/regenerate.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { readManifest, statManifest } from '../lib/discovery.ts';
import { type Inspection, inspectPrototype, toSpecFacts } from '../lib/inspect.ts';
import { findEscapingSymlinks, isSymlink } from '../lib/links.ts';
import { CliError, mark, toCliError } from '../lib/output.ts';
import { childPath, toPosixRelative } from '../lib/paths.ts';
import { resolvePackageBin, run, stripAnsi } from '../lib/process.ts';
import { loadRegistry, toRegistryEntry } from '../lib/registry.ts';
import { SPEC_FILES } from '../lib/spec-render.ts';
import { assertSlug, type CommandContext, readPackageJson } from '../lib/workspace.ts';
import { specForPrototype } from './spec.ts';

export type CheckStatus = 'pass' | 'fail' | 'warn' | 'skip';

export interface Check {
  id: string;
  label: string;
  status: CheckStatus;
  details: string[];
}

/** The folder contract every prototype (and template) follows. */
export const CONTRACT_FILES = [
  'protoyard.json',
  'package.json',
  'index.html',
  'vite.config.ts',
  'tsconfig.json',
  'src/main.ts',
  'src/prototype.ts',
  'src/App.svelte',
  'src/app.css',
  'src/database/schema.ts',
  'src/scenarios/index.ts',
  'src/scenarios/generators.ts',
] as const;

const check = (id: string, label: string, status: CheckStatus, details: string[] = []): Check => ({
  id,
  label,
  status,
  details,
});

/** App-only contract files: content kinds (deck, page, doc) have no app database or scenarios. */
const APP_ONLY_CONTRACT_FILES: ReadonlySet<string> = new Set([
  'src/database/schema.ts',
  'src/scenarios/index.ts',
  'src/scenarios/generators.ts',
]);

export function checkContractFiles(dir: string, blueprintKind?: string): Check {
  const contentKind = blueprintKind !== undefined && blueprintKind !== 'app';
  const required = contentKind
    ? CONTRACT_FILES.filter((f) => !APP_ONLY_CONTRACT_FILES.has(f))
    : CONTRACT_FILES;
  const missing = required.filter((f) => !existsSync(join(dir, f)));
  const details = missing.map((f) => `missing ${f}`);
  if (!existsSync(join(dir, 'README.md'))) details.push('no README.md (recommended)');
  return check(
    'contract',
    'Folder contract files',
    missing.length > 0 ? 'fail' : details.length > 0 ? 'warn' : 'pass',
    details
  );
}

/**
 * Marketplace metadata (`catalog`, CatalogSchema in @protoyard/core). The schema is
 * enforced by the manifest check; this one reports what the gallery will
 * shelve. Templates are the marketplace's starting points, so a template
 * without a catalog block warns. For a prototype the block is optional.
 */
export function checkCatalog(manifest: PrototypeManifest, kind: 'prototype' | 'template'): Check {
  const label = 'Marketplace catalog';
  const catalog = manifest.catalog;
  if (!catalog) {
    return kind === 'template'
      ? check('catalog', label, 'warn', [
          'no "catalog" block: the marketplace cannot shelve this template. Add one with a category from the shared list (CATALOG_CATEGORIES in @protoyard/core).',
        ])
      : check('catalog', label, 'skip', ['optional for prototypes']);
  }
  const summary = [catalog.category, catalog.productType].filter(Boolean).join(' · ');
  const details = [summary];
  if (catalog.platforms.length > 0) details.push(`platforms: ${catalog.platforms.join(', ')}`);
  if (catalog.features.length > 0) details.push(`features: ${catalog.features.join(', ')}`);
  return check('catalog', label, 'pass', details);
}

export function checkPackage(dir: string, slug: string, kind: 'prototype' | 'template'): Check {
  const pkg = readPackageJson(join(dir, 'package.json'));
  if (!pkg)
    return check('package', 'package.json', 'fail', ['package.json is missing or not valid JSON']);
  const expected = kind === 'prototype' ? `@prototype/${slug}` : `@protoyard-template/${slug}`;
  const problems: string[] = [];
  if (pkg.name !== expected) problems.push(`name is "${pkg.name ?? ''}", expected "${expected}"`);
  if (pkg.private !== true)
    problems.push('"private": true is required (prototypes are never published to npm)');
  const warnings: string[] = [];
  for (const script of ['dev', 'build', 'typecheck']) {
    if (!pkg.scripts?.[script]) warnings.push(`no "${script}" script`);
  }
  if (problems.length > 0)
    return check('package', 'package.json', 'fail', [...problems, ...warnings]);
  return check('package', 'package.json', warnings.length > 0 ? 'warn' : 'pass', warnings);
}

/** Source roots scanned for real-looking emails and secret shapes (read-only). */
export const FIXTURE_SCAN_ROOTS = [
  'src/scenarios',
  'src/database',
  'src/domain',
  'src/fixtures',
  'fixtures',
] as const;

const FIXTURE_SCAN_EXTENSIONS = new Set([
  '.ts',
  '.js',
  '.mjs',
  '.cjs',
  '.json',
  '.md',
  '.txt',
  '.csv',
]);

const FIXTURE_SCAN_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.protoyard']);

/**
 * Lists text files under the fixture scan roots. Pure discovery; never writes.
 * Exported for unit tests.
 */
export function listFixtureScanFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (abs: string) => {
    let entries: Dirent[];
    try {
      entries = readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
      const child = join(abs, entry.name);
      if (entry.isDirectory()) {
        if (FIXTURE_SCAN_SKIP_DIRS.has(entry.name)) continue;
        if (isSymlink(child)) continue;
        walk(child);
        continue;
      }
      if (!entry.isFile() || isSymlink(child)) continue;
      const lower = entry.name.toLowerCase();
      const dot = lower.lastIndexOf('.');
      const ext = dot >= 0 ? lower.slice(dot) : '';
      if (!FIXTURE_SCAN_EXTENSIONS.has(ext)) continue;
      try {
        if (statSync(child).size > 1_000_000) continue;
      } catch {
        continue;
      }
      out.push(child);
    }
  };
  for (const root of FIXTURE_SCAN_ROOTS) {
    const abs = join(dir, root);
    if (!existsSync(abs) || isSymlink(abs)) continue;
    walk(abs);
  }
  // Prefer a stable order for diagnostics and snapshots.
  return out.sort((a, b) => a.localeCompare(b));
}

/**
 * Scans prototype fixture sources for real-looking emails and secret shapes.
 * Read-only: never rewrites files. Findings never include matched secret text.
 */
export async function checkFixtureHygiene(dir: string): Promise<Check> {
  const label = 'Fixture hygiene (emails and secrets)';
  const files = listFixtureScanFiles(dir);
  if (files.length === 0) {
    return check('fixtures', label, 'skip', [
      'no src/scenarios, src/database, src/domain or fixtures sources to scan',
    ]);
  }
  const inputs: ScanFixtureFileInput[] = [];
  for (const abs of files) {
    try {
      const text = await readFile(abs, 'utf8');
      inputs.push({ path: toPosixRelative(dir, abs) || relative(dir, abs), text });
    } catch {
      // Unreadable files are skipped; validate still reports other checks.
    }
  }
  const findings = scanFixtureFiles(inputs, { maxFindings: 50 });
  if (findings.length === 0) {
    return check('fixtures', label, 'pass', [`scanned ${inputs.length} file(s)`]);
  }
  return check('fixtures', label, 'fail', findings.map(formatFixtureFinding));
}

/**
 * Static text check: the highest `version: N` in src/database/schema.ts must
 * equal `storage.schemaVersion`. The definition check repeats this precisely
 * when the prototype can be loaded.
 */
export function schemaVersionsInSource(source: string): number[] {
  return [...source.matchAll(/\bversion\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
}

async function checkSchemaVersion(dir: string, manifest: PrototypeManifest): Promise<Check> {
  if (existsSync(join(dir, SNAPSHOT_PATH))) {
    // Generated prototypes derive versions from blueprint.json history at runtime;
    // the blueprint and database-versions checks compare them instead of a source scan.
    return check('schema-version', 'storage.schemaVersion', 'skip', [
      'versions are derived from blueprint.json (see the blueprint check)',
    ]);
  }
  const path = join(dir, 'src', 'database', 'schema.ts');
  if (!existsSync(path))
    return check('schema-version', 'storage.schemaVersion', 'skip', ['no src/database/schema.ts']);
  const versions = schemaVersionsInSource(await readFile(path, 'utf8'));
  if (versions.length === 0) {
    return check('schema-version', 'storage.schemaVersion', 'warn', [
      'no `version: N` entries found in schema.ts',
    ]);
  }
  const latest = Math.max(...versions);
  return latest === manifest.storage.schemaVersion
    ? check('schema-version', 'storage.schemaVersion', 'pass', [`v${latest}`])
    : check('schema-version', 'storage.schemaVersion', 'fail', [
        `protoyard.json says v${manifest.storage.schemaVersion}, schema.ts declares up to v${latest}`,
      ]);
}

export function definitionChecks(
  inspection: Awaited<ReturnType<typeof inspectPrototype>>
): Check[] {
  const checks: Check[] = [];
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const id of inspection.rawScenarioIds) {
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  }
  const ids = inspection.scenarios.map((s) => s.id);
  const declared = new Set(inspection.declared);
  const unlisted = ids.filter((id) => !declared.has(id));
  const undefinedIds = inspection.declared.filter((id) => !ids.includes(id));
  const details = [
    ...duplicates.map((id) => `duplicate scenario id "${id}"`),
    ...unlisted.map((id) => `"${id}" is defined but not listed in protoyard.json "scenarios"`),
    ...undefinedIds.map((id) => `"${id}" is listed in protoyard.json but not defined`),
  ];
  checks.push(
    check(
      'scenarios',
      'Scenario ids',
      details.length > 0 ? 'fail' : ids.length === 0 ? 'warn' : 'pass',
      details.length > 0
        ? details
        : ids.length === 0
          ? ['no scenarios defined']
          : [`${ids.length} scenarios`]
    )
  );
  if (inspection.defaultScenario) {
    checks.push(
      ids.includes(inspection.defaultScenario)
        ? check('default-scenario', 'defaultScenario', 'pass', [inspection.defaultScenario])
        : check('default-scenario', 'defaultScenario', 'fail', [
            `"${inspection.defaultScenario}" is not defined`,
          ])
    );
  } else {
    checks.push(
      check('default-scenario', 'defaultScenario', 'warn', ['not set; the first scenario is used'])
    );
  }
  const latest = inspection.databaseVersions[inspection.databaseVersions.length - 1];
  checks.push(
    latest === inspection.schemaVersion
      ? check('database-versions', 'Database versions', 'pass', [
          `v${inspection.databaseVersions.join(', v')}`,
        ])
      : check('database-versions', 'Database versions', 'fail', [
          `latest database version v${latest ?? '?'} ≠ storage.schemaVersion v${inspection.schemaVersion}`,
        ])
  );
  return checks;
}

/**
 * Theme ids the prototype asks for (manifest `defaultTheme`, scenario
 * `appearance.themeId`) must name a built-in preset, one of the prototype's
 * own themes, or a library theme. Unknown ids warn with the closest known
 * ids: the runtime falls back to another theme instead of failing. Without a
 * loadable definition the prototype's own themes are unknown, so only
 * built-in and library ids are accepted.
 */
export function checkThemes(manifest: PrototypeManifest, inspection: Inspection | null): Check {
  const label = 'Theme ids';
  const own = inspection?.spec?.themes.map((t) => t.id) ?? [];
  const known = [
    ...new Set([
      ...own,
      ...BUILTIN_THEMES.map((t) => t.id),
      ...THEME_LIBRARY_META.map((m) => m.id),
    ]),
  ];
  const requested: { id: string; where: string }[] = [
    { id: manifest.defaultTheme, where: 'defaultTheme' },
    ...(inspection?.spec?.scenarios ?? []).flatMap((s) =>
      s.themeId ? [{ id: s.themeId, where: `scenario "${s.id}" appearance.themeId` }] : []
    ),
  ];
  const details = requested
    .filter((r) => !known.includes(r.id))
    .map((r) => {
      const near = closestIds(r.id, known);
      return `${r.where}: unknown theme "${r.id}"${near.length > 0 ? `; closest: ${near.join(', ')}` : ''}`;
    });
  if (details.length > 0) return check('themes', label, 'warn', details);
  const ids = [...new Set(requested.map((r) => r.id))];
  return check('themes', label, 'pass', [ids.join(', ')]);
}

async function checkTypes(ctx: CommandContext, dir: string): Promise<Check> {
  const bin = resolvePackageBin('svelte-check', 'svelte-check', [dir, ctx.root]);
  if (!bin) return check('typecheck', 'svelte-check', 'skip', ['svelte-check is not installed']);
  const result = await run(
    process.execPath,
    [bin, '--tsconfig', './tsconfig.json', '--threshold', 'error', '--output', 'human'],
    { cwd: dir, timeoutMs: 300_000 }
  );
  if (result.code === 0) return check('typecheck', 'svelte-check', 'pass');
  const lines = stripAnsi(`${result.stdout}\n${result.stderr}`)
    .split('\n')
    .filter((l) => /error/i.test(l))
    .slice(0, 15);
  return check(
    'typecheck',
    'svelte-check',
    'fail',
    lines.length > 0 ? lines : [`exit ${result.code}`]
  );
}

/**
 * The prototype spec (docs/SPECS.md): missing files warn (fail with
 * `--strict-spec`); stale generated regions and invalid markers always fail.
 * Uses the facts of the definition inspection validate already ran.
 */
export async function checkSpec(
  dir: string,
  slug: string,
  inspection: Inspection | null,
  strict: boolean
): Promise<Check> {
  const label = 'Prototype spec (AGENTS.md, docs/)';
  if (!inspection?.spec) {
    return check('spec', label, 'skip', ['needs a loadable src/prototype.ts']);
  }
  const result = await specForPrototype(
    dir,
    toSpecFacts(inspection.spec, inspection.schemaVersion),
    { mode: 'check', init: false }
  );
  const missing = result.files.filter((f) => !f.exists).map((f) => f.path);
  const invalid = result.files.filter((f) => f.error).map((f) => f.error as string);
  const stale = result.files.flatMap((f) =>
    f.regions.filter((r) => r.status === 'stale').map((r) => `${f.path}: region "${r.id}" is stale`)
  );
  const details = [
    ...invalid,
    ...stale,
    ...missing.map((f) => `missing ${f}`),
    ...(stale.length > 0 ? [`Run \`pnpm protoyard spec ${slug} --write\`.`] : []),
    ...(missing.length > 0
      ? [`Run \`pnpm protoyard spec ${slug} --init\` to create the missing files.`]
      : []),
  ];
  if (invalid.length > 0 || stale.length > 0 || (strict && missing.length > 0)) {
    return check('spec', label, 'fail', details);
  }
  if (missing.length > 0) return check('spec', label, 'warn', details);
  const regions = result.files.reduce(
    (n, f) => n + f.regions.filter((r) => r.status === 'fresh').length,
    0
  );
  return check('spec', label, 'pass', [
    `${SPEC_FILES.length} files, ${regions} generated regions current`,
  ]);
}

/**
 * Drift check for prototypes made by `protoyard generate` (they carry the
 * generation snapshot): the blueprint parses, its history rebuilds the
 * manifest's schema version, and every generated file is present, unedited
 * and current. Reads JSON and hashes files only; no prototype code runs.
 */
export async function checkBlueprint(
  dir: string,
  slug: string,
  manifest: PrototypeManifest
): Promise<Check | null> {
  if (!existsSync(join(dir, 'blueprint.json'))) return null;
  const label = 'Blueprint (generated screens fresh, versions agree)';
  if (!existsSync(join(dir, SNAPSHOT_PATH))) {
    return check('blueprint', label, 'skip', [
      'hand-wired blueprint (not made by `protoyard generate`)',
    ]);
  }
  try {
    const report = await checkBlueprintDrift(dir, slug, manifest.storage.schemaVersion);
    return report.ok
      ? check('blueprint', label, 'pass', [report.summary])
      : check('blueprint', label, 'fail', report.problems);
  } catch (error) {
    return check('blueprint', label, 'fail', [toCliError(error).message]);
  }
}

export const validateCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slug = assertSlug(args[0]);
  // Folder lookup (not the registry), so a broken manifest is still validated.
  // prototypes/ wins over templates/, like every other target command.
  const prototypeDir = childPath(ctx.paths.prototypes, slug);
  const templateDir = childPath(ctx.paths.templates, slug);
  if (!existsSync(prototypeDir) && !existsSync(templateDir)) {
    throw new CliError('not_found', `No folder prototypes/${slug} or templates/${slug}.`, {
      hint: 'Run `pnpm protoyard list --kind all` to see what exists.',
    });
  }
  const kind: 'prototype' | 'template' = existsSync(prototypeDir) ? 'prototype' : 'template';
  const dir = kind === 'prototype' ? prototypeDir : templateDir;
  // Same rule as discovery: a symlinked folder is never validated as valid or built.
  const symlinkedFolder = isSymlink(dir);
  const location = {
    ...(symlinkedFolder ? { symlink: true } : {}),
    folderKind: kind,
    folder: slug,
    dir,
    manifestPath: join(dir, MANIFEST_FILENAME),
    relDir: toPosixRelative(ctx.root, dir),
  };
  const checks: Check[] = [];
  const fileStat = await statManifest(location);
  const parsed = await readManifest(location, fileStat);
  checks.push(
    parsed.manifest
      ? check('manifest', 'protoyard.json schema', 'pass', [
          `${parsed.manifest.id} v${parsed.manifest.version}`,
        ])
      : check('manifest', 'protoyard.json schema', 'fail', parsed.errors)
  );
  checks.push(checkContractFiles(dir, parsed.manifest?.blueprintKind));
  const links = findEscapingSymlinks(dir);
  checks.push(
    links.length > 0
      ? check('symlinks', 'No symlinks leaving the folder', 'fail', [
          ...links.map(
            (l) => `${l} points outside the prototype (builds would publish its target)`
          ),
        ])
      : check('symlinks', 'No symlinks leaving the folder', 'pass')
  );
  checks.push(checkPackage(dir, slug, kind));
  // Read-only scan of scenario/database sources; never mutates fixture files.
  checks.push(await checkFixtureHygiene(dir));

  let inspection: Inspection | null = null;
  if (parsed.manifest) {
    checks.push(checkCatalog(parsed.manifest, kind));
    checks.push(await checkSchemaVersion(dir, parsed.manifest));
    const blueprintCheck = await checkBlueprint(dir, slug, parsed.manifest);
    if (blueprintCheck) checks.push(blueprintCheck);
    if (existsSync(join(dir, 'src', 'prototype.ts'))) {
      try {
        // `spec` mode is `inspect` plus the facts the spec check needs: one runner pass.
        inspection = await inspectPrototype(ctx.root, dir, 'spec');
        checks.push(...definitionChecks(inspection));
      } catch (error) {
        const err = toCliError(error);
        checks.push(
          check('definition', 'src/prototype.ts loads', 'fail', [
            err.message,
            ...(err.hint ? [err.hint] : []),
          ])
        );
      }
    } else {
      checks.push(
        check('definition', 'src/prototype.ts loads', 'fail', ['src/prototype.ts is missing'])
      );
    }
  }

  if (parsed.manifest) checks.push(checkThemes(parsed.manifest, inspection));
  checks.push(await checkSpec(dir, slug, inspection, flag(options, 'strictSpec')));

  checks.push(
    flag(options, 'skipTypecheck')
      ? check('typecheck', 'svelte-check', 'skip', ['--skip-typecheck'])
      : await checkTypes(ctx, dir)
  );

  if (flag(options, 'build')) {
    const blocking = checks.some((c) => c.status === 'fail');
    if (blocking || !parsed.manifest || !fileStat) {
      checks.push(
        check('build', 'Production build', 'skip', ['skipped because earlier checks failed'])
      );
    } else {
      try {
        const registry = await loadRegistry(ctx.paths);
        const entry =
          registry.entries.find((e) => e.slug === slug && e.kind === kind) ??
          toRegistryEntry(parsed.manifest, location, fileStat.mtimeMs);
        const result = await buildPrototype(ctx, entry, dir, {});
        checks.push(
          check('build', 'Production build', 'pass', [
            `${result.manifest.fileCount} files → ${result.manifest.outDir}`,
          ])
        );
      } catch (error) {
        const err = toCliError(error);
        checks.push(
          check('build', 'Production build', 'fail', [err.message, ...(err.hint ? [err.hint] : [])])
        );
      }
    }
  }

  const failed = checks.filter((c) => c.status === 'fail');
  return {
    data: { slug, kind, ok: failed.length === 0, checks },
    ...(failed.length > 0
      ? {
          failure: new CliError('validation', `${slug}: ${failed.length} check(s) failed.`, {
            hint: `Failed: ${failed.map((c) => c.id).join(', ')}`,
          }),
        }
      : {}),
    render(out) {
      const { c } = out;
      out.always(`Validating ${c.bold(slug)}${kind === 'template' ? c.dim(' (template)') : ''}`);
      for (const item of checks) {
        out.always(
          `${mark(c, item.status)} ${item.label}${item.status === 'pass' && item.details[0] ? c.dim(`  ${item.details[0]}`) : ''}`
        );
        if (item.status !== 'pass')
          for (const detail of item.details) out.always(`    ${c.dim(detail)}`);
      }
      if (failed.length === 0) out.always(c.green(`\n${slug} is valid.`));
    },
  };
};
