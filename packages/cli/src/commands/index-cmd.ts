import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { mark } from '../lib/output.ts';
import { toPosixRelative } from '../lib/paths.ts';
import { buildIndex } from '../lib/registry.ts';

export const indexCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const result = await buildIndex(ctx.paths, { useCache: !flag(options, 'force') });
  const { registry } = result;
  return {
    data: {
      registry: toPosixRelative(ctx.root, ctx.paths.registry),
      stats: registry.stats,
      parsed: result.parsed,
      cached: result.cached,
      durationMs: Math.round(result.durationMs * 100) / 100,
      invalid: registry.invalid,
    },
    render(out) {
      const { c } = out;
      // Invalid manifests matter even with --quiet: they are silently missing from the gallery.
      for (const issue of registry.invalid) {
        out.warn(`${mark(c, 'fail')} ${issue.path}`);
        for (const error of issue.errors) out.warn(`    ${c.dim(error)}`);
      }
      out.info(
        `${mark(c, 'pass')} Indexed ${c.bold(String(registry.stats.prototypes))} prototypes and ${c.bold(
          String(registry.stats.templates)
        )} templates in ${result.durationMs.toFixed(1)} ms ${c.dim(
          `(${result.parsed} parsed, ${result.cached} cached)`
        )}`
      );
      if (registry.invalid.length > 0) {
        out.info(c.yellow(`  ${registry.invalid.length} invalid manifest(s) skipped — see above.`));
      }
      out.info(c.dim(`  → ${toPosixRelative(ctx.root, ctx.paths.registry)}`));
    },
  };
};
