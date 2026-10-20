import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, formatBytes, mark, toCliError } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { type LedgerEntry, ledgerPath, readLedger } from '../lib/publish-ledger.ts';
import {
  type PublishRunOptions,
  type PublishRunResult,
  publishPrototype,
} from '../lib/publish-run.ts';
import { filterEntries, loadRegistry, type RegistryEntry } from '../lib/registry.ts';
import { parseCommentsOption } from '../lib/review-worker.ts';
import { type CommandContext, resolveTarget } from '../lib/workspace.ts';
import { formatCommand } from '../publish/cli-tool.ts';
import { createProvider } from '../publish/index.ts';
import type { PublishProvider } from '../publish/types.ts';

function runOptions(options: Record<string, unknown>): PublishRunOptions {
  const comments = parseCommentsOption(options.comments);
  return {
    preview: flag(options, 'preview'),
    production: flag(options, 'production'),
    dryRun: flag(options, 'dryRun'),
    project: opt(options, 'project'),
    branch: opt(options, 'branch'),
    ensureProject: flag(options, 'ensureProject'),
    base: opt(options, 'base'),
    includeDevtools: flag(options, 'includeDevtools'),
    ...(comments ? { comments } : {}),
  };
}

/** Lines for the one-time comments setup the developer runs; the CLI runs none of them. */
export function commentsSetupLines(
  c: Parameters<NonNullable<CommandResult['render']>>[0]['c'],
  comments: NonNullable<PublishRunResult['comments']>
): string[] {
  const { setup } = comments;
  return [
    `Comments: ${comments.store.toUpperCase()} store bound as ${c.bold(comments.binding)}; ${comments.worker.file} (${formatBytes(comments.worker.bytes)}) answers ${comments.routes.include.join(', ')} (${comments.routes.file}); review adapter ${comments.adapter} on ${comments.endpoint}.`,
    'Run once before the first deploy (protoyard runs none of these):',
    ...setup.commands.map((argv) => `  ${c.cyan(formatCommand(argv))}`),
    ...setup.notes.slice(0, 1).map((note) => `  ${note}`),
    'Optional shared review key (not authentication):',
    `  ${c.cyan(formatCommand(setup.secret))}`,
    ...setup.notes.slice(1).map((note) => c.dim(`  ${note}`)),
  ];
}

/**
 * `publish <slug>` keeps the single-prototype output. Several slugs, `--all`
 * or `--tag` switch to batch mode: prototypes only, built and published one
 * after another, continuing past failures, with one summary envelope.
 */
export const publishCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  if (flag(options, 'history')) return publishHistory(ctx, args, options);
  const all = flag(options, 'all');
  const tag = opt(options, 'tag');
  if (all && tag !== undefined) throw new CliError('usage', 'Pass --all or --tag, not both.');
  if ((all || tag !== undefined) && args.length > 0) {
    throw new CliError('usage', 'Pass slugs, --all or --tag <tag>, not a mix.');
  }
  if (!all && tag === undefined && args.length === 0) {
    throw new CliError('usage', 'Pass a slug, several slugs, --all or --tag <tag>.', {
      hint: 'Example: pnpm protoyard publish --all --provider cloudflare --dry-run',
    });
  }
  if (opt(options, 'provider') === undefined) {
    throw new CliError('usage', 'Pass --provider cloudflare, netlify, vercel or static.');
  }
  const provider = createProvider(opt(options, 'provider'), ctx.root);
  if (!all && tag === undefined && args.length === 1) {
    return publishOne(ctx, args[0], provider, runOptions(options));
  }
  if (options.comments !== undefined) {
    throw new CliError('usage', '--comments publishes one prototype at a time.', {
      hint: 'For one shared comments worker over many demos: pnpm protoyard showcase --publish cloudflare --comments --dry-run',
    });
  }
  return publishBatch(ctx, await selectTargets(ctx, args, all, tag), provider, runOptions(options));
};

/** Resolves every target before anything is built, so a typo fails fast. */
async function selectTargets(
  ctx: CommandContext,
  slugs: readonly string[],
  all: boolean,
  tag: string | undefined
): Promise<RegistryEntry[]> {
  if (slugs.length > 0) {
    const targets: RegistryEntry[] = [];
    for (const slug of new Set(slugs)) {
      targets.push((await resolveTarget(ctx, slug, 'prototype')).entry);
    }
    return targets;
  }
  const registry = await loadRegistry(ctx.paths);
  const targets = filterEntries(registry.entries, {
    kind: 'prototype',
    ...(tag !== undefined ? { tag } : {}),
  });
  if (!all && targets.length === 0) {
    throw new CliError('not_found', `No prototype is tagged "${tag}".`, {
      hint: 'Run `pnpm protoyard list --kind prototype` to see the tags.',
    });
  }
  return targets;
}

interface BatchItem {
  slug: string;
  ok: boolean;
  durationMs: number;
  project?: string;
  kind?: PublishRunResult['kind'];
  url?: string;
  deploymentId?: string | null;
  command?: string[];
  commandLine?: string;
  toolAvailable?: boolean;
  zip?: string;
  sha256?: string;
  ledger?: string | null;
  error?: string;
  hint?: string;
}

async function publishBatch(
  ctx: CommandContext,
  targets: readonly RegistryEntry[],
  provider: PublishProvider,
  options: PublishRunOptions
): Promise<CommandResult> {
  if (options.preview && options.production) {
    throw new CliError('usage', 'Pass --preview or --production, not both.');
  }
  if (options.project !== undefined && targets.length > 1) {
    throw new CliError(
      'usage',
      '--project names one provider project; it cannot be shared by several prototypes.',
      {
        hint: `Each prototype uses its default project (${provider.defaultProject('<slug>')}).`,
      }
    );
  }
  const target = options.production ? 'production' : 'preview';
  // Checked once up front: otherwise every prototype would fail the same way.
  if (target === 'production' && !options.dryRun && !ctx.yes && provider.id !== 'static') {
    throw new CliError('usage', 'Publishing to production needs explicit confirmation.', {
      hint: 'Re-run with --yes (or try --dry-run first to see the exact commands).',
    });
  }
  const results: BatchItem[] = [];
  let toolHint: string | undefined;
  // Sequential on purpose, like `build --all`: parallel Vite builds compete for
  // CPU and memory and make failures harder to attribute.
  for (const entry of targets) {
    const started = performance.now();
    try {
      const r = await publishPrototype(ctx, entry, provider, options);
      if (r.kind === 'dry-run' && !r.toolAvailable) toolHint = r.toolHint ?? '';
      results.push({
        slug: r.slug,
        ok: true,
        durationMs: Math.round(performance.now() - started),
        project: r.project,
        kind: r.kind,
        ...(r.url !== undefined ? { url: r.url, deploymentId: r.deploymentId ?? null } : {}),
        ...(r.command !== undefined
          ? { command: r.command, commandLine: r.commandLine, toolAvailable: r.toolAvailable }
          : {}),
        ...(r.zip !== undefined ? { zip: r.zip, sha256: r.sha256 } : {}),
        ledger: r.ledger ?? null,
      });
    } catch (error) {
      const err = toCliError(error);
      results.push({
        slug: entry.slug,
        ok: false,
        durationMs: Math.round(performance.now() - started),
        error: err.message,
        ...(err.hint ? { hint: err.hint } : {}),
      });
    }
  }
  const failed = results.filter((r) => !r.ok);
  return {
    data: {
      provider: provider.id,
      experimental: provider.experimental,
      target,
      dryRun: options.dryRun === true,
      total: results.length,
      failed: failed.length,
      results,
    },
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'failure',
            `${failed.length} of ${results.length} publishes failed.`
          ),
        }
      : {}),
    render(out) {
      const { c } = out;
      if (results.length === 0) out.always('No prototypes to publish.');
      if (provider.experimental)
        out.always(
          c.yellow(
            `! The ${provider.label} adapter is experimental and untested against the live service.`
          )
        );
      for (const r of results) {
        const detail = !r.ok
          ? c.red(r.error ?? '')
          : r.url
            ? c.cyan(r.url)
            : r.commandLine
              ? `would run ${c.cyan(r.commandLine)}`
              : r.zip
                ? `ready for manual upload: ${c.cyan(r.zip)}`
                : '';
        out.always(
          `${mark(c, r.ok ? 'pass' : 'fail')} ${r.slug.padEnd(28)} ${(r.durationMs / 1000).toFixed(1).padStart(6)} s  ${detail}`
        );
        if (!r.ok && r.hint) out.info(`  ${c.dim(r.hint)}`);
      }
      if (toolHint !== undefined)
        out.always(c.yellow(`! ${provider.label} CLI not found locally. ${toolHint}`));
      if (options.dryRun && provider.id !== 'static') out.info(c.dim('Nothing was uploaded.'));
      if (results.length > 0 && failed.length === 0)
        out.always(
          c.green(
            `\nAll ${results.length} prototypes ${options.dryRun ? 'verified' : 'published'}.`
          )
        );
    },
  };
}

async function publishOne(
  ctx: CommandContext,
  slug: string | undefined,
  provider: PublishProvider,
  options: PublishRunOptions
): Promise<CommandResult> {
  const { entry, registry } = await resolveTarget(ctx, slug);
  const result = await publishPrototype(ctx, entry, provider, options, registry);

  const common = {
    slug: result.slug,
    provider: result.provider,
    experimental: result.experimental,
    project: result.project,
    target: result.target,
    distDir: result.distDir,
    fileCount: result.files,
    totalBytes: result.bytes,
    ...(result.ensureProject ? { ensureProject: true as const } : {}),
    ...(result.comments ? { comments: result.comments } : {}),
    ledger: result.ledger ?? null,
  };
  if (result.kind === 'static') {
    return {
      data: {
        ...common,
        dryRun: result.dryRun,
        zip: result.zip,
        sha256: result.sha256,
        size: result.size,
        instructions: result.instructions,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'pass')} ${c.bold(result.slug)} is ready for manual upload: ${c.cyan(result.zip ?? '')} (${formatBytes(result.size ?? 0)})`
        );
        for (const line of result.instructions ?? []) out.always(c.dim(line));
      },
    };
  }
  if (result.kind === 'dry-run') {
    return {
      data: {
        ...common,
        dryRun: true,
        setup: result.setup,
        command: result.command,
        commandLine: result.commandLine,
        toolAvailable: result.toolAvailable,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'pass')} Dry run: ${c.bold(result.slug)} built and verified (${result.files} files, ${formatBytes(result.bytes)}).`
        );
        if (result.experimental)
          out.always(
            c.yellow(
              `! The ${provider.label} adapter is experimental and untested against the live service.`
            )
          );
        if (result.comments)
          for (const line of commentsSetupLines(c, result.comments)) out.always(line);
        out.always(
          `Would run${result.comments ? ' (after the one-time setup)' : ''}:\n${[...(result.setup ?? []), result.command ?? []].map((argv) => `  ${c.cyan(formatCommand(argv))}`).join('\n')}`
        );
        if (!result.toolAvailable)
          out.always(
            c.yellow(`! ${provider.label} CLI not found locally. ${result.toolHint ?? ''}`)
          );
        out.info(c.dim('Nothing was uploaded.'));
      },
    };
  }
  return {
    data: {
      ...common,
      dryRun: false,
      url: result.url,
      deploymentId: result.deploymentId,
      details: result.details,
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Published ${c.bold(result.slug)} to ${provider.label} (${result.target})`
      );
      out.always(`  ${c.cyan(result.url ?? '')}`);
      if (result.deploymentId) out.info(c.dim(`  deployment ${result.deploymentId}`));
      if (result.comments)
        for (const line of commentsSetupLines(c, result.comments)) out.info(line);
      if (result.experimental)
        out.always(c.yellow('  The adapter is experimental: please verify the URL loads.'));
    },
  };
}

/**
 * `publish --history [slug…] [--provider p] [--limit n]`: the last entries of
 * the local deploy ledger, oldest first (like `tail`). Reads only.
 */
async function publishHistory(
  ctx: CommandContext,
  slugs: readonly string[],
  options: Record<string, unknown>
): Promise<CommandResult> {
  if (flag(options, 'all') || opt(options, 'tag') !== undefined) {
    throw new CliError('usage', '--history filters by slug and --provider only.');
  }
  const rawLimit = opt(options, 'limit') ?? '20';
  const limit = Number(rawLimit);
  if (!/^\d+$/.test(rawLimit) || limit < 1) {
    throw new CliError('usage', `--limit must be a positive integer (got "${rawLimit}").`);
  }
  const provider = opt(options, 'provider');
  const path = ledgerPath(ctx.paths);
  const { entries, skipped } = await readLedger(path);
  const wanted = new Set(slugs);
  const matching = entries.filter(
    (e) =>
      (wanted.size === 0 || wanted.has(e.slug)) &&
      (provider === undefined || e.provider === provider)
  );
  const shown = matching.slice(-limit);
  return {
    data: {
      ledger: toPosixRelative(ctx.root, path),
      total: matching.length,
      shown: shown.length,
      skipped,
      entries: shown,
    },
    render(out) {
      const { c } = out;
      if (shown.length === 0) {
        out.always(
          entries.length === 0
            ? `No publishes recorded yet (${toPosixRelative(ctx.root, path)}).`
            : 'No recorded publish matches.'
        );
      }
      for (const e of shown) out.always(historyLine(c, e));
      if (matching.length > shown.length)
        out.info(
          c.dim(`  ${matching.length - shown.length} older entries hidden (--limit ${limit}).`)
        );
      if (skipped > 0) out.always(c.yellow(`! Skipped ${skipped} unreadable ledger lines.`));
    },
  };
}

function historyLine(
  c: Parameters<NonNullable<CommandResult['render']>>[0]['c'],
  e: LedgerEntry
): string {
  const where = `${e.provider} ${e.target}${e.branch ? `:${e.branch}` : ''}`;
  const what =
    e.kind === 'published'
      ? c.cyan(e.url ?? '')
      : e.kind === 'dry-run'
        ? c.dim('dry run, nothing uploaded')
        : `ZIP ${c.cyan(e.zip ?? '')}`;
  const commit = e.commit ? ` ${e.commit.slice(0, 7)}${e.dirty ? '+dirty' : ''}` : '';
  const review = e.review ? c.dim(` comments ${e.review.store}`) : '';
  return `${e.at}  ${e.slug.padEnd(24)} ${where.padEnd(28)} ${what}${c.dim(commit)}${review}`;
}
