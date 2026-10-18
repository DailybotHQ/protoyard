import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { type Blueprint, BrandThemeError, safeParseBlueprint } from '@protoyard/blueprint';
import { MANIFEST_FILENAME } from '@protoyard/core';
import {
  brandDefaultThemeId,
  type EmittedFile,
  emitPrototype,
  personalizeHtml,
  TEMPLATE_FILES_REMOVED,
} from '../lib/codegen/emit.ts';
import { checkHeader } from '../lib/codegen/header.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { childPath, isInside, toPosixRelative } from '../lib/paths.ts';
import { installWorkspace } from '../lib/pnpm.ts';
import { buildIndex } from '../lib/registry.ts';
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

async function readBlueprint(file: string): Promise<{ blueprint: Blueprint; text: string }> {
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
  return { blueprint: parsed.data, text: `${JSON.stringify(raw, null, 2)}\n` };
}

type Existing = 'none' | 'empty' | 'same' | 'changed' | 'other';

/** Classifies prototypes/<slug>: free, an empty folder, this exact generation, or something else. */
async function inspectDestination(
  dest: string,
  slug: string,
  template: string,
  files: readonly EmittedFile[]
): Promise<Existing> {
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
  } catch {
    return 'other';
  }
  for (const file of files.filter((f) => f.generated || f.path === 'blueprint.json')) {
    const current = await readFile(join(dest, file.path), 'utf8').catch(() => null);
    if (current !== file.content) return 'changed';
  }
  return 'same';
}

/** A nested POSIX path under `dir`; every segment goes through `childPath`'s checks. */
const nested = (dir: string, rel: string) => rel.split('/').reduce(childPath, dir);

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
  const { blueprint, text } = await readBlueprint(file);
  const templateName = opt(options, 'template') ?? DEFAULT_TEMPLATE;
  const {
    entry: template,
    dir: templateDir,
    registry,
  } = await resolveTarget(ctx, templateName, 'template');
  let files: EmittedFile[];
  try {
    files = emitPrototype(blueprint, slug, text);
  } catch (error) {
    if (error instanceof BrandThemeError) {
      throw new CliError('validation', error.message, {
        hint: 'Adjust brand.seed / preset / styleProfile so text pairs reach WCAG AA 4.5:1.',
        data: { failures: error.failures },
      });
    }
    throw error;
  }
  const dryRun = flag(options, 'dryRun');

  await mkdir(ctx.paths.prototypes, { recursive: true });
  const prototypesReal = await realpath(ctx.paths.prototypes);
  const dest = childPath(prototypesReal, slug);
  if (!isInside(prototypesReal, dest)) {
    throw new CliError('unsafe_path', `Refusing to write outside prototypes/: ${dest}`);
  }
  const clash = registry.entries.find((e) => e.id === `local.${slug}` && e.slug !== slug);
  if (clash) throw new CliError('conflict', `id "local.${slug}" is already used by ${clash.path}.`);

  const existing = await inspectDestination(dest, slug, template.slug, files);
  if (existing === 'other') {
    throw new CliError(
      'conflict',
      `prototypes/${slug} already exists and was not generated here.`,
      {
        hint: 'Choose another slug. generate never overwrites an existing prototype.',
      }
    );
  }
  if (existing === 'changed') {
    throw new CliError(
      'conflict',
      `prototypes/${slug} was generated from a different blueprint (or its generated files were edited).`,
      { hint: 'Generate into a new slug; regenerating an existing prototype is not supported yet.' }
    );
  }
  if (existing === 'empty' && !flag(options, 'force') && !dryRun) {
    throw new CliError('conflict', `prototypes/${slug} exists (empty).`, {
      hint: 'Re-run with --force to use the empty folder.',
    });
  }

  const rel = toPosixRelative(ctx.root, dest);
  const removed = new Set<string>(TEMPLATE_FILES_REMOVED);
  const emitted = new Set(files.map((f) => f.path));
  const copied = (await listTemplateFiles(templateDir)).filter(
    (path) => !removed.has(path) && !emitted.has(path)
  );
  const fileList = [
    ...copied.map((path) => ({ path, source: 'template' as const })),
    ...files.map((f) => ({
      path: f.path,
      source: f.generated ? ('generated' as const) : ('emitted' as const),
    })),
  ].sort((a, b) => a.path.localeCompare(b.path));
  const entities = blueprint.entities.map((e) => e.name);

  if (dryRun) {
    return {
      data: {
        slug,
        path: rel,
        dryRun: true,
        template: template.slug,
        entities,
        files: fileList,
        existing,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'skip')} Dry run: would write ${c.bold(rel)} (${fileList.length} files, nothing written)`
        );
        for (const f of fileList) out.info(`  ${c.dim(f.source.padEnd(9))} ${f.path}`);
      },
    };
  }

  const created = existing !== 'same';
  if (created) {
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
      await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
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
      await writeFiles(staging, files);
      if (existing === 'empty') await rm(dest, { recursive: true, force: true });
      await rename(staging, dest);
    } catch (error) {
      await rm(staging, { recursive: true, force: true });
      throw error;
    }
  }

  let install: { ok: boolean; skipped: boolean; mode?: string; log?: string };
  if (!created || options.install === false) install = { ok: true, skipped: true };
  else {
    const result = await installWorkspace(ctx.root, ctx.out.options.json ? 'pipe' : 'inherit');
    install = {
      ok: result.ok,
      skipped: false,
      mode: result.mode,
      ...(result.ok ? {} : { log: result.log }),
    };
  }

  // The template ships spec files (AGENTS.md, docs/): refresh their generated
  // regions for the new slug and its generated schema, like `protoyard new`.
  const spec = created ? await writeNewSpec(ctx, dest) : null;

  const index = await buildIndex(ctx.paths);
  const generatedFiles = files.filter((f) => f.generated);
  const intact = await Promise.all(
    generatedFiles.map(async (f) => checkHeader(await readFile(join(dest, f.path), 'utf8')).intact)
  );
  const nextSteps = [
    ...(install.ok && !install.skipped ? [] : ['pnpm install']),
    `pnpm protoyard dev ${slug}`,
    ...(spec?.ok === false ? [`pnpm protoyard spec ${slug} --init --write`] : []),
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
      created,
      unchanged: !created,
      entities,
      files: fileList,
      generated: generatedFiles.map((f) => f.path),
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
        created
          ? `${mark(c, 'pass')} Generated ${c.bold(rel)} from ${c.cyan(template.slug)}: ${entities.length} entities, ${generatedFiles.length} generated files`
          : `${mark(c, 'pass')} ${c.bold(rel)} is already generated from this blueprint — nothing to do`
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
