import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { formatCommand } from '../publish/cli-tool.ts';
import { validateCloudflareBranch } from '../publish/cloudflare.ts';
import { STATIC_INSTRUCTIONS } from '../publish/static.ts';
import type { PublishProvider, PublishTarget } from '../publish/types.ts';
import { ProviderError } from '../publish/types.ts';
import { artifactDir, buildPrototype, scanForForeignCode } from './build.ts';
import { digestDirectory } from './checksum.ts';
import { CliError } from './output.ts';
import { BUILD_MARKER } from './output-guard.ts';
import { toPosixRelative } from './paths.ts';
import {
  appendLedgerEntry,
  buildDigest,
  gitState,
  LEDGER_FORMAT,
  ledgerPath,
} from './publish-ledger.ts';
import { loadRegistry, type Registry, type RegistryEntry } from './registry.ts';
import type { CommandContext } from './workspace.ts';
import { zipDirectory } from './zip.ts';

export interface PublishRunOptions {
  preview?: boolean;
  production?: boolean;
  dryRun?: boolean;
  project?: string;
  branch?: string;
  base?: string;
  includeDevtools?: boolean;
  /** Cloudflare: create the Pages project when missing (opt-in). */
  ensureProject?: boolean;
}

export interface PublishRunResult {
  slug: string;
  provider: PublishProvider['id'];
  target: PublishTarget;
  project: string;
  dryRun: boolean;
  files: number;
  bytes: number;
  experimental: boolean;
  distDir: string;
  kind: 'static' | 'dry-run' | 'published';
  /** sha256 over the built files' paths and hashes (see publish-ledger.ts). */
  buildSha256: string;
  /** Cloudflare preview branch, when one was passed. */
  branch?: string;
  /** Workspace-relative ledger file the result was recorded in; null if recording failed. */
  ledger?: string | null;
  /** Present when `--ensure-project` was requested (Cloudflare). */
  ensureProject?: boolean;
  zip?: string;
  sha256?: string;
  size?: number;
  instructions?: string[];
  setup?: string[][];
  command?: string[];
  commandLine?: string;
  toolAvailable?: boolean;
  toolHint?: string;
  url?: string;
  deploymentId?: string | null;
  details?: Record<string, string>;
}

function providerFailure(error: unknown): never {
  if (error instanceof ProviderError) {
    throw new CliError(error.kind, error.message, error.hint ? { hint: error.hint } : {});
  }
  throw error;
}

/**
 * Builds, verifies and publishes one registry entry through the selected
 * provider, then records the completed result in the deploy ledger. A ledger
 * failure is reported but never undoes or hides a deploy that happened.
 */
export async function publishPrototype(
  ctx: CommandContext,
  entry: RegistryEntry,
  provider: PublishProvider,
  options: PublishRunOptions,
  registry?: Registry
): Promise<PublishRunResult> {
  const result = await publishUnrecorded(ctx, entry, provider, options, registry);
  const path = ledgerPath(ctx.paths);
  try {
    const git = await gitState(ctx.root);
    await appendLedgerEntry(path, {
      format: LEDGER_FORMAT,
      formatVersion: 1,
      at: new Date().toISOString(),
      slug: result.slug,
      provider: result.provider,
      kind: result.kind,
      dryRun: result.dryRun,
      target: result.target,
      branch: result.branch ?? null,
      project: result.project,
      url: result.kind === 'published' ? (result.url ?? null) : null,
      deploymentId: result.kind === 'published' ? (result.deploymentId ?? null) : null,
      commit: git.commit,
      dirty: git.dirty,
      buildSha256: result.buildSha256,
      fileCount: result.files,
      totalBytes: result.bytes,
      zip: result.zip ?? null,
      zipSha256: result.kind === 'static' ? (result.sha256 ?? null) : null,
    });
    return { ...result, ledger: toPosixRelative(ctx.root, path) };
  } catch (error) {
    ctx.out.warn(
      `! Could not record ${result.slug} in ${toPosixRelative(ctx.root, path)}: ${error instanceof Error ? error.message : String(error)}`
    );
    return { ...result, ledger: null };
  }
}

async function publishUnrecorded(
  ctx: CommandContext,
  entry: RegistryEntry,
  provider: PublishProvider,
  options: PublishRunOptions,
  registry?: Registry
): Promise<PublishRunResult> {
  preparePublish(ctx, entry.slug, provider, options);

  ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)} for ${provider.label}…`);
  const dir = join(ctx.root, entry.path);
  const resolvedRegistry = registry ?? (await loadRegistry(ctx.paths));
  const build = await buildPrototype(ctx, entry, dir, {
    ...(options.base !== undefined ? { base: options.base } : {}),
    ...(options.includeDevtools ? { includeDevtools: true } : {}),
  });
  const foreign = await scanForForeignCode(build.outDir, entry, resolvedRegistry.entries);
  if (foreign.length > 0) {
    throw new CliError(
      'validation',
      `The ${entry.slug} bundle contains code from other prototypes.`,
      { hint: foreign.map((f) => `${f.file} references ${f.slug}`).join('; ') }
    );
  }

  // The build marker is local bookkeeping and must never reach a provider.
  await rm(join(build.outDir, BUILD_MARKER), { force: true });
  return publishDirectory(
    ctx,
    {
      slug: entry.slug,
      distDir: build.outDir,
      zipPath: join(artifactDir(ctx, entry), `${entry.slug}.zip`),
    },
    provider,
    options
  );
}

export interface PublishDirectoryInput {
  /** Used by the adapter command and as the source for its default project. */
  slug: string;
  /** Absolute path to an already-built static directory. */
  distDir: string;
  /** Destination ZIP path when the static manual-upload adapter is selected. */
  zipPath?: string;
}

/** Publishes an existing static directory through the same provider contract as prototypes. */
export async function publishDirectory(
  ctx: CommandContext,
  directory: PublishDirectoryInput,
  provider: PublishProvider,
  options: PublishRunOptions
): Promise<PublishRunResult> {
  const { target, dryRun, project } = preparePublish(ctx, directory.slug, provider, options);
  const files = await digestDirectory(directory.distDir);
  const common = {
    slug: directory.slug,
    provider: provider.id,
    experimental: provider.experimental,
    project,
    target,
    distDir: toPosixRelative(ctx.root, directory.distDir),
    files: files.length,
    bytes: files.reduce((sum, file) => sum + file.size, 0),
    buildSha256: buildDigest(files),
    ...(options.branch !== undefined ? { branch: options.branch } : {}),
    ...(options.ensureProject ? { ensureProject: true as const } : {}),
  };
  const input = {
    slug: directory.slug,
    distDir: directory.distDir,
    project,
    target,
    ...(options.branch !== undefined ? { branch: options.branch } : {}),
    ...(options.ensureProject ? { ensureProject: true as const } : {}),
  };

  if (provider.id === 'static') {
    if (!directory.zipPath) {
      throw new CliError('usage', 'The static adapter needs a ZIP destination for this directory.');
    }
    const zip = await zipDirectory(directory.distDir, directory.zipPath);
    return {
      ...common,
      kind: 'static',
      dryRun,
      zip: toPosixRelative(ctx.root, zip.path),
      sha256: zip.sha256,
      size: zip.size,
      instructions: STATIC_INSTRUCTIONS,
    };
  }

  if (dryRun) {
    const availability = await provider
      .isAvailable({ localOnly: true })
      .catch(() => ({ available: false, hint: undefined }));
    const command = provider.command(input);
    const setup = provider.setupCommands?.(input) ?? [];
    return {
      ...common,
      kind: 'dry-run',
      dryRun: true,
      setup,
      command,
      commandLine: [...setup, command].map(formatCommand).join(' && '),
      toolAvailable: availability.available,
      toolHint: availability.hint,
    };
  }

  const availability = await provider.isAvailable();
  if (!availability.available) {
    throw new CliError(
      'provider',
      `${provider.label} CLI is not available.`,
      availability.hint ? { hint: availability.hint } : {}
    );
  }
  const auth = await provider.isAuthenticated().catch(providerFailure);
  if (!auth.authenticated) {
    throw new CliError(
      'auth',
      `Not authenticated with ${provider.label} (${auth.detail}).`,
      auth.hint ? { hint: auth.hint } : {}
    );
  }
  ctx.out.info(`Deploying to ${provider.label} (${target})…`);
  const result = await provider.publish(input).catch(providerFailure);
  return {
    ...common,
    kind: 'published',
    dryRun: false,
    url: result.url,
    deploymentId: result.deploymentId ?? null,
    details: result.details ?? {},
  };
}

function preparePublish(
  ctx: CommandContext,
  slug: string,
  provider: PublishProvider,
  options: PublishRunOptions
): { target: PublishTarget; dryRun: boolean; project: string } {
  if (options.preview && options.production) {
    throw new CliError('usage', 'Pass --preview or --production, not both.');
  }
  const target: PublishTarget = options.production ? 'production' : 'preview';
  const dryRun = options.dryRun === true;
  if (options.branch !== undefined) {
    if (provider.id !== 'cloudflare') {
      throw new CliError('usage', `--branch is not supported by the ${provider.label} adapter.`);
    }
    if (target === 'production') {
      throw new CliError('usage', '--branch can only be used with preview deployments.');
    }
    const invalidBranch = validateCloudflareBranch(options.branch);
    if (invalidBranch) throw new CliError('usage', invalidBranch);
  }
  if (target === 'production' && !dryRun && !ctx.yes && provider.id !== 'static') {
    throw new CliError('usage', 'Publishing to production needs explicit confirmation.', {
      hint: 'Re-run with --yes (or try --dry-run first to see the exact command).',
    });
  }
  const project = options.project ?? provider.defaultProject(slug);
  const invalidProject = provider.validateProject(project);
  if (invalidProject) throw new CliError('usage', invalidProject);
  return { target, dryRun, project };
}
