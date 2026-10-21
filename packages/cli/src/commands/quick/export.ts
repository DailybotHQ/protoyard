import { existsSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { loadUntrustedBlueprint } from '@protoyard/blueprint';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { guardOutputFile } from '../../lib/output-guard.ts';
import { toPosixRelative, workspacePaths } from '../../lib/paths.ts';
import { quickPlayerDir } from '../../lib/quick/paths.ts';
import {
  buildSingleFile,
  QUICK_SINGLE_FILE_BUDGET_BYTES,
  SingleFileError,
} from '../../lib/quick/single-file.ts';
import { resolveQuickServeTarget } from './serve.ts';

/**
 * `protoyard quick export <slug|dir> --single-file [--out <file>] [--force]`:
 * the exploration as ONE self-contained HTML file (the player's JS and CSS
 * plus the blueprint) that opens from `file://` with no server, no network
 * and no service worker. By default it lands next to the exploration as
 * `<dir>/<slug>.html`; `--out` writes under artifacts/ or tmp/ instead.
 */

export interface QuickExportResult {
  slug: string;
  dir: string;
  /** The written file, relative to the workspace. */
  file: string;
  bytes: number;
  budgetBytes: number;
  chunks: number;
  stylesheets: number;
  playerVersion: string;
}

export const quickExportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  if (!flag(options, 'singleFile')) {
    throw new CliError('usage', 'Choose an export format: --single-file is the only one so far.', {
      hint: 'protoyard quick export <slug> --single-file',
    });
  }
  const target = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target: args[0] ?? '',
  });
  const playerDir =
    target.layout === 'shared'
      ? quickPlayerDir(target.root, target.playerVersion)
      : join(target.dir, 'player');

  // The exploration's blueprint is read back as untrusted input, like any source.
  const blueprintText = await readFile(join(target.dir, 'blueprint.json'), 'utf8').catch(() => {
    throw new CliError('not_found', `The exploration has no blueprint.json (${target.dir}).`);
  });
  const loaded = loadUntrustedBlueprint(blueprintText);
  if (!loaded.success) {
    throw new CliError('validation', 'The exploration’s blueprint.json is not a valid blueprint.', {
      hint: loaded.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    });
  }

  const out = opt(options, 'out');
  const file =
    out !== undefined
      ? guardOutputFile({ root: ctx.root, paths: workspacePaths(ctx.root), requested: out })
      : join(target.dir, `${target.slug}.html`);
  if (existsSync(file) && !flag(options, 'force')) {
    throw new CliError('conflict', `${toPosixRelative(ctx.root, file)} already exists.`, {
      hint: 'Pass --force to replace it.',
    });
  }

  let built: Awaited<ReturnType<typeof buildSingleFile>>;
  try {
    built = await buildSingleFile({
      playerDir,
      blueprintJson: JSON.stringify(loaded.blueprint),
      title: loaded.blueprint.name,
    });
  } catch (error) {
    if (error instanceof SingleFileError) {
      throw new CliError('validation', error.message, {
        hint: error.issues.slice(0, 3).join('; ') || undefined,
      });
    }
    throw error;
  }
  if (built.bytes > QUICK_SINGLE_FILE_BUDGET_BYTES) {
    throw new CliError(
      'validation',
      `The single file is ${built.bytes} bytes, over the ${QUICK_SINGLE_FILE_BUDGET_BYTES}-byte budget.`,
      { hint: 'Share the exploration folder or a #bp= link instead.' }
    );
  }
  await mkdir(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  await writeFile(temp, built.html, 'utf8');
  await rename(temp, file);

  const data: QuickExportResult = {
    slug: target.slug,
    dir: toPosixRelative(ctx.root, target.dir),
    file: toPosixRelative(ctx.root, file),
    bytes: built.bytes,
    budgetBytes: QUICK_SINGLE_FILE_BUDGET_BYTES,
    chunks: built.chunks,
    stylesheets: built.stylesheets,
    playerVersion: target.playerVersion,
  };
  return {
    data,
    render(o) {
      const { c } = o;
      o.always(
        `${mark(c, 'pass')} ${c.bold(target.slug)} → ${c.cyan(data.file)} (${(built.bytes / 1024 / 1024).toFixed(2)} MB, one file)`
      );
      o.info(
        c.dim(
          '  Opens from file:// with no server or network. Data stays in this browser. Simulated data only.'
        )
      );
    },
  };
};
