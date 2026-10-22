import { existsSync } from 'node:fs';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { PulledReviewCommentsSchema } from '@protoyard/review/report';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { inspectPrototype } from '../lib/inspect.ts';
import { applyListing, readListingConfig } from '../lib/listing.ts';
import { untilSignal } from '../lib/network.ts';
import { CliError, formatBytes, mark } from '../lib/output.ts';
import { guardOutputDir } from '../lib/output-guard.ts';
import { commentsPath, isInside, toPosixRelative } from '../lib/paths.ts';
import { parsePort } from '../lib/ports.ts';
import { type LedgerEntry, ledgerPath, readLedger } from '../lib/publish-ledger.ts';
import {
  type PublishRunOptions,
  type PublishRunResult,
  publishDirectory,
} from '../lib/publish-run.ts';
import { loadRegistry, type RegistryEntry, writeJsonAtomic } from '../lib/registry.ts';
import {
  personaLinks,
  REVIEW_FORMAT,
  type ReviewDeployment,
  type ReviewEntry,
  type ReviewModel,
  renderReviewIndex,
  scenarioLinks,
} from '../lib/review-index-html.ts';
import {
  latestShareEntries,
  readShareLedger,
  type ShareLedgerEntry,
  shareLedgerPath,
} from '../lib/share-ledger.ts';
import { serveStatic } from '../lib/static-server.ts';
import { normalizeBase } from '../lib/vite.ts';
import type { CommandContext } from '../lib/workspace.ts';
import { assertSlug } from '../lib/workspace.ts';
import { formatCommand } from '../publish/cli-tool.ts';
import { createProvider, PROVIDER_IDS } from '../publish/index.ts';

/** Persona links per prototype: the first generated personas, enough for every role in practice. */
const MAX_PERSONAS = 12;

/** Written into the review folder; required before an existing folder is reused. */
export const REVIEW_MARKER = '.protoyard-review';

async function reviewCountsFor(
  ctx: CommandContext,
  slug: string
): Promise<{ open: number; resolved: number; pulledAt: string } | undefined> {
  const path = commentsPath(ctx.paths, slug);
  let value: unknown;
  try {
    const content = await readFile(path);
    if (content.byteLength > 5 * 1024 * 1024) return undefined;
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(content)) as unknown;
  } catch {
    return undefined;
  }
  const parsed = PulledReviewCommentsSchema.safeParse(value);
  if (!parsed.success || parsed.data.slug !== slug) return undefined;
  const roots = parsed.data.comments.filter((comment) => comment.id === comment.threadId);
  return {
    open: roots.filter((comment) => !comment.resolvedAt).length,
    resolved: roots.filter((comment) => Boolean(comment.resolvedAt)).length,
    pulledAt: parsed.data.pulledAt,
  };
}

/** The latest REAL deploy per slug (dry runs and ZIPs carry no URL). */
export function latestDeployments(entries: readonly LedgerEntry[]): Map<string, LedgerEntry> {
  const latest = new Map<string, LedgerEntry>();
  for (const entry of entries) {
    if (entry.kind === 'published' && entry.url) latest.set(entry.slug, entry);
  }
  return latest;
}

/** The latest recorded Claude artifact URL per prototype. */
export function latestArtifactShares(
  entries: readonly ShareLedgerEntry[]
): Map<string, ShareLedgerEntry> {
  return new Map(latestShareEntries(entries).map((entry) => [entry.slug, entry]));
}

function toDeployment(entry: LedgerEntry): ReviewDeployment {
  return {
    url: entry.url as string,
    target: entry.target,
    branch: entry.branch,
    provider: entry.provider,
    at: entry.at,
    commit: entry.commit,
    dirty: entry.dirty,
  };
}

function selectEntries(
  registry: RegistryEntry[],
  deployments: Map<string, LedgerEntry>,
  artifactShares: Map<string, ShareLedgerEntry>,
  options: { fromLedger: boolean; slugs: string[] | null }
): RegistryEntry[] {
  const prototypes = registry.filter((e) => e.kind === 'prototype');
  if (options.slugs) {
    return options.slugs.map((slug) => {
      const found = prototypes.find((e) => e.slug === slug);
      if (!found) {
        throw new CliError('not_found', `No prototype "${slug}" in this workspace.`, {
          hint: 'Run `pnpm protoyard list --kind prototype`.',
        });
      }
      return found;
    });
  }
  return options.fromLedger
    ? prototypes.filter((e) => deployments.has(e.slug) || artifactShares.has(e.slug))
    : prototypes;
}

/** Personas of the default scenario, generated in a child process (fictional data). */
async function personasFor(
  ctx: CommandContext,
  entry: RegistryEntry
): Promise<{ id: string; name: string; role: string | null }[]> {
  const scenario = entry.defaultScenario ?? entry.scenarios[0];
  if (!scenario) return [];
  try {
    const inspection = await inspectPrototype(
      ctx.root,
      join(ctx.root, entry.path),
      'generate',
      scenario
    );
    return inspection.runs?.find((r) => r.id === scenario)?.personas ?? [];
  } catch (error) {
    ctx.out.warn(
      `! No persona links for ${entry.slug}: ${error instanceof Error ? error.message : String(error)}`
    );
    return [];
  }
}

/**
 * `protoyard review-index`: one static page for reviewers that links every
 * prototype's real deployment (from the deploy ledger) with scenario and
 * persona deep links. Prototypes without a recorded deploy are listed as
 * "not deployed" with the command to publish them; no URL is ever guessed.
 */
/** Files `review-index` writes; `--publish` uploads a folder only when it holds nothing else. */
const REVIEW_FILES = new Set(['index.html', 'review-manifest.json', REVIEW_MARKER]);

/**
 * `--publish` uploads `--out` as a public site. It refuses a folder that holds
 * the deploy ledger (always), and any folder other than the default
 * artifacts/review unless `--allow-publish-out` says so explicitly.
 */
function assertPublishableOut(
  ctx: CommandContext,
  outDir: string,
  ledgerFile: string,
  allowOther: boolean
) {
  const out = resolve(outDir);
  if (
    isInside(out, resolve(ledgerFile)) ||
    isInside(out, resolve(ctx.paths.artifacts, 'publish'))
  ) {
    throw new CliError(
      'usage',
      `--out ${toPosixRelative(ctx.root, outDir)} contains the deploy ledger; it would be published.`,
      { hint: 'Publish the review page from its own folder (default artifacts/review).' }
    );
  }
  if (out !== resolve(ctx.paths.artifacts, 'review') && !allowOther) {
    throw new CliError(
      'usage',
      `--publish uploads the whole --out folder; ${toPosixRelative(ctx.root, outDir)} is not the default artifacts/review.`,
      {
        hint: 'Use the default --out, or pass --allow-publish-out to publish this folder explicitly.',
      }
    );
  }
}

async function assertOnlyReviewFiles(outDir: string) {
  const extra = (await readdir(outDir)).filter((name) => !REVIEW_FILES.has(name));
  if (extra.length > 0) {
    throw new CliError(
      'usage',
      `--publish refuses ${outDir}: it holds files review-index did not write (${extra.slice(0, 5).join(', ')}${extra.length > 5 ? ', …' : ''}).`,
      { hint: 'Remove them or publish from an empty folder; the whole folder is uploaded.' }
    );
  }
}

export const reviewIndexCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const fromLedger = flag(options, 'fromLedger');
  const rawSlugs = opt(options, 'slugs');
  if (fromLedger && rawSlugs !== undefined) {
    throw new CliError('usage', 'Pass --from-ledger or --slugs, not both.');
  }
  const slugs =
    rawSlugs === undefined
      ? null
      : [
          ...new Set(
            rawSlugs
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean)
          ),
        ].map((s) => assertSlug(s));
  if (slugs?.length === 0) throw new CliError('usage', '--slugs needs at least one slug.');
  const publishId = opt(options, 'publish');
  const requestedProject = opt(options, 'project');
  const dryRun = flag(options, 'dryRun');
  const production = flag(options, 'production');
  if (publishId === undefined && (requestedProject !== undefined || dryRun || production)) {
    throw new CliError('usage', '--project, --dry-run and --production require --publish.');
  }
  const publishProvider = publishId === undefined ? undefined : createProvider(publishId, ctx.root);
  if (publishProvider?.id === 'static') {
    throw new CliError('usage', '--publish supports cloudflare, netlify or vercel, not static.');
  }
  const provider = opt(options, 'provider') ?? 'cloudflare';
  if (!(PROVIDER_IDS as readonly string[]).includes(provider) || provider === 'static') {
    throw new CliError(
      'usage',
      `--provider must be cloudflare, netlify or vercel (got "${provider}").`
    );
  }
  const base = normalizeBase(opt(options, 'base'));
  const outDir = guardOutputDir({
    root: ctx.root,
    paths: ctx.paths,
    requested: opt(options, 'out') ?? join('artifacts', 'review'),
    marker: REVIEW_MARKER,
    ...(flag(options, 'allowExternalOut') ? { allowExternal: true } : {}),
  });

  // The review index lists what the gallery lists (protoyard.workspace.json).
  const listing = readListingConfig(ctx.root);
  if (listing.problem) ctx.out.warn(listing.problem);
  const registry = applyListing(await loadRegistry(ctx.paths), listing.rule).registry;
  const ledgerOption = opt(options, 'ledger');
  const ledgerFile =
    ledgerOption === undefined ? ledgerPath(ctx.paths) : resolve(ctx.root, ledgerOption);
  if (ledgerOption !== undefined && !existsSync(ledgerFile)) {
    throw new CliError('not_found', `No ledger file at ${ledgerOption}.`);
  }
  if (publishProvider) {
    assertPublishableOut(ctx, outDir, ledgerFile, flag(options, 'allowPublishOut'));
  }
  const { entries: ledgerEntries, skipped } = await readLedger(ledgerFile);
  const deployments = latestDeployments(ledgerEntries);
  const shareLedger = await readShareLedger(shareLedgerPath(ctx));
  const artifactShares = latestArtifactShares(shareLedger.entries);
  const selected = selectEntries(registry.entries, deployments, artifactShares, {
    fromLedger,
    slugs,
  }).sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const withPersonas = options.personas !== false;

  const entries: ReviewEntry[] = [];
  for (const entry of selected) {
    const deployed = deployments.get(entry.slug);
    const deployment = deployed ? toDeployment(deployed) : null;
    const artifactShare = artifactShares.get(entry.slug);
    const reviewCounts = await reviewCountsFor(ctx, entry.slug);
    entries.push({
      slug: entry.slug,
      name: entry.name,
      description: entry.description,
      icon: entry.icon,
      deployment,
      ...(artifactShare
        ? { artifactShare: { url: artifactShare.url, visibility: artifactShare.visibility } }
        : {}),
      scenarioLinks: deployment ? scenarioLinks(deployment.url, entry.scenarios) : [],
      personaLinks:
        deployment && withPersonas
          ? personaLinks(deployment.url, (await personasFor(ctx, entry)).slice(0, MAX_PERSONAS))
          : [],
      ...(reviewCounts ? { reviewCounts } : {}),
      publishCommand: `pnpm protoyard publish ${entry.slug} --provider ${provider}`,
    });
  }

  const model: ReviewModel = {
    format: REVIEW_FORMAT,
    formatVersion: 1,
    title: opt(options, 'title') ?? 'Prototype review',
    base,
    entries,
  };
  const html = renderReviewIndex(model);
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, 'index.html'), html, 'utf8');
  await writeJsonAtomic(join(outDir, 'review-manifest.json'), model);
  const markerPath = join(outDir, REVIEW_MARKER);
  await writeFile(markerPath, '', 'utf8');

  let publication: PublishRunResult | undefined;
  if (publishProvider) {
    // The whole folder is uploaded, so it must hold only what this command wrote.
    await assertOnlyReviewFiles(outDir);
    // This marker protects future local regeneration; it is not part of the site.
    await rm(markerPath, { force: true });
    try {
      const publishOptions: PublishRunOptions = {
        dryRun,
        production,
        ...(requestedProject !== undefined ? { project: requestedProject } : {}),
      };
      publication = await publishDirectory(
        ctx,
        { slug: 'review', distDir: outDir },
        publishProvider,
        publishOptions
      );
    } finally {
      await writeFile(markerPath, '', 'utf8');
    }
  }

  const deployedCount = entries.filter((e) => e.deployment).length;
  const out = toPosixRelative(ctx.root, outDir);
  const server = flag(options, 'serve')
    ? await serveStatic({
        dir: outDir,
        base,
        port: parsePort(opt(options, 'port'), 4520),
        host: '127.0.0.1',
        strictPort: flag(options, 'strictPort'),
        spa: false,
      })
    : null;
  return {
    data: {
      ...(server ? { url: server.url } : {}),
      ledger: toPosixRelative(ctx.root, ledgerFile),
      outDir: out,
      index: `${out}/index.html`,
      manifest: `${out}/review-manifest.json`,
      bytes: Buffer.byteLength(html),
      total: entries.length,
      deployed: deployedCount,
      notDeployed: entries.filter((e) => !e.deployment).map((e) => e.slug),
      ledgerSkipped: skipped,
      ...(publication
        ? {
            publication: {
              provider: publication.provider,
              experimental: publication.experimental,
              target: publication.target,
              project: publication.project,
              dryRun: publication.dryRun,
              distDir: publication.distDir,
              fileCount: publication.files,
              totalBytes: publication.bytes,
              ...(publication.kind === 'dry-run'
                ? {
                    command: publication.command,
                    commandLine: publication.commandLine,
                    toolAvailable: publication.toolAvailable,
                  }
                : { url: publication.url }),
            },
          }
        : {}),
    },
    render(o) {
      const { c } = o;
      o.always(
        `${mark(c, 'pass')} Review index → ${c.cyan(`${out}/index.html`)} (${deployedCount} of ${entries.length} deployed)`
      );
      for (const e of entries) {
        o.info(
          `  ${e.slug.padEnd(28)} ${e.deployment ? c.cyan(e.deployment.url) : c.dim(`not deployed: ${e.publishCommand}`)}`
        );
      }
      if (skipped > 0) o.always(c.yellow(`! Skipped ${skipped} unreadable ledger lines.`));
      if (publication?.kind === 'dry-run') {
        o.always(
          `${mark(c, 'pass')} Dry run: review index ready (${publication.files} files, ${formatBytes(publication.bytes)}).`
        );
        o.always(
          `Would run:\n  ${c.cyan(publication.commandLine ?? formatCommand(publication.command ?? []))}`
        );
        if (publication.experimental)
          o.always(
            c.yellow(
              `! The ${publishProvider?.label} adapter is experimental and untested against the live service.`
            )
          );
        if (!publication.toolAvailable && publication.toolHint)
          o.always(
            c.yellow(`! ${publishProvider?.label} CLI not found locally. ${publication.toolHint}`)
          );
        o.info(c.dim('Nothing was uploaded.'));
      } else if (publication?.kind === 'published') {
        if (publication.experimental)
          o.always(
            c.yellow(
              `! The ${publishProvider?.label} adapter is experimental and untested against the live service.`
            )
          );
        o.always(
          `${mark(c, 'pass')} Published review index to ${publishProvider?.label} (${publication.target})`
        );
        if (publication.url) o.always(`  ${c.cyan(publication.url)}`);
      }
      if (server) o.always(`  Serving at ${c.cyan(server.url)} (Ctrl+C to stop)`);
    },
    ...(server ? { keepAlive: untilSignal(() => server.close()) } : {}),
  };
};
