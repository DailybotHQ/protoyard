import {
  assertSafeGitRef,
  gitDiffNameOnly,
  type MapChangedPathsResult,
  mapChangedPaths,
} from '../lib/affected.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { opt } from '../lib/command.ts';
import { CliError, mark } from '../lib/output.ts';
import { loadRegistry } from '../lib/registry.ts';

const FORMATS = ['text', 'csv'] as const;

export interface AffectedCommandData extends MapChangedPathsResult {
  since: string;
  range: string;
  changedPaths: string[];
  changedCount: number;
  durationMs: number;
  csv: string;
}

export const affectedCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const sinceRaw = opt(options, 'since');
  if (!sinceRaw) {
    throw new CliError('usage', 'Missing required option --since <ref>.', {
      hint: 'Example: pnpm protoyard affected --since HEAD~1 --json',
    });
  }
  const since = assertSafeGitRef(sinceRaw);
  const format = opt(options, 'format') ?? 'text';
  if (!(FORMATS as readonly string[]).includes(format)) {
    throw new CliError('usage', `--format must be one of ${FORMATS.join(', ')}.`);
  }

  const started = performance.now();
  const diff = await gitDiffNameOnly(ctx.root, since);
  const registry = await loadRegistry(ctx.paths);
  const mapped = mapChangedPaths(diff.paths, registry);
  const durationMs = Math.round((performance.now() - started) * 100) / 100;
  const csv = mapped.slugs.join(',');

  const data: AffectedCommandData = {
    since,
    range: diff.range,
    changedPaths: diff.paths,
    changedCount: diff.paths.length,
    slugs: mapped.slugs,
    reasons: mapped.reasons,
    all: mapped.all,
    durationMs,
    csv,
  };

  return {
    data,
    render(out) {
      const { c } = out;
      if (format === 'csv') {
        // Bare CSV on stdout for shell capture: $(pnpm protoyard affected --since x --format csv)
        out.always(csv);
        return;
      }
      const label = mapped.all
        ? 'all prototypes (shared change)'
        : mapped.slugs.length === 0
          ? 'no prototypes'
          : `${mapped.slugs.length} prototype(s)`;
      out.always(
        `${mark(c, 'pass')} Affected ${c.bold(label)} since ${c.cyan(since)} ${c.dim(
          `(${diff.paths.length} path(s), ${durationMs.toFixed(1)} ms)`
        )}`
      );
      if (mapped.slugs.length === 0) {
        out.info(c.dim('  Nothing to build — docs/meta-only diff or empty range.'));
        return;
      }
      for (const slug of mapped.slugs) {
        const reason = mapped.reasons[slug] ?? '';
        out.info(`  ${c.bold(slug)}${reason ? c.dim(`  (${reason})`) : ''}`);
      }
      if (mapped.slugs.length > 0) {
        out.info(c.dim(`  csv: ${csv}`));
      }
    },
  };
};
