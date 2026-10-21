import { existsSync, lstatSync, statSync } from 'node:fs';
import { lstat, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  type Blueprint,
  blueprintIdentity,
  deriveDatabaseVersions,
  parseBlueprint,
} from '@protoyard/blueprint';
import { checkSlug, MANIFEST_FILENAME, type PrototypeManifest } from '@protoyard/core';
import { throwIfAborted } from '../../lib/abort.ts';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { QUICK_MARKER } from '../../lib/output-guard.ts';
import { canonicalPath, toPosixRelative, workspaceLayout } from '../../lib/paths.ts';
import { readQuickRecord, touchQuickRecord, writeQuickRecord } from '../../lib/quick/model.ts';
import { resolveQuickBase } from '../../lib/quick/paths.ts';
import { assertSlug } from '../../lib/workspace.ts';
import { generateCommand } from '../generate.ts';
import { type Check, checkBlueprint, checkContractFiles } from '../validate.ts';

/**
 * `protoyard quick promote <slug|dir> <new-slug> [--variant vN] [--no-install]`:
 * turns an exploration (or one of its variants) into a full prototype in
 * prototypes/<new-slug> through the `generate` pipeline, run in process. The
 * player and the generated prototype build from the same blueprint (ADR-029),
 * so the promotion checks that the written blueprint.json is that blueprint
 * (same identity, same database versions) before it records `promotedTo` in
 * quick.json. It never replaces an existing prototype.
 */

/** Same cap as the quick blueprints `quick serve` reads. */
const MAX_BLUEPRINT_BYTES = 2 * 1024 * 1024;

export interface QuickPromoteResult {
  /** The exploration's slug. */
  from: string;
  variant: string | null;
  slug: string;
  path: string;
  blueprintSha256: string;
  databaseVersions: number;
  checks: Check[];
  /** What `generate` returned (files, install, spec, next steps). */
  generate: Record<string, unknown>;
  promotedTo: { slug: string; variant: string | null; at: string } | null;
}

/** Resolves `<slug|dir>` to a marked exploration folder; throws a CliError. */
export function resolveExploration(root: string, target: string): string {
  if (!target) {
    throw new CliError('usage', 'Name the exploration to promote and the new prototype slug.', {
      hint: 'protoyard quick promote <exploration> <new-slug>',
    });
  }
  const looksLikeSlug = !/[\\/]/.test(target) && target !== '.' && target !== '..';
  const requested =
    looksLikeSlug && checkSlug(target).ok
      ? join(resolveQuickBase({ workspaceRoot: root, cwd: process.cwd() }).zone, target)
      : resolve(process.cwd(), target);
  if (!existsSync(requested) || !statSync(requested).isDirectory()) {
    throw new CliError('not_found', `No exploration at ${requested}.`, {
      hint: 'Create one with `protoyard quick "<brief>"`, or pass the folder it printed.',
    });
  }
  if (lstatSync(requested).isSymbolicLink()) {
    throw new CliError('unsafe_path', `Refusing to promote ${requested}: it is a symbolic link.`);
  }
  const dir = canonicalPath(requested);
  if (!existsSync(join(dir, QUICK_MARKER))) {
    throw new CliError(
      'unsafe_path',
      `Refusing to promote ${dir}: it is not an exploration (no ${QUICK_MARKER}).`,
      { hint: 'Only folders written by `protoyard quick` are promoted.' }
    );
  }
  return dir;
}

/** Reads a quick blueprint as untrusted input and checks it is the one quick.json recorded. */
export async function readRecordedBlueprint(
  path: string,
  expectedSha256: string
): Promise<{ blueprint: Blueprint; sha256: string }> {
  const info = await lstat(path).catch(() => undefined);
  if (!info?.isFile() || info.size > MAX_BLUEPRINT_BYTES) {
    throw new CliError('unsafe_path', `Refusing a missing, linked or oversized blueprint: ${path}`);
  }
  let blueprint: Blueprint;
  try {
    blueprint = parseBlueprint(JSON.parse(await readFile(path, 'utf8')) as unknown);
  } catch {
    throw new CliError('validation', `The exploration blueprint is invalid: ${path}`, {
      hint: 'Recreate the exploration with `protoyard quick … --force`.',
    });
  }
  const { sha256 } = await blueprintIdentity(blueprint);
  if (sha256 !== expectedSha256) {
    throw new CliError('validation', 'The exploration blueprint changed after it was created.', {
      hint: 'Recreate the exploration so quick.json and blueprint.json agree.',
    });
  }
  return { blueprint, sha256 };
}

const storageOf = (blueprint: Blueprint) =>
  deriveDatabaseVersions(blueprint).map(({ version, stores }) => ({ version, stores }));

export const quickPromoteCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  // Promotion writes prototypes/<slug>: an explicit --root that is not a workspace is refused.
  if (workspaceLayout(ctx.root) === null) {
    throw new CliError('not_found', `${ctx.root} is not a Protoyard workspace.`, {
      hint: 'Promote from inside a workspace (pnpm-workspace.yaml or a marked package.json), or pass --root <workspace>.',
      data: { reason: 'no_workspace' },
    });
  }
  const dir = resolveExploration(ctx.root, args[0] ?? '');
  const slug = assertSlug(args[1]);
  const record = await readQuickRecord(dir);

  const variantId = opt(options, 'variant') ?? null;
  const variant =
    variantId === null ? null : record.variants.find((entry) => entry.id === variantId);
  if (variant === undefined) {
    throw new CliError('not_found', `The exploration has no variant ${variantId}.`, {
      hint:
        record.variants.length > 0
          ? `Choose one of ${record.variants.map((entry) => entry.id).join(', ')}.`
          : 'This exploration has no variants; omit --variant.',
    });
  }
  const blueprintPath = join(dir, variant?.dir ?? '.', 'blueprint.json');
  const source = await readRecordedBlueprint(
    blueprintPath,
    variant?.blueprintSha256 ?? record.blueprintSha256
  );

  // generate regenerates a prototype it made earlier; promotion only ever creates one.
  const dest = join(ctx.paths.prototypes, slug);
  if (existsSync(dest)) {
    throw new CliError('conflict', `prototypes/${slug} already exists.`, {
      hint: 'Choose another slug. quick promote never replaces a prototype.',
    });
  }

  // A new prototype starts at schema v1: the `history` that `quick iterate` keeps for
  // kept player worlds stays with the exploration (generate refuses a new one with it).
  const fresh = parseBlueprint({ ...source.blueprint, history: [] });
  const freshSha256 = (await blueprintIdentity(fresh)).sha256;
  const freshPath =
    source.blueprint.history.length > 0
      ? join(dir, `.promote-${process.pid}.blueprint.json`)
      : null;
  let generated: CommandResult;
  try {
    if (freshPath) await writeFile(freshPath, `${JSON.stringify(fresh, null, 2)}\n`, 'utf8');
    generated = await generateCommand(ctx, [slug], {
      blueprint: freshPath ?? blueprintPath,
      install: options.install,
    });
  } finally {
    if (freshPath) await rm(freshPath, { force: true });
  }
  const data = (generated.data ?? {}) as Record<string, unknown>;

  // Validate what generate wrote: the folder contract, the generated files'
  // freshness, and that it is the exploration's app (same blueprint, same storage).
  const manifest = JSON.parse(
    await readFile(join(dest, MANIFEST_FILENAME), 'utf8')
  ) as PrototypeManifest;
  const written = parseBlueprint(
    JSON.parse(await readFile(join(dest, 'blueprint.json'), 'utf8')) as unknown
  );
  const writtenSha256 = (await blueprintIdentity(written)).sha256;
  const sameStorage = JSON.stringify(storageOf(written)) === JSON.stringify(storageOf(fresh));
  const parityDetails = [
    ...(writtenSha256 === freshSha256 ? [] : ['blueprint.json differs from the exploration']),
    ...(sameStorage ? [] : ['database versions differ from the exploration']),
  ];
  const checks: Check[] = [
    checkContractFiles(dest),
    ...[await checkBlueprint(dest, slug, manifest)].filter((c): c is Check => c !== null),
    {
      id: 'parity',
      label: 'Same app as the exploration (blueprint identity, database versions)',
      status: parityDetails.length === 0 ? 'pass' : 'fail',
      details:
        parityDetails.length === 0
          ? [
              `sha256 ${source.sha256.slice(0, 12)}…, ${storageOf(written).length} database versions`,
            ]
          : parityDetails,
    },
  ];
  const failed = checks.filter((c) => c.status === 'fail');

  let promotedTo: QuickPromoteResult['promotedTo'] = null;
  if (failed.length === 0) {
    throwIfAborted('recording the promotion');
    const next = touchQuickRecord(record);
    promotedTo = { slug, variant: variant?.id ?? null, at: next.updatedAt };
    await writeQuickRecord(dir, { ...next, promotedTo });
  }

  const result: QuickPromoteResult = {
    from: record.slug,
    variant: variant?.id ?? null,
    slug,
    path: toPosixRelative(ctx.root, dest),
    blueprintSha256: source.sha256,
    databaseVersions: storageOf(written).length,
    checks,
    generate: data,
    promotedTo,
  };
  return {
    data: result,
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'validation',
            `prototypes/${slug} was generated but ${failed.length} check(s) failed: ${failed.map((c) => c.label).join('; ')}`,
            {
              hint: 'quick.json was not updated. Fix the prototype or remove it and promote again.',
            }
          ),
        }
      : {}),
    render(out) {
      generated.render?.(out);
      const { c } = out;
      for (const check of checks) {
        out.info(`${mark(c, check.status)} ${check.label}`);
        for (const detail of check.details) out.info(c.dim(`    ${detail}`));
      }
      if (promotedTo) {
        out.always(
          `${mark(c, 'pass')} Promoted ${c.bold(record.slug)}${variant ? ` (${variant.id})` : ''} → ${c.cyan(result.path)}`
        );
      }
    },
  };
};
