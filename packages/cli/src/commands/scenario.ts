import { loadBudgets, resolveBudget } from '../lib/budgets.ts';
import type { CommandResult, Handler } from '../lib/command.ts';
import { flag, opt } from '../lib/command.ts';
import { type Inspection, inspectPrototype } from '../lib/inspect.ts';
import { CliError, formatTable, mark } from '../lib/output.ts';
import { resolveTarget } from '../lib/workspace.ts';

export const scenarioListCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  // Static by default (manifest only, no code runs); --details loads names from the definition.
  const inspection: Inspection | null = flag(options, 'details')
    ? await inspectPrototype(ctx.root, dir, 'inspect')
    : null;
  const scenarios = inspection
    ? inspection.scenarios.map((s) => ({ ...s, default: s.id === entry.defaultScenario }))
    : entry.scenarios.map((id) => ({ id, default: id === entry.defaultScenario }));
  return {
    data: { slug: entry.slug, source: inspection ? 'definition' : 'manifest', scenarios },
    render(out) {
      const { c } = out;
      if (scenarios.length === 0) {
        out.always(`${entry.slug} declares no scenarios.`);
        return;
      }
      if (inspection) {
        out.always(
          formatTable(
            ['ID', 'NAME', 'GROUP', 'DENSITY', 'SEED', 'VERSION'],
            inspection.scenarios.map((s) => [
              s.id === entry.defaultScenario ? `${s.id} *` : s.id,
              s.name,
              s.group,
              s.density,
              String(s.seed),
              String(s.version),
            ])
          )
        );
      } else {
        for (const s of scenarios) out.always(`${s.id}${s.default ? c.dim('  (default)') : ''}`);
        out.info(c.dim('\nIds from protoyard.json. Add --details for names, groups and seeds.'));
      }
    },
  };
};

export const scenarioValidateCommand: Handler = async (
  ctx,
  args,
  options
): Promise<CommandResult> => {
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  const only = opt(options, 'scenario');
  const inspection = await inspectPrototype(ctx.root, dir, 'generate', only);
  const runs = inspection.runs ?? [];
  if (only && runs.length === 0) {
    throw new CliError('not_found', `Scenario "${only}" is not defined by ${entry.slug}.`, {
      hint: `Defined: ${inspection.scenarios.map((s) => s.id).join(', ')}`,
    });
  }
  const failed = runs.filter((r) => !r.ok);
  return {
    data: { slug: entry.slug, validator: inspection.validator, runs },
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'validation',
            `${failed.length} of ${runs.length} scenario(s) produced invalid worlds.`
          ),
        }
      : {}),
    render(out) {
      const { c } = out;
      out.always(
        `${only ? `Generating scenario ${c.bold(only)} of` : 'Generating every scenario of'} ${c.bold(entry.slug)} ${c.dim(`(integrity: ${inspection.validator})`)}`
      );
      for (const r of runs) {
        const rows = Object.values(r.counts ?? {}).reduce((a, b) => a + b, 0);
        out.always(
          `${mark(c, r.ok ? 'pass' : 'fail')} ${r.id.padEnd(24)} ${r.ok ? c.dim(`${rows} rows · ${r.durationMs} ms`) : c.red(r.error ?? `${r.violationCount} violation(s)`)}`
        );
        for (const v of r.violations ?? []) {
          out.always(
            `    ${c.dim(`${v.table}/${v.rowId}${v.field ? `.${v.field}` : ''}: ${v.message}`)}`
          );
        }
      }
      if (failed.length === 0) {
        out.always(
          c.green(
            runs.length === 1
              ? `\n${runs[0]?.id} generates a consistent world.`
              : `\nAll ${runs.length} scenarios generate consistent worlds.`
          )
        );
      }
    },
  };
};

export interface ScenarioBenchResult {
  id: string;
  runs: number;
  rows: number;
  rowCounts: Record<string, number>;
  generateMs: number;
  validateMs: number;
  durationMs: number;
  budgetMs: number;
  headroomMs: number;
  withinBudget: boolean;
  ok: boolean;
  error?: string;
}

export interface ScenarioBenchData {
  slug: string;
  runs: number;
  checked: boolean;
  results: ScenarioBenchResult[];
}

type TimedScenarioRun = NonNullable<Inspection['runs']>[number] & {
  generateMs: number;
  validateMs: number;
};

export const scenarioBenchCommand: Handler = async (ctx, args, options): Promise<CommandResult> => {
  // Templates are runnable too: their scenarios ship in every prototype made from them.
  const { entry, dir } = await resolveTarget(ctx, args[0]);
  const scenarioId = opt(options, 'scenario');
  const runCountText = opt(options, 'runs') ?? '3';
  const runCount = Number(runCountText);
  if (!Number.isSafeInteger(runCount) || runCount < 1) {
    throw new CliError('usage', '--runs must be a positive integer.');
  }
  const check = flag(options, 'check');
  // Shared CI runners are slower than the machine the budgets were measured on (same idea as
  // `bench:index --ci-factor`): the factor multiplies the budget, never the measurement.
  const ciFactorText = opt(options, 'ciFactor') ?? '1';
  const ciFactor = Number(ciFactorText);
  if (!Number.isFinite(ciFactor) || ciFactor < 1) {
    throw new CliError('usage', '--ci-factor must be a number >= 1.');
  }
  const inspections: Inspection[] = [];
  for (let run = 0; run < runCount; run++) {
    inspections.push(await inspectPrototype(ctx.root, dir, 'generate', scenarioId));
  }
  const inspection = inspections[0];
  if (!inspection) throw new CliError('failure', 'The inspect runner returned no benchmark data.');
  const scenarios = scenarioId
    ? inspection.scenarios.filter((scenario) => scenario.id === scenarioId)
    : inspection.scenarios;
  if (scenarios.length === 0) {
    throw new CliError('not_found', `Scenario "${scenarioId}" is not defined by ${entry.slug}.`, {
      hint: `Defined: ${inspection.scenarios.map((scenario) => scenario.id).join(', ')}`,
    });
  }

  const config = await loadBudgets(ctx.root);
  const budgetMs = resolveBudget(config, entry.slug).generateMs * ciFactor;
  const runResults = inspections.flatMap((result) => result.runs ?? []) as TimedScenarioRun[];
  const results = scenarios.map((scenario): ScenarioBenchResult => {
    const scenarioRuns = runResults.filter((run) => run.id === scenario.id);
    const rowCounts = scenarioRuns[0]?.counts ?? {};
    const rows = Object.values(rowCounts).reduce((total, count) => total + count, 0);
    const durationMs = median(scenarioRuns.map((run) => run.durationMs));
    const withinBudget = durationMs <= budgetMs;
    const failedRun = scenarioRuns.find((run) => !run.ok);
    const incomplete = scenarioRuns.length !== runCount;
    return {
      id: scenario.id,
      runs: scenarioRuns.length,
      rows,
      rowCounts,
      generateMs: median(scenarioRuns.map((run) => run.generateMs)),
      validateMs: median(scenarioRuns.map((run) => run.validateMs)),
      durationMs,
      budgetMs,
      headroomMs: Number((budgetMs - durationMs).toFixed(2)),
      withinBudget,
      ok: !failedRun && !incomplete && (!check || withinBudget),
      ...(incomplete
        ? { error: `Expected ${runCount} run(s), received ${scenarioRuns.length}.` }
        : failedRun
          ? {
              error:
                failedRun.error ?? `${failedRun.violationCount ?? 0} integrity violation(s) found`,
            }
          : {}),
    };
  });
  const failed = results.filter((result) => !result.ok);
  const data: ScenarioBenchData = { slug: entry.slug, runs: runCount, checked: check, results };
  return {
    data,
    ...(failed.length > 0
      ? {
          failure: new CliError(
            'validation',
            check
              ? `${failed.length} scenario(s) failed generation validation or exceeded the ${budgetMs} ms budget.`
              : `${failed.length} scenario(s) generated invalid worlds.`
          ),
        }
      : {}),
    render(out) {
      const { c } = out;
      out.always(
        `Benchmarking ${c.bold(entry.slug)} ${c.dim(`(${runCount} run(s) per scenario · integrity: ${inspection.validator})`)}`
      );
      out.always(
        formatTable(
          [
            'Scenario',
            'Rows',
            'Generate ms',
            'Validate ms',
            'Total ms',
            'Budget',
            'Headroom',
            'Result',
          ],
          results.map((result) => [
            result.id,
            String(result.rows),
            result.generateMs.toFixed(2),
            result.validateMs.toFixed(2),
            result.durationMs.toFixed(2),
            `${result.budgetMs} ms`,
            `${result.headroomMs >= 0 ? '+' : '−'}${Math.abs(result.headroomMs).toFixed(2)} ms`,
            result.ok ? 'PASS' : result.withinBudget ? 'FAIL' : check ? 'OVER' : 'INVALID',
          ])
        )
      );
      if (failed.length === 0) {
        out.always(
          c.green(
            check
              ? `All ${results.length} scenario(s) passed generation and budget checks.`
              : `All ${results.length} scenario(s) generated valid worlds.`
          )
        );
      } else {
        for (const result of failed) {
          if (result.error) out.always(`${mark(c, 'fail')} ${result.id}: ${result.error}`);
        }
        out.always(`${failed.length} of ${results.length} scenario(s) failed.`);
      }
    },
  };
};

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const value =
    sorted.length % 2 === 0
      ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
      : (sorted[middle] ?? 0);
  return Number(value.toFixed(2));
}
