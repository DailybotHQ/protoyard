import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import type { Command } from 'commander';
import { biomeJson } from '../lib/codegen/format.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { isDesignSystemId } from '../lib/design-systems.ts';
import { KIT_DATA_FILE, KIT_KEEP, KIT_TEMPLATE, kitPlan, kitSlug } from '../lib/ds-kit.ts';
import { inspectSpec } from '../lib/inspect.ts';
import { CliError, mark, toCliError } from '../lib/output.ts';
import { buildIndex } from '../lib/registry.ts';
import { assertSlug } from '../lib/workspace.ts';
import { applyDesignSystem, type Binding, resolveDesignSystem } from './ds.ts';
import { checkBoundPrototype, createPrototypeFrom } from './new.ts';
import { specForPrototype } from './spec.ts';

/**
 * `protoyard ds kit <id> [--slug <slug>] [--check] [--dry-run] [--no-install]`
 * (PLAN_013 T-kit): writes or refreshes the kit prototype of a design system,
 * `prototypes/<id>-kit/`, whose one screen is Texuli's `DesignSystemKit` fed
 * from data (`src/kit/kit.json`, built by `lib/ds-kit.ts`).
 *
 * - Created from the blank template, bound (unlocked) to the design system:
 *   the kit must render drafts under review, which a locked binding refuses.
 *   The command runs the `check ds` scan on it after every write.
 * - Rerunning it rewrites only what changed: the same design system gives the
 *   same bytes. `--check` writes nothing and fails when the kit is stale.
 * - Refuses a folder in `prototypes/` that is not this design system's kit.
 */

type Def = (
  name: string,
  handler: Handler,
  allowNoWorkspace?: boolean
) => (...args: unknown[]) => Promise<void>;

interface KitManifest extends Record<string, unknown> {
  designSystem?: Binding;
}

function readManifest(dir: string): KitManifest | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'protoyard.json'), 'utf8')) as KitManifest;
  } catch {
    return null;
  }
}

function readKitOwner(dir: string): string | null {
  try {
    const data = JSON.parse(readFileSync(join(dir, KIT_DATA_FILE), 'utf8')) as {
      designSystem?: unknown;
    };
    return typeof data.designSystem === 'string' ? data.designSystem : null;
  } catch {
    return null;
  }
}

function differs(dir: string, path: string, content: string): boolean {
  const file = join(dir, path);
  return !existsSync(file) || readFileSync(file, 'utf8') !== content;
}

function writeOwned(dir: string, path: string, content: string): void {
  const file = join(dir, path);
  if (existsSync(file) && lstatSync(file).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to write through the symlink ${path}.`);
  }
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, content, 'utf8');
}

/** A new kit keeps only `main.ts`, `app.css` and `design-system.ts` of the template's src/. */
function clearTemplateSource(dir: string): void {
  const walk = (rel: string) => {
    const abs = join(dir, rel);
    if (!existsSync(abs)) return;
    for (const name of readdirSync(abs)) {
      const child = `${rel}/${name}`;
      if (KIT_KEEP.has(child)) continue;
      if (lstatSync(join(dir, child)).isDirectory()) {
        walk(child);
        if (readdirSync(join(dir, child)).length === 0)
          rmSync(join(dir, child), { recursive: true });
      } else {
        rmSync(join(dir, child));
      }
    }
  };
  walk('src');
}

/** The manifest with the kit's fields, in a stable key order (existing keys keep their place). */
function kitManifest(current: KitManifest, fields: Record<string, unknown>): KitManifest {
  return { ...current, ...fields };
}

export const dsKitCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const id = args[0];
  if (!id || !isDesignSystemId(id)) {
    throw new CliError('usage', 'Provide a design-system id (lowercase kebab-case).');
  }
  const slug = assertSlug(opt(options, 'slug') ?? kitSlug(id));
  const resolved = await resolveDesignSystem(ctx.root, id);
  const plan = await kitPlan(resolved.location, resolved.document, slug);
  const dir = join(ctx.paths.prototypes, slug);
  const path = `prototypes/${slug}`;
  const exists = existsSync(dir);
  if (exists) {
    const owner = readKitOwner(dir);
    const manifest = readManifest(dir);
    if (owner !== id || manifest?.designSystem?.id !== id) {
      throw new CliError(
        'conflict',
        `${path} exists and is not the kit of design system "${id}".`,
        {
          hint: `Pass another --slug, or remove ${path} first.`,
        }
      );
    }
  }
  const name = `${String(resolved.result.compiled.name || id)} kit`;
  const stale = exists
    ? [...plan.files].filter(([file, content]) => differs(dir, file, content)).map(([file]) => file)
    : [...plan.files.keys()];
  const manifestStale = exists
    ? (() => {
        const current = readManifest(dir) ?? {};
        return JSON.stringify(kitManifest(current, plan.manifest)) !== JSON.stringify(current);
      })()
    : true;
  const summary = {
    designSystem: { id, version: plan.version, status: plan.status, contentHash: plan.contentHash },
    slug,
    path,
    previous: plan.previous,
    catalogComponents: plan.catalogComponents,
    previews: plan.previews,
    stories: plan.stories,
    releaseIssues: plan.issues,
  };

  if (flag(options, 'check')) {
    const upToDate = exists && stale.length === 0 && !manifestStale;
    return {
      data: {
        ...summary,
        exists,
        upToDate,
        stale: [...stale, ...(manifestStale ? ['protoyard.json'] : [])],
      },
      ...(upToDate
        ? {}
        : {
            failure: new CliError(
              'validation',
              exists
                ? `${path} is out of date (${stale.length + (manifestStale ? 1 : 0)} files).`
                : `${path} does not exist.`,
              {
                hint: `Run \`protoyard ds kit ${id}${slug === kitSlug(id) ? '' : ` --slug ${slug}`}\`.`,
              }
            ),
          }),
      render(out) {
        out.always(
          upToDate
            ? `${mark(out.c, 'pass')} ${path} is up to date with ${id}@${plan.version}.`
            : `${mark(out.c, 'fail')} ${path} ${exists ? `is out of date: ${stale.join(', ')}` : 'does not exist'}.`
        );
      },
    };
  }

  if (flag(options, 'dryRun')) {
    return {
      data: { ...summary, dryRun: true, created: !exists, files: stale },
      render(out) {
        out.always(
          `${mark(out.c, 'pass')} Would ${exists ? 'refresh' : 'create'} ${path} (${stale.length} files) for ${id}@${plan.version}.`
        );
        out.always(out.c.dim('Dry run: nothing was written.'));
      },
    };
  }

  const manifestFile = join(dir, 'protoyard.json');
  // The manifest as it was before this run (null for a new kit).
  const manifestBefore = exists ? readFileSync(manifestFile, 'utf8') : null;
  let install: { ok: boolean; skipped: boolean; command?: string } = { ok: true, skipped: true };
  if (!exists) {
    const created = await createPrototypeFrom(ctx, {
      slug,
      from: KIT_TEMPLATE,
      templatesOnly: true,
      name,
      install: options.install === false ? 'skip' : 'auto',
      stdio: ctx.out.options.json ? 'pipe' : 'inherit',
      designSystem: { ref: id, resolved, lock: false },
    });
    install = created.install;
    clearTemplateSource(dir);
  } else {
    // The kit follows the document: an existing (unlocked) binding moves to its version.
    const binding = readManifest(dir)?.designSystem;
    await applyDesignSystem(ctx, {
      dir,
      path,
      slug,
      ref: id,
      resolved,
      lock: false,
      bind: true,
      upgrade: Boolean(binding && binding.version !== plan.version),
      force: false,
      dryRun: false,
      refreshSpec: false,
    });
  }

  const written: string[] = [];
  const nextManifest = kitManifest(readManifest(dir) ?? {}, plan.manifest);
  // Biome's format, written only when the content changed: `ds use` rewrites the
  // manifest in its own format, which is not a change.
  const changed =
    manifestBefore === null ||
    JSON.stringify(nextManifest) !== JSON.stringify(JSON.parse(manifestBefore));
  const manifestText = changed ? biomeJson(nextManifest) : manifestBefore;
  if (differs(dir, 'protoyard.json', manifestText)) {
    writeOwned(dir, 'protoyard.json', manifestText);
    if (changed) written.push('protoyard.json');
  }
  for (const [file, content] of plan.files) {
    if (!differs(dir, file, content)) continue;
    writeOwned(dir, file, content);
    written.push(file);
  }

  const binding = readManifest(dir)?.designSystem as Binding;
  const scan = checkBoundPrototype(ctx.root, dir, binding);
  let spec: { refreshed: boolean; reason?: string };
  try {
    const result = await specForPrototype(dir, await inspectSpec(ctx.root, dir), {
      mode: 'write',
      init: false,
    });
    const failed = result.files.find((f) => f.error);
    spec = failed ? { refreshed: false, reason: failed.error } : { refreshed: true };
  } catch (error) {
    spec = { refreshed: false, reason: toCliError(error).message };
  }
  const index = await buildIndex(ctx.paths);
  const data = {
    ...summary,
    created: !exists,
    binding,
    written,
    install,
    designSystemCheck: scan,
    spec,
    indexed: index.registry.entries.some((e) => e.slug === slug && e.kind === 'prototype'),
    nextSteps: [
      ...(install.ok && !install.skipped ? [] : ['pnpm install']),
      `pnpm protoyard dev ${slug}`,
      `pnpm protoyard validate ${slug} --build`,
    ],
  };
  return {
    data,
    ...(scan.ok
      ? {}
      : {
          failure: new CliError(
            'validation',
            `${path} does not pass the design-system checks: ${scan.violations} violations.`,
            { hint: `Run \`protoyard check ds ${slug}\`.` }
          ),
        }),
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} ${exists ? 'Refreshed' : 'Created'} ${c.bold(path)}: the kit of ${c.cyan(`${id}@${plan.version}`)} (${plan.status})${
          written.length === 0 ? ', nothing changed' : `, ${written.length} files written`
        }.`
      );
      out.always(
        `  ${plan.catalogComponents} catalog components, ${plan.previews.length} library previews, changes since ${plan.previous ?? 'no earlier release'}.`
      );
      for (const issue of plan.issues)
        out.warn(`  ${mark(c, 'fail')} ${issue.file}: ${issue.message}`);
      if (!spec.refreshed) out.info(c.dim(`  Spec not refreshed: ${spec.reason ?? 'unknown'}`));
      for (const step of data.nextSteps) out.always(`  ${c.dim('next:')} ${step}`);
    },
  };
};

export function registerDsKitCommand(ds: Command, def: Def): void {
  ds.command('kit')
    .description(
      "write or refresh the design system's kit prototype (prototypes/<id>-kit): Texuli's DesignSystemKit with its foundations, voice, components, library and the changes since the last release"
    )
    .argument('<id>', 'design system id (a folder under design-systems/)')
    .option(
      '--slug <slug>',
      'the kit prototype slug (default: <id>-kit, the one the gallery links)'
    )
    .option('--check', 'write nothing; fail when the kit is missing or out of date')
    .option('--no-install', 'skip `pnpm install` when the kit is created (link it later)')
    .option('--dry-run', 'show what would be written without writing')
    .action(def('ds kit', dsKitCommand));
}
