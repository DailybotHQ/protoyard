import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type Blueprint, safeParseBlueprint, screenPath } from '@protoyard/blueprint';
import { MANIFEST_FILENAME } from '@protoyard/core';
import {
  brandDefaultThemeId,
  type EmittedFile,
  personalizeHtml,
  TEMPLATE_FILES_REMOVED,
} from '../lib/codegen/emit.ts';
import { formatJson } from '../lib/codegen/format.ts';
import { checkHeader } from '../lib/codegen/header.ts';
import {
  assertNoGeneratedLinks,
  CODEGEN_FORMAT_VERSION,
  emitOrThrow,
  type FilePlan,
  planRegeneration,
  SNAPSHOT_PATH,
  snapshotText,
  withoutHistory,
} from '../lib/codegen/regenerate.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { childPath, isInside, toPosixRelative } from '../lib/paths.ts';
import { installWorkspace } from '../lib/pnpm.ts';
import { buildIndex } from '../lib/registry.ts';
import type { CommandContext } from '../lib/workspace.ts';
import { assertSlug, resolveTarget } from '../lib/workspace.ts';
import { copyTemplate, listTemplateFiles, personalize, writeNewSpec } from './new.ts';

/**
 * `protoyard generate <slug> --blueprint <file>`: validates a data-only
 * blueprint (ADR-017), then creates prototypes/<slug> from the crud-app
 * template with blueprint.json, hash-headed src/generated/** modules, lazily
 * routed CRUD screens and tests. Same safety as `new`: slug and path checks,
 * a hidden staging folder renamed into place, and an identical re-run is a
 * no-op.
 */

const DEFAULT_TEMPLATE = 'crud-app';
const MAX_BLUEPRINT_BYTES = 1024 * 1024;

async function readBlueprint(
  file: string
): Promise<{ blueprint: Blueprint; raw: Record<string, unknown>; text: string }> {
  const path = resolve(process.cwd(), file);
  const info = await stat(path).catch(() => null);
  if (!info?.isFile()) {
    throw new CliError('not_found', `Blueprint file not found: ${file}`, {
      hint: 'Pass a JSON file, e.g. --blueprint ./blueprint.json',
    });
  }
  if (info.size > MAX_BLUEPRINT_BYTES) {
    throw new CliError('validation', `Blueprint file is larger than 1 MB: ${file}`);
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    throw new CliError('validation', `Blueprint is not valid JSON: ${(error as Error).message}`);
  }
  const parsed = safeParseBlueprint(raw);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => ({
      path: issue.path.map(String).join('.') || '(root)',
      message: issue.message,
    }));
    const [first] = issues;
    throw new CliError(
      'validation',
      `Invalid blueprint: ${first ? `${first.path} — ${first.message}` : 'unknown error'}${issues.length > 1 ? ` (+${issues.length - 1} more)` : ''}`,
      {
        hint: 'Point "$schema" at packages/blueprint/schema/blueprint.schema.json for editor help.',
        data: { issues },
      }
    );
  }
  return {
    blueprint: parsed.data,
    raw: raw as Record<string, unknown>,
    text: formatJson(raw),
  };
}

type Existing = 'none' | 'empty' | 'generated' | 'other';

/** Classifies prototypes/<slug>: free, an empty folder, generated from this template, or something else. */
async function inspectDestination(dest: string, slug: string, template: string): Promise<Existing> {
  if (!existsSync(dest)) return 'none';
  const names = await readdir(dest).catch(() => null);
  if (names === null) return 'other';
  if (names.filter((n) => n !== '.DS_Store').length === 0) return 'empty';
  try {
    const manifest = JSON.parse(await readFile(join(dest, MANIFEST_FILENAME), 'utf8')) as Record<
      string,
      unknown
    >;
    if (manifest.id !== `local.${slug}` || manifest.template !== template) return 'other';
    return existsSync(join(dest, 'blueprint.json')) ? 'generated' : 'other';
  } catch {
    return 'other';
  }
}

/**
 * A nested POSIX path under `dir`. Every segment goes through `childPath`'s
 * lexical checks, then the canonical `isInside` check follows symlinks, so a
 * linked folder or file can never redirect a write or a delete outside `dir`.
 */
function nested(dir: string, rel: string): string {
  const target = rel.split('/').reduce(childPath, dir);
  if (!isInside(dir, target)) {
    throw new CliError('unsafe_path', `Refusing to write through a symbolic link: ${rel}`, {
      hint: 'Generated paths must stay inside the prototype folder. Remove the link and re-run.',
    });
  }
  return target;
}

async function writeFiles(dir: string, files: readonly EmittedFile[]) {
  for (const file of files) {
    const target = nested(dir, file.path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, file.content);
  }
}

export const generateCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const started = performance.now();
  const slug = assertSlug(args[0]);
  const file = opt(options, 'blueprint');
  if (!file) {
    throw new CliError('usage', 'Missing --blueprint <file>.', {
      hint: 'Example: pnpm protoyard generate my-helpdesk --blueprint ./helpdesk.blueprint.json',
    });
  }
  const { blueprint, raw, text } = await readBlueprint(file);
  const templateName = opt(options, 'template') ?? DEFAULT_TEMPLATE;
  const {
    entry: template,
    dir: templateDir,
    registry,
  } = await resolveTarget(ctx, templateName, 'template');
  const allowDrop = flag(options, 'allowDrop');
  const dryRun = flag(options, 'dryRun');

  await mkdir(ctx.paths.prototypes, { recursive: true });
  const prototypesReal = await realpath(ctx.paths.prototypes);
  const dest = childPath(prototypesReal, slug);
  if (!isInside(prototypesReal, dest)) {
    throw new CliError('unsafe_path', `Refusing to write outside prototypes/: ${dest}`);
  }
  const clash = registry.entries.find((e) => e.id === `local.${slug}` && e.slug !== slug);
  if (clash) throw new CliError('conflict', `id "local.${slug}" is already used by ${clash.path}.`);

  const existing = await inspectDestination(dest, slug, template.slug);
  if (existing === 'other') {
    throw new CliError(
      'conflict',
      `prototypes/${slug} already exists and was not generated here.`,
      {
        hint: 'Choose another slug. generate never overwrites an existing prototype.',
      }
    );
  }
  if (existing === 'generated') {
    return regenerate(ctx, {
      dest,
      slug,
      raw,
      dryRun,
      allowDrop,
      force: flag(options, 'force'),
      started,
    });
  }
  if (existing === 'empty' && !flag(options, 'force') && !dryRun) {
    throw new CliError('conflict', `prototypes/${slug} exists (empty).`, {
      hint: 'Re-run with --force to use the empty folder.',
    });
  }

  // A first generation starts the history: the snapshot records what the code reflects.
  const files = [
    ...emitOrThrow(blueprint, slug, text),
    {
      path: SNAPSHOT_PATH,
      content: snapshotText({
        schemaVersion: 1,
        blueprint: withoutHistory(raw),
        codegenFormat: CODEGEN_FORMAT_VERSION,
      }),
      generated: false,
    },
  ];
  if (blueprint.history.length > 0) {
    throw new CliError('validation', 'A new prototype starts without "history".', {
      hint: 'Remove "history" from the blueprint; generate records it on later regenerations.',
    });
  }
  const rel = toPosixRelative(ctx.root, dest);
  const removed = new Set<string>(TEMPLATE_FILES_REMOVED);
  const emitted = new Set(files.map((f) => f.path));
  // The template's own tests exercise its own entities; generated prototypes get
  // blueprint-driven tests from the emitter instead.
  const copied = (await listTemplateFiles(templateDir)).filter(
    (path) => !removed.has(path) && !emitted.has(path) && !path.startsWith('tests/')
  );
  const fileList = [
    ...copied.map((path) => ({ path, source: 'template' as const })),
    ...files.map((f) => ({
      path: f.path,
      source: f.generated ? ('generated' as const) : ('emitted' as const),
    })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  const entities = blueprint.entities.map((e) => e.name);
  const rootDashboard = blueprint.screens.find(
    (screen) => screen.type === 'dashboard' && screenPath(screen, blueprint.entities) === '/'
  );

  if (dryRun) {
    return {
      data: {
        slug,
        path: rel,
        dryRun: true,
        template: template.slug,
        entities,
        homeRoute: rootDashboard
          ? { screen: 'dashboard', title: rootDashboard.title ?? 'Dashboard' }
          : { screen: 'home', title: 'Home' },
        files: fileList,
        existing,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'skip')} Dry run: would write ${c.bold(rel)} (${fileList.length} files, nothing written)`
        );
        if (rootDashboard)
          out.info(
            `${mark(c, 'pass')} Home route would use dashboard "${rootDashboard.title ?? 'Dashboard'}"; generated Home.svelte would not be routed.`
          );
        for (const f of fileList) out.info(`  ${c.dim(f.source.padEnd(9))} ${f.path}`);
      },
    };
  }

  {
    const staging = childPath(prototypesReal, `.${slug}.staging-${process.pid}`);
    await rm(staging, { recursive: true, force: true });
    try {
      await copyTemplate(templateDir, staging);
      await personalize(staging, {
        slug,
        template: template.slug,
        name: opt(options, 'name') ?? blueprint.name,
        description:
          opt(options, 'description') ?? blueprint.description ?? template.description ?? '',
        now: new Date().toISOString(),
      });
      // The generated schema starts at version 1; scenarios come from the template.
      const manifestPath = join(staging, MANIFEST_FILENAME);
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
      manifest.storage = { ...(manifest.storage as object), namespace: slug, schemaVersion: 1 };
      // Standalone builds of the crud-app template render blank inside the
      // "browser" preview shell, so generated prototypes open full-page.
      const preview = { ...((manifest.preview as Record<string, unknown> | undefined) ?? {}) };
      delete preview.shell;
      manifest.preview = preview;
      const brandTheme = brandDefaultThemeId(blueprint);
      if (brandTheme) manifest.defaultTheme = brandTheme;
      await writeFile(manifestPath, formatJson(manifest));
      const htmlPath = join(staging, 'index.html');
      if (existsSync(htmlPath)) {
        const html = await readFile(htmlPath, 'utf8');
        await writeFile(
          htmlPath,
          personalizeHtml(html, String(manifest.name), String(manifest.description ?? ''))
        );
      }
      for (const path of removed) await rm(nested(staging, path), { force: true });
      await rm(nested(staging, 'src/generated'), { recursive: true, force: true });
      await rm(nested(staging, 'tests'), { recursive: true, force: true });
      await writeFiles(staging, files);
      if (existing === 'empty') await rm(dest, { recursive: true, force: true });
      await rename(staging, dest);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  let install: { ok: boolean; skipped: boolean; mode?: string; log?: string };
  if (options.install === false) install = { ok: true, skipped: true };
  else {
    const result = await installWorkspace(ctx.root, ctx.out.options.json ? 'pipe' : 'inherit');
    install = {
      ok: result.ok,
      skipped: false,
      mode: result.mode,
      ...(result.ok ? {} : { log: result.log }),
    };
  }

  // After install, so the definition's workspace packages resolve (same as `new`).
  const spec = await writeNewSpec(ctx, dest);
  const index = await buildIndex(ctx.paths);
  const generatedFiles = files.filter((f) => f.generated);
  const intact = await Promise.all(
    generatedFiles.map(async (f) => checkHeader(await readFile(join(dest, f.path), 'utf8')).intact)
  );
  const nextSteps = [
    ...(install.ok && !install.skipped ? [] : ['pnpm install']),
    ...(spec.ok ? [] : [`pnpm protoyard spec ${slug} --init --write`]),
    `pnpm protoyard dev ${slug}`,
    `pnpm vitest run prototypes/${slug}`,
    `pnpm protoyard validate ${slug} --build`,
  ];
  const durationMs = Math.round(performance.now() - started);
  return {
    data: {
      slug,
      id: `local.${slug}`,
      path: rel,
      template: template.slug,
      created: true,
      unchanged: false,
      entities,
      files: fileList,
      generated: generatedFiles.map((f) => f.path),
      homeRoute: rootDashboard
        ? { screen: 'dashboard', title: rootDashboard.title ?? 'Dashboard' }
        : { screen: 'home', title: 'Home' },
      hashesIntact: intact.every(Boolean),
      install,
      spec,
      indexed: index.registry.entries.some((e) => e.slug === slug && e.kind === 'prototype'),
      durationMs,
      nextSteps,
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Generated ${c.bold(rel)} from ${c.cyan(template.slug)}: ${entities.length} entities, ${generatedFiles.length} generated files`
      );
      if (rootDashboard)
        out.info(
          `${mark(c, 'pass')} Home route: dashboard "${rootDashboard.title ?? 'Dashboard'}"; generated Home.svelte is not routed.`
        );
      if (install.skipped) out.info(`${mark(c, 'skip')} Skipped pnpm install`);
      else if (install.ok)
        out.info(`${mark(c, 'pass')} Linked into the workspace (pnpm install --${install.mode})`);
      else {
        out.warn(`${mark(c, 'warn')} pnpm install failed — run it manually before \`dev\`.`);
        if (install.log) out.warn(c.dim(install.log));
      }
      if (spec?.ok) out.info(`${mark(c, 'pass')} Spec: AGENTS.md and docs/ filled for ${slug}`);
      else if (spec)
        out.warn(`${mark(c, 'warn')} Spec regions not refreshed: ${spec.error ?? 'unknown error'}`);
      out.info('\nNext steps:');
      for (const step of nextSteps) out.info(`  ${c.cyan(step)}`);
    },
  };
};

/**
 * Regenerates an existing generated prototype: rewrites only generated files
 * that are still untouched, appends a database version when storage changes,
 * and never touches owned files. Hand-edited generated files block the run
 * (exit 1) unless --force; nothing is written when it is blocked.
 */
async function regenerate(
  ctx: CommandContext,
  input: {
    dest: string;
    slug: string;
    raw: Record<string, unknown>;
    dryRun: boolean;
    allowDrop: boolean;
    force: boolean;
    started: number;
  }
): Promise<CommandResult> {
  const { dest, slug, dryRun, force } = input;
  const manifestPath = join(dest, MANIFEST_FILENAME);
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown> & {
    storage: { schemaVersion: number };
  };
  const plan = await planRegeneration({
    dest,
    slug,
    inputRaw: input.raw,
    manifestSchemaVersion: manifest.storage.schemaVersion,
    allowDrop: input.allowDrop,
  });
  const ownedApp = await readFile(join(dest, 'src/App.svelte'), 'utf8').catch(() => '');
  // The shared shell (BlueprintApp) applies the blueprint layout itself; an older owned app
  // applied it only by importing the retired src/generated/layout.ts.
  const layoutWarning =
    plan.blueprint.layout &&
    !ownedApp.includes('<BlueprintApp') &&
    !ownedApp.includes("from './generated/layout.ts'")
      ? 'layout set; owned App.svelte does not render BlueprintApp (@protoyard/crud/app) — see GENERATOR.md'
      : undefined;
  const report = plan.files.map(({ path, status }) => ({ path, status }));
  const count = (status: FilePlan['status']) =>
    plan.files.filter((f) => f.status === status).length;
  const conflicted = plan.files.filter((f) => f.status === 'conflicted').map((f) => f.path);
  const rel = toPosixRelative(ctx.root, dest);
  const schema = { from: plan.fromVersion, to: plan.toVersion, ops: plan.ops.length };
  if (conflicted.length > 0 && !force) {
    throw new CliError(
      'conflict',
      `${conflicted.length} generated file(s) in ${rel} were edited by hand: ${conflicted.join(', ')}`,
      {
        hint: 'Move hand-written code outside src/generated/, or re-run with --force to overwrite.',
        data: { slug, files: report, schemaVersion: schema },
      }
    );
  }
  const writes = plan.files.filter(
    (f) => f.content !== undefined && (f.status !== 'conflicted' || force)
  );
  const removals = plan.files.filter(
    (f) => f.status === 'removed' || (f.status === 'conflicted' && force && f.content === undefined)
  );
  const unchanged = writes.length === 0 && removals.length === 0 && schema.from === schema.to;

  if (!dryRun) {
    // Check every target before the first write, so a refused run changes nothing.
    await assertNoGeneratedLinks(dest);
    for (const file of [...writes, ...removals]) nested(dest, file.path);
    for (const file of writes) {
      const target = nested(dest, file.path);
      await mkdir(dirname(target), { recursive: true });
      // Write to a sibling and rename, so an interrupted run never leaves half a file.
      const temp = `${target}.tmp-${process.pid}`;
      await writeFile(temp, file.content as string);
      await rename(temp, target);
    }
    for (const file of removals) await rm(nested(dest, file.path), { force: true });
    if (schema.to !== schema.from) {
      manifest.storage = { ...manifest.storage, schemaVersion: schema.to };
      manifest.updatedAt = new Date().toISOString();
      await writeFile(manifestPath, formatJson(manifest));
    }
    await buildIndex(ctx.paths);
  }
  // Spec regions describe the blueprint (tables, permissions…): refresh them after every write.
  const spec = dryRun ? null : await writeNewSpec(ctx, dest);
  const durationMs = Math.round(performance.now() - input.started);
  return {
    data: {
      slug,
      path: rel,
      regenerated: !dryRun && !unchanged,
      dryRun,
      created: false,
      unchanged,
      schemaVersion: schema,
      entities: plan.blueprint.entities.map((e) => e.name),
      ...(layoutWarning ? { layoutWarning } : {}),
      files: report,
      counts: {
        created: count('created'),
        changed: count('changed'),
        unchanged: count('unchanged'),
        conflicted: count('conflicted'),
        removed: count('removed'),
        skipped: count('skipped'),
      },
      spec,
      durationMs,
    },
    render(out) {
      const { c } = out;
      if (layoutWarning) out.warn(`${mark(c, 'warn')} ${layoutWarning}`);
      if (spec && !spec.ok) {
        out.warn(
          `${mark(c, 'warn')} Spec docs not refreshed (${spec.error ?? 'unknown error'}). Run \`pnpm protoyard spec ${slug} --init --write\`.`
        );
      }
      if (unchanged) {
        out.always(
          `${mark(c, 'pass')} ${c.bold(rel)} already matches this blueprint — nothing to do`
        );
        return;
      }
      out.always(
        `${mark(c, 'pass')} ${dryRun ? 'Dry run: would regenerate' : 'Regenerated'} ${c.bold(rel)}` +
          (schema.to !== schema.from
            ? ` (schema v${schema.from} → v${schema.to}, ${schema.ops} upgrade steps)`
            : '')
      );
      for (const f of report.filter((r) => r.status !== 'unchanged' && r.status !== 'skipped')) {
        out.info(`  ${c.dim(f.status.padEnd(10))} ${f.path}`);
      }
      out.info(c.dim(`  owned files left untouched: ${count('skipped')}`));
    },
  };
}
