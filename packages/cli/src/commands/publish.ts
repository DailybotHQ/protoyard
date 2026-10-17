import { join } from 'node:path';
import { artifactDir, buildPrototype, scanForForeignCode } from '../lib/build.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { CliError, formatBytes, mark } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { resolveTarget } from '../lib/workspace.ts';
import { zipDirectory } from '../lib/zip.ts';
import { formatCommand } from '../publish/cli-tool.ts';
import { createProvider } from '../publish/index.ts';
import { STATIC_INSTRUCTIONS } from '../publish/static.ts';
import { ProviderError, type PublishInput, type PublishTarget } from '../publish/types.ts';

function providerFailure(error: unknown): never {
  if (error instanceof ProviderError) {
    throw new CliError(error.kind, error.message, error.hint ? { hint: error.hint } : {});
  }
  throw error;
}

export const publishCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir, registry } = await resolveTarget(ctx, args[0]);
  const provider = createProvider(opt(options, 'provider'), ctx.root);
  if (flag(options, 'preview') && flag(options, 'production')) {
    throw new CliError('usage', 'Pass --preview or --production, not both.');
  }
  const target: PublishTarget = flag(options, 'production') ? 'production' : 'preview';
  const dryRun = flag(options, 'dryRun');
  if (target === 'production' && !dryRun && !ctx.yes && provider.id !== 'static') {
    throw new CliError('usage', 'Publishing to production needs explicit confirmation.', {
      hint: 'Re-run with --yes (or try --dry-run first to see the exact command).',
    });
  }
  const project = opt(options, 'project') ?? provider.defaultProject(entry.slug);
  const invalidProject = provider.validateProject(project);
  if (invalidProject) throw new CliError('usage', invalidProject);

  // Build and verify locally first: a provider is only contacted with a
  // complete, isolated bundle.
  ctx.out.info(`Building ${ctx.out.c.bold(entry.slug)} for ${provider.label}…`);
  const base = opt(options, 'base');
  const build = await buildPrototype(ctx, entry, dir, {
    ...(base !== undefined ? { base } : {}),
    ...(flag(options, 'includeDevtools') ? { includeDevtools: true } : {}),
  });
  const foreign = await scanForForeignCode(build.outDir, entry, registry.entries);
  if (foreign.length > 0) {
    throw new CliError(
      'validation',
      `The ${entry.slug} bundle contains code from other prototypes.`,
      {
        hint: foreign.map((f) => `${f.file} references ${f.slug}`).join('; '),
      }
    );
  }

  const input: PublishInput = { slug: entry.slug, distDir: build.outDir, project, target };
  const common = {
    slug: entry.slug,
    provider: provider.id,
    experimental: provider.experimental,
    project,
    target,
    distDir: toPosixRelative(ctx.root, build.outDir),
    fileCount: build.manifest.fileCount,
    totalBytes: build.manifest.totalBytes,
  };

  if (provider.id === 'static') {
    const zip = await zipDirectory(
      build.outDir,
      join(artifactDir(ctx, entry), `${entry.slug}.zip`)
    );
    return {
      data: {
        ...common,
        dryRun,
        zip: toPosixRelative(ctx.root, zip.path),
        sha256: zip.sha256,
        size: zip.size,
        instructions: STATIC_INSTRUCTIONS,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'pass')} ${c.bold(entry.slug)} is ready for manual upload: ${c.cyan(toPosixRelative(ctx.root, zip.path))} (${formatBytes(zip.size)})`
        );
        for (const line of STATIC_INSTRUCTIONS) out.always(c.dim(line));
      },
    };
  }

  if (dryRun) {
    // Local checks only (PATH lookup); no provider API is contacted.
    const availability = await provider
      .isAvailable({ localOnly: true })
      .catch(() => ({ available: false, hint: undefined }));
    const command = provider.command(input);
    const setup = provider.setupCommands?.(input) ?? [];
    return {
      data: {
        ...common,
        dryRun: true,
        setup,
        command,
        commandLine: [...setup, command].map(formatCommand).join(' && '),
        toolAvailable: availability.available,
      },
      render(out) {
        const { c } = out;
        out.always(
          `${mark(c, 'pass')} Dry run: ${c.bold(entry.slug)} built and verified (${build.manifest.fileCount} files, ${formatBytes(build.manifest.totalBytes)}).`
        );
        if (provider.experimental)
          out.always(
            c.yellow(
              `! The ${provider.label} adapter is experimental and untested against the live service.`
            )
          );
        out.always(
          `Would run:\n${[...setup, command].map((argv) => `  ${c.cyan(formatCommand(argv))}`).join('\n')}`
        );
        if (!availability.available)
          out.always(
            c.yellow(`! ${provider.label} CLI not found locally. ${availability.hint ?? ''}`)
          );
        out.info(c.dim('Nothing was uploaded.'));
      },
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
    data: {
      ...common,
      dryRun: false,
      url: result.url,
      deploymentId: result.deploymentId ?? null,
      details: result.details ?? {},
    },
    render(out) {
      const { c } = out;
      out.always(
        `${mark(c, 'pass')} Published ${c.bold(entry.slug)} to ${provider.label} (${target})`
      );
      out.always(`  ${c.cyan(result.url)}`);
      if (result.deploymentId) out.info(c.dim(`  deployment ${result.deploymentId}`));
      if (provider.experimental)
        out.always(c.yellow('  The adapter is experimental: please verify the URL loads.'));
    },
  };
};
