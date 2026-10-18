import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { formatCommand } from '../publish/cli-tool.ts';
import { STATIC_INSTRUCTIONS } from '../publish/static.ts';
import type { PublishProvider, PublishTarget } from '../publish/types.ts';
import { ProviderError } from '../publish/types.ts';
import { artifactDir, buildPrototype, scanForForeignCode } from './build.ts';
import { CliError } from './output.ts';
import { BUILD_MARKER } from './output-guard.ts';
import { toPosixRelative } from './paths.ts';
import { loadRegistry, type Registry, type RegistryEntry } from './registry.ts';
import type { CommandContext } from './workspace.ts';
import { zipDirectory } from './zip.ts';

export interface PublishRunOptions {
  preview?: boolean;
  production?: boolean;
  dryRun?: boolean;
  project?: string;
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

/** Builds, verifies and publishes one registry entry through the selected provider. */
export async function publishPrototype(
  ctx: CommandContext,
  entry: RegistryEntry,
  provider: PublishProvider,
  options: PublishRunOptions,
  registry?: Registry
): Promise<PublishRunResult> {
  if (options.preview && options.production) {
    throw new CliError('usage', 'Pass --preview or --production, not both.');
  }
  const target: PublishTarget = options.production ? 'production' : 'preview';
  const dryRun = options.dryRun === true;
  if (target === 'production' && !dryRun && !ctx.yes && provider.id !== 'static') {
    throw new CliError('usage', 'Publishing to production needs explicit confirmation.', {
      hint: 'Re-run with --yes (or try --dry-run first to see the exact command).',
    });
  }
  const project = options.project ?? provider.defaultProject(entry.slug);
  const invalidProject = provider.validateProject(project);
  if (invalidProject) throw new CliError('usage', invalidProject);

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
  const input = {
    slug: entry.slug,
    distDir: build.outDir,
    project,
    target,
    ...(options.ensureProject ? { ensureProject: true as const } : {}),
  };
  const common = {
    slug: entry.slug,
    provider: provider.id,
    experimental: provider.experimental,
    project,
    target,
    distDir: toPosixRelative(ctx.root, build.outDir),
    files: build.manifest.fileCount,
    bytes: build.manifest.totalBytes,
    ...(options.ensureProject ? { ensureProject: true as const } : {}),
  };

  if (provider.id === 'static') {
    const zip = await zipDirectory(
      build.outDir,
      join(artifactDir(ctx, entry), `${entry.slug}.zip`)
    );
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
