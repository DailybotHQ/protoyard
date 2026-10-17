import { existsSync } from 'node:fs';
import {
  copyFile,
  mkdir,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import { MANIFEST_FILENAME, safeParseManifest } from '@protoyard/core';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { childPath, isInside, toPosixRelative } from '../lib/paths.ts';
import { installWorkspace } from '../lib/pnpm.ts';
import { buildIndex } from '../lib/registry.ts';
import { assertSlug, readPackageJson, resolveTarget } from '../lib/workspace.ts';

/** Never copied from a template: build output, installs and local state. */
const SKIP_NAMES = new Set([
  'node_modules',
  'dist',
  '.astro',
  'artifacts',
  '.protoyard',
  '.DS_Store',
  '.turbo',
  '.vite',
  'coverage',
]);

export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** Copies regular files and folders only; symlinks are skipped so a template cannot point outside. */
export async function copyTemplate(source: string, destination: string): Promise<number> {
  let count = 0;
  await mkdir(destination, { recursive: true });
  for (const entry of await readdir(source, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue;
    const from = join(source, entry.name);
    const to = join(destination, entry.name);
    if (entry.isDirectory()) count += await copyTemplate(from, to);
    else if (entry.isFile()) {
      await copyFile(from, to);
      count++;
    }
  }
  return count;
}

export interface NewProjectInput {
  slug: string;
  template: string;
  name: string;
  description?: string;
  now: string;
}

/** Rewrites the copied template's identity files into a new prototype. */
export async function personalize(dir: string, input: NewProjectInput) {
  const manifestPath = join(dir, MANIFEST_FILENAME);
  const raw = JSON.parse(await readFile(manifestPath, 'utf8')) as Record<string, unknown>;
  const storage = (raw.storage ?? {}) as Record<string, unknown>;
  const next: Record<string, unknown> = {
    ...raw,
    id: `local.${input.slug}`,
    slug: input.slug,
    kind: 'prototype',
    name: input.name,
    ...(input.description !== undefined ? { description: input.description } : {}),
    template: input.template,
    storage: { ...storage, namespace: input.slug },
    createdAt: input.now,
    updatedAt: input.now,
  };
  const parsed = safeParseManifest(next);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new CliError(
      'validation',
      `The generated protoyard.json is invalid: ${issue ? `${issue.path.join('.')} — ${issue.message}` : 'unknown error'}.`,
      {
        hint: `Check templates/${input.template}/protoyard.json (and --name/--description lengths).`,
      }
    );
  }
  await writeFile(manifestPath, `${JSON.stringify(next, null, 2)}\n`);

  const pkgPath = join(dir, 'package.json');
  const pkg = readPackageJson(pkgPath);
  if (pkg) {
    pkg.name = `@prototype/${input.slug}`;
    pkg.private = true;
    await writeFile(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }

  const readmePath = join(dir, 'README.md');
  if (existsSync(readmePath)) {
    const readme = await readFile(readmePath, 'utf8');
    const titled = /^# .*$/m.test(readme)
      ? readme.replace(/^# .*$/m, `# ${input.name}`)
      : `# ${input.name}\n\n${readme}`;
    await writeFile(readmePath, titled);
  }
}

type Existing = 'none' | 'empty' | 'same' | 'other';

async function inspectDestination(dest: string, slug: string, template: string): Promise<Existing> {
  if (!existsSync(dest)) return 'none';
  const names = await readdir(dest).catch(() => null);
  if (names === null) return 'other';
  if (names.filter((n) => n !== '.DS_Store').length === 0) return 'empty';
  try {
    const raw = JSON.parse(await readFile(join(dest, MANIFEST_FILENAME), 'utf8')) as Record<
      string,
      unknown
    >;
    // A previous run of this exact command: safe to resume (retry-safe).
    if (raw.id === `local.${slug}` && raw.slug === slug && raw.template === template) return 'same';
  } catch {
    // unreadable → not ours
  }
  return 'other';
}

export const newCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const slug = assertSlug(args[0]);
  const templateName = opt(options, 'template');
  if (!templateName) {
    throw new CliError('usage', 'Missing --template <name>.', {
      hint: 'Run `pnpm protoyard list --kind template` to see the available templates.',
    });
  }
  const {
    entry: template,
    dir: templateDir,
    registry,
  } = await resolveTarget(ctx, templateName, 'template');
  const name = opt(options, 'name') ?? titleFromSlug(slug);
  const description = opt(options, 'description');

  await mkdir(ctx.paths.prototypes, { recursive: true });
  const prototypesReal = await realpath(ctx.paths.prototypes);
  const dest = childPath(prototypesReal, slug);
  if (!isInside(prototypesReal, dest)) {
    throw new CliError('unsafe_path', `Refusing to write outside prototypes/: ${dest}`);
  }

  const clash = registry.entries.find((e) => e.id === `local.${slug}` && e.slug !== slug);
  if (clash) {
    throw new CliError('conflict', `id "local.${slug}" is already used by ${clash.path}.`);
  }

  const existing = await inspectDestination(dest, slug, template.slug);
  if (existing === 'other') {
    throw new CliError(
      'conflict',
      `prototypes/${slug} already exists and was not created from "${template.slug}".`,
      {
        hint: 'Choose another slug. --force only reuses an EMPTY folder; it never overwrites files.',
      }
    );
  }
  if (existing === 'empty' && !flag(options, 'force')) {
    throw new CliError('conflict', `prototypes/${slug} exists (empty).`, {
      hint: 'Re-run with --force to use the empty folder.',
    });
  }

  let files = 0;
  const created = existing !== 'same';
  if (created) {
    // Build in a hidden sibling, then rename: an interrupted run never leaves
    // a half-copied prototype that discovery would index.
    const staging = childPath(prototypesReal, `.${slug}.staging-${process.pid}`);
    await rm(staging, { recursive: true, force: true });
    try {
      files = await copyTemplate(templateDir, staging);
      await personalize(staging, {
        slug,
        template: template.slug,
        name,
        ...(description !== undefined ? { description } : {}),
        now: new Date().toISOString(),
      });
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

  const index = await buildIndex(ctx.paths);
  const rel = toPosixRelative(ctx.root, dest);
  const nextSteps = [
    ...(install.ok && !install.skipped ? [] : ['pnpm install']),
    `pnpm protoyard dev ${slug}`,
    `pnpm protoyard validate ${slug}`,
    `pnpm protoyard build ${slug}`,
  ];
  return {
    data: {
      slug,
      id: `local.${slug}`,
      name,
      template: template.slug,
      path: rel,
      created,
      files,
      install,
      indexed: index.registry.entries.some((e) => e.slug === slug && e.kind === 'prototype'),
      nextSteps,
    },
    render(out) {
      const { c } = out;
      out.always(
        created
          ? `${mark(c, 'pass')} Created ${c.bold(rel)} from template ${c.cyan(template.slug)} (${files} files)`
          : `${mark(c, 'pass')} ${c.bold(rel)} already exists from ${c.cyan(template.slug)} — resumed`
      );
      if (install.skipped) out.info(`${mark(c, 'skip')} Skipped pnpm install (--no-install)`);
      else if (install.ok)
        out.info(`${mark(c, 'pass')} Linked into the workspace (pnpm install --${install.mode})`);
      else {
        out.warn(`${mark(c, 'warn')} pnpm install failed — run it manually before \`dev\`.`);
        if (install.log) out.warn(c.dim(install.log));
      }
      out.info('\nNext steps:');
      for (const step of nextSteps) out.info(`  ${c.cyan(step)}`);
    },
  };
};
