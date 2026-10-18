import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { formatBytes, mark } from '../lib/output.ts';
import { publishPrototype } from '../lib/publish-run.ts';
import { resolveTarget } from '../lib/workspace.ts';
import { formatCommand } from '../publish/cli-tool.ts';
import { createProvider } from '../publish/index.ts';

export const publishCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, registry } = await resolveTarget(ctx, args[0]);
  const provider = createProvider(opt(options, 'provider'), ctx.root);
  const result = await publishPrototype(
    ctx,
    entry,
    provider,
    {
      preview: flag(options, 'preview'),
      production: flag(options, 'production'),
      dryRun: flag(options, 'dryRun'),
      project: opt(options, 'project'),
      branch: opt(options, 'branch'),
      base: opt(options, 'base'),
      includeDevtools: flag(options, 'includeDevtools'),
    },
    registry
  );

  const common = {
    slug: result.slug,
    provider: result.provider,
    experimental: result.experimental,
    project: result.project,
    target: result.target,
    distDir: result.distDir,
    fileCount: result.files,
    totalBytes: result.bytes,
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
        out.always(
          `Would run:\n${[...(result.setup ?? []), result.command ?? []].map((argv) => `  ${c.cyan(formatCommand(argv))}`).join('\n')}`
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
      if (result.experimental)
        out.always(c.yellow('  The adapter is experimental: please verify the URL loads.'));
    },
  };
};
