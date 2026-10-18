import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { loadBudgets, resolveBudget } from '../lib/budgets.ts';
import {
  artifactDir,
  BUILD_MANIFEST_FILENAME,
  type BuildManifest,
  buildPrototype,
} from '../lib/build.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError, formatBytes, formatTable, mark, toCliError } from '../lib/output.ts';
import { loadRegistry, type RegistryEntry } from '../lib/registry.ts';
import { resolveTarget } from '../lib/workspace.ts';

const BundleSchema = z.object({
  initialJsGzip: z.number().finite().nonnegative(),
  cssGzip: z.number().finite().nonnegative(),
});

export interface BudgetMetricResult {
  metric: 'initialJsGzip' | 'cssGzip';
  value: number;
  budget: number;
  headroom: number;
  ok: boolean;
}

export interface BudgetPrototypeResult {
  slug: string;
  metrics: BudgetMetricResult[];
  ok: boolean;
  error?: string;
}

export interface BudgetCommandData {
  total: number;
  failed: number;
  results: BudgetPrototypeResult[];
}

export const budgetCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const all = flag(options, 'all');
  const skipBuild = flag(options, 'skipBuild');
  if (args.length > 1) throw new CliError('usage', 'Pass one <slug> or --all, not both.');
  if (all && args[0]) throw new CliError('usage', 'Pass either <slug> or --all, not both.');
  if (!all && !args[0]) {
    throw new CliError('usage', 'Pass a prototype <slug> or --all.', {
      hint: 'Use --skip-build to check the latest build-manifest.json without rebuilding.',
    });
  }

  const entries = all
    ? (await loadRegistry(ctx.paths)).entries.filter((entry) => entry.kind === 'prototype')
    : [(await resolveTarget(ctx, args[0], 'prototype')).entry];
  const config = await loadBudgets(ctx.root);
  const results: BudgetPrototypeResult[] = [];
  let budgetExceeded = false;
  let firstError: CliError | undefined;

  for (const entry of entries) {
    try {
      const manifest = skipBuild
        ? await readBuildManifest(ctx, entry)
        : (await buildPrototype(ctx, entry, join(ctx.root, entry.path), {})).manifest;
      const bundle = BundleSchema.safeParse(manifest.bundle);
      if (!bundle.success) {
        throw new CliError(
          'validation',
          `${entry.slug} build-manifest.json has no valid bundle metrics.`,
          {
            hint: 'Rebuild without --skip-build to write bundle sizes into the manifest.',
          }
        );
      }

      const budget = resolveBudget(config, entry.slug);
      const metrics: BudgetMetricResult[] = [
        {
          metric: 'initialJsGzip',
          value: bundle.data.initialJsGzip / 1024,
          budget: budget.initialJsGzipKb,
          headroom: budget.initialJsGzipKb - bundle.data.initialJsGzip / 1024,
          ok: bundle.data.initialJsGzip <= budget.initialJsGzipKb * 1024,
        },
        {
          metric: 'cssGzip',
          value: bundle.data.cssGzip / 1024,
          budget: budget.cssGzipKb,
          headroom: budget.cssGzipKb - bundle.data.cssGzip / 1024,
          ok: bundle.data.cssGzip <= budget.cssGzipKb * 1024,
        },
      ];
      const ok = metrics.every((metric) => metric.ok);
      if (!ok) budgetExceeded = true;
      results.push({ slug: entry.slug, metrics, ok });
    } catch (error) {
      const cliError = toCliError(error);
      firstError ??= cliError;
      if (cliError.code === 'validation') budgetExceeded = true;
      results.push({ slug: entry.slug, metrics: [], ok: false, error: cliError.message });
    }
  }

  const failed = results.filter((result) => !result.ok).length;
  const data: BudgetCommandData = { total: results.length, failed, results };
  const failure =
    failed === 0
      ? undefined
      : budgetExceeded
        ? new CliError(
            'validation',
            `${failed} of ${results.length} prototype(s) failed budget checks.`
          )
        : (firstError ?? new CliError('failure', `${failed} prototype budget check(s) failed.`));

  return {
    data,
    ...(failure ? { failure } : {}),
    render(out) {
      if (results.length === 0) {
        out.always('No prototypes to check.');
        return;
      }
      const rows = results.flatMap((result) =>
        result.metrics.length === 0
          ? [[result.slug, 'bundle', result.error ?? 'unavailable', '—', 'FAIL']]
          : result.metrics.map((metric) => [
              result.slug,
              metric.metric,
              formatKb(metric.value),
              formatKb(metric.budget),
              formatHeadroom(metric.headroom),
              metric.ok ? 'PASS' : 'FAIL',
            ])
      );
      out.always(
        formatTable(['Prototype', 'Metric', 'Value', 'Budget', 'Headroom', 'Result'], rows)
      );
      for (const result of results) {
        if (!result.error && result.metrics.length > 0) continue;
        out.always(`${mark(out.c, 'fail')} ${result.slug}: ${result.error}`);
      }
      if (failed === 0) out.always(`All ${results.length} prototype budget checks passed.`);
      else out.always(`${failed} of ${results.length} prototype(s) failed budget checks.`);
    },
  };
};

async function readBuildManifest(
  ctx: Parameters<Handler>[0],
  entry: RegistryEntry
): Promise<BuildManifest> {
  const path = join(artifactDir(ctx, entry), BUILD_MANIFEST_FILENAME);
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isMissingFile(error)) {
      throw new CliError('not_found', `No build-manifest.json exists for ${entry.slug}.`, {
        hint: 'Drop --skip-build to build the prototype and create its manifest.',
      });
    }
    throw new CliError(
      'failure',
      `Could not read build manifest at ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  let manifest: unknown;
  try {
    manifest = JSON.parse(text) as unknown;
  } catch (error) {
    throw new CliError(
      'validation',
      `Invalid JSON in ${path}: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isRecord(manifest) || manifest.slug !== entry.slug) {
    throw new CliError('validation', `Build manifest at ${path} does not describe ${entry.slug}.`);
  }
  return manifest as unknown as BuildManifest;
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function formatKb(value: number): string {
  return `${formatBytes(Math.round(value * 1024))} (${value.toFixed(2)} KB)`;
}

function formatHeadroom(value: number): string {
  return `${value >= 0 ? '+' : '−'}${Math.abs(value).toFixed(2)} KB`;
}
