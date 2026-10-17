import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST_FILENAME, type PrototypeManifest } from '@protoyard/core';
import { buildPrototype } from '../lib/build.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { readManifest, statManifest } from '../lib/discovery.ts';
import { inspectPrototype } from '../lib/inspect.ts';
import { CliError, mark, toCliError } from '../lib/output.ts';
import { childPath, toPosixRelative } from '../lib/paths.ts';
import { resolvePackageBin, run, stripAnsi } from '../lib/process.ts';
import { loadRegistry, toRegistryEntry } from '../lib/registry.ts';
import { assertSlug, type CommandContext, readPackageJson } from '../lib/workspace.ts';

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

export function checkContractFiles(dir: string): Check {
  const missing = CONTRACT_FILES.filter((f) => !existsSync(join(dir, f)));
  const details = missing.map((f) => `missing ${f}`);
  if (!existsSync(join(dir, 'README.md'))) details.push('no README.md (recommended)');
  return check(
    'contract',
    'Folder contract files',
    missing.length > 0 ? 'fail' : details.length > 0 ? 'warn' : 'pass',
    details
  );
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

/**
 * Static text check: the highest `version: N` in src/database/schema.ts must
 * equal `storage.schemaVersion`. The definition check repeats this precisely
 * when the prototype can be loaded.
 */
export function schemaVersionsInSource(source: string): number[] {
  return [...source.matchAll(/\bversion\s*:\s*(\d+)/g)].map((m) => Number(m[1]));
}

async function checkSchemaVersion(dir: string, manifest: PrototypeManifest): Promise<Check> {
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
  const location = {
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
  checks.push(checkContractFiles(dir));
  checks.push(checkPackage(dir, slug, kind));

  if (parsed.manifest) {
    checks.push(await checkSchemaVersion(dir, parsed.manifest));
    if (existsSync(join(dir, 'src', 'prototype.ts'))) {
      try {
        checks.push(...definitionChecks(await inspectPrototype(ctx.root, dir, 'inspect')));
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
