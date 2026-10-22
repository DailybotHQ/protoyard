import { existsSync } from 'node:fs';
import { mkdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  type BlueprintKind,
  blueprintIdentity,
  blueprintKind,
  loadUntrustedDocument,
} from '@protoyard/blueprint';
import type { CommandResult, Handler } from '../../lib/command.ts';
import { flag, opt } from '../../lib/command.ts';
import { CliError, mark } from '../../lib/output.ts';
import { guardOutputFile } from '../../lib/output-guard.ts';
import { toPosixRelative, workspacePaths } from '../../lib/paths.ts';
import {
  buildQuickArtifact,
  quickArtifactPublishArguments,
  recordQuickArtifactShare,
  writeQuickArtifact,
} from '../../lib/quick/artifact.ts';
import { writeQuickAtomic } from '../../lib/quick/atomic-write.ts';
import { quickPlayerDir } from '../../lib/quick/paths.ts';
import {
  buildSingleFile,
  QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES,
  SingleFileError,
  singleFileEntryFor,
} from '../../lib/quick/single-file.ts';
import { resolveQuickServeTarget } from './serve.ts';

/**
 * `protoyard quick export <slug|dir> --single-file [--out <file>] [--force]`:
 * the exploration as ONE self-contained HTML file (the player's JS and CSS
 * plus the blueprint) that opens from `file://` with no server, no network
 * and no service worker. By default it lands next to the exploration as
 * `<dir>/<slug>.html`; `--out` writes under artifacts/ or tmp/ instead.
 *
 * `--target artifact` packs that single file as a Claude artifact page in
 * `<dir>/artifact/` and prints the publish arguments; it never publishes.
 * `--target artifact --url <url>` then records the URL the Artifact tool
 * returned in the exploration's quick.json (lib/quick/artifact.ts).
 */

export interface QuickExportResult {
  slug: string;
  /** The blueprint kind (`app`, `deck`, `page`, `doc`); a content kind starts from its own page. */
  kind: BlueprintKind;
  /** The player page the file was built from (`index`, `deck`, `page`, `doc`). */
  entry: string;
  dir: string;
  /** The written file, relative to the workspace. */
  file: string;
  bytes: number;
  budgetBytes: number;
  chunks: number;
  stylesheets: number;
  playerVersion: string;
}

export interface QuickArtifactExportResult {
  slug: string;
  kind: BlueprintKind;
  dir: string;
  target: 'artifact';
  /** The pack folder, relative to the workspace. */
  pack: string;
  page: { path: string; bytes: number; sha256: string };
  /** The Artifact tool's publish arguments (one page, no supporting files). */
  publish: { file_path: string; title: string; icon: string; description: string };
  playerVersion: string;
}

export interface QuickArtifactRecordResult {
  slug: string;
  dir: string;
  target: 'artifact';
  recorded: { url: string; visibility: 'private'; sha256: string; at: string };
  shares: number;
}

export const quickExportCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const exportTarget = opt(options, 'target');
  if (exportTarget !== undefined && exportTarget !== 'artifact') {
    throw new CliError(
      'usage',
      `Unknown export target "${exportTarget}"; the only one is artifact.`,
      {
        hint: 'protoyard quick export <slug> --target artifact',
      }
    );
  }
  const artifact = exportTarget === 'artifact';
  if (artifact && flag(options, 'singleFile')) {
    throw new CliError('usage', 'Choose one format: --single-file or --target artifact.');
  }
  if (!artifact && !flag(options, 'singleFile')) {
    throw new CliError('usage', 'Choose an export format: --single-file or --target artifact.', {
      hint: 'protoyard quick export <slug> --single-file',
    });
  }
  const url = opt(options, 'url');
  if (url !== undefined && !artifact) {
    throw new CliError('usage', '--url records an artifact share; use it with --target artifact.');
  }
  if (artifact && opt(options, 'out') !== undefined) {
    throw new CliError('usage', 'The artifact pack is always written to <exploration>/artifact/.', {
      hint: 'Drop --out.',
    });
  }
  const target = await resolveQuickServeTarget({
    workspaceRoot: ctx.root,
    cwd: process.cwd(),
    target: args[0] ?? '',
  });
  if (url !== undefined) {
    const { share, shares } = await recordQuickArtifactShare(target.dir, url);
    const data: QuickArtifactRecordResult = {
      slug: target.slug,
      dir: toPosixRelative(ctx.root, target.dir),
      target: 'artifact',
      recorded: { url: share.url, visibility: 'private', sha256: share.sha256, at: share.at },
      shares,
    };
    return {
      data,
      render(o) {
        const { c } = o;
        o.always(`${mark(c, 'pass')} Recorded ${c.bold(target.slug)} artifact share.`);
        o.always(`  url         ${share.url}`);
        o.always('  visibility  private at record time');
        o.always(`  page        ${share.sha256}`);
        o.always(`  record      ${data.dir}/quick.json (${shares} share(s))`);
      },
    };
  }
  const playerDir =
    target.layout === 'shared'
      ? quickPlayerDir(target.root, target.playerVersion)
      : join(target.dir, 'player');

  // The exploration's blueprint is read back as untrusted input, like any source.
  const blueprintText = await readFile(join(target.dir, 'blueprint.json'), 'utf8').catch(() => {
    throw new CliError('not_found', `The exploration has no blueprint.json (${target.dir}).`);
  });
  // Any kind: apps keep the app loader's contract; decks, pages and docs their own.
  const loaded = await loadUntrustedDocument(blueprintText);
  if (!loaded.success) {
    throw new CliError('validation', 'The exploration’s blueprint.json is not a valid blueprint.', {
      hint: loaded.issues
        .slice(0, 3)
        .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
        .join('; '),
    });
  }

  const out = opt(options, 'out');
  const file = artifact
    ? join(target.dir, 'artifact', 'page.html')
    : out !== undefined
      ? guardOutputFile({ root: ctx.root, paths: workspacePaths(ctx.root), requested: out })
      : join(target.dir, `${target.slug}.html`);
  if (!artifact && existsSync(file) && !flag(options, 'force')) {
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
      // A deck, page or doc starts from its own player page: only that kind's chunks.
      entry: singleFileEntryFor(loaded.blueprint),
    });
  } catch (error) {
    if (error instanceof SingleFileError) {
      throw new CliError('validation', error.message, {
        hint: error.issues.slice(0, 3).join('; ') || undefined,
      });
    }
    throw error;
  }
  const budgetBytes = QUICK_SINGLE_FILE_ENTRY_BUDGET_BYTES[built.entry];
  if (built.bytes > budgetBytes) {
    throw new CliError(
      'validation',
      `The single file is ${built.bytes} bytes, over the ${budgetBytes}-byte budget.`,
      { hint: 'Share the exploration folder or a #bp= link instead.' }
    );
  }
  if (artifact) {
    const pack = buildQuickArtifact({
      singleFileHtml: built.html,
      slug: target.slug,
      blueprint: loaded.blueprint,
      blueprintSha256: (await blueprintIdentity(loaded.blueprint)).sha256,
      playerVersion: target.playerVersion,
    });
    const { packDir } = await writeQuickArtifact(target.dir, pack);
    const data: QuickArtifactExportResult = {
      slug: target.slug,
      kind: blueprintKind(loaded.blueprint),
      dir: toPosixRelative(ctx.root, target.dir),
      target: 'artifact',
      pack: toPosixRelative(ctx.root, packDir),
      page: {
        path: toPosixRelative(ctx.root, join(packDir, pack.manifest.page.path)),
        bytes: pack.manifest.page.bytes,
        sha256: pack.manifest.page.sha256,
      },
      publish: quickArtifactPublishArguments(pack.manifest, packDir),
      playerVersion: target.playerVersion,
    };
    return {
      data,
      render(o) {
        const { c } = o;
        o.always(
          `${mark(c, 'pass')} ${c.bold(target.slug)} → ${c.cyan(data.page.path)} (${(data.page.bytes / 1024 / 1024).toFixed(2)} MB, one page)`
        );
        o.always(`  title        ${data.publish.title}`);
        o.always(`  icon         ${data.publish.icon}`);
        o.always(`  description  ${data.publish.description}`);
        o.info(
          c.dim(
            '  Not published. Publishing is a separate, consented step with the Artifact tool; then record the URL with --url.'
          )
        );
      },
    };
  }
  await mkdir(dirname(file), { recursive: true });
  await writeQuickAtomic(file, built.html);

  const data: QuickExportResult = {
    slug: target.slug,
    kind: blueprintKind(loaded.blueprint),
    entry: built.entry,
    dir: toPosixRelative(ctx.root, target.dir),
    file: toPosixRelative(ctx.root, file),
    bytes: built.bytes,
    budgetBytes,
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
