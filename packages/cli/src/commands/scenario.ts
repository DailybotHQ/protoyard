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
