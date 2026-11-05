import type { CommandResult, Handler } from '../lib/command.ts';
import { flag } from '../lib/command.ts';
import { CliError } from '../lib/output.ts';
import { hasControlCharacter } from '../lib/paths.ts';
import { checkAdoption } from '../lib/texuli-adoption.ts';

/**
 * `protoyard check texuli`: the Texuli adoption rules over this workspace's
 * `prototypes/`, `templates/`, `packages/` and `apps/` (tests, dist and
 * node_modules skipped). In a consumer workspace, which has no pending lists,
 * every violation fails; `tests/adoption/texuli-exceptions.json` (paths with a
 * reason) is honored when present. Read-only.
 */
export const checkTexuliCommand: Handler = async (ctx, _args, options): Promise<CommandResult> => {
  const raw = options.scope;
  const scopes = (Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]).map((value) => {
    const scope = String(value);
    if (hasControlCharacter(scope) || scope.includes('..')) {
      throw new CliError('unsafe_path', `Unsafe --scope "${scope}".`);
    }
    return scope.replace(/\/$/, '');
  });
  const report = checkAdoption({ root: ctx.root, scopes, strict: flag(options, 'strict') });
  const data = {
    ok: report.ok,
    counts: report.counts,
    problems: report.problems,
    violations: report.violations,
  };
  if (!report.ok) {
    throw new CliError(
      'validation',
      `Texuli adoption: ${report.counts.violations} violation(s) in ${report.counts.files} files.`,
      { data, hint: report.problems.slice(0, 5).join(' · ') }
    );
  }
  return {
    data,
    render(o) {
      const c = report.counts;
      o.always(`✓ Texuli adoption: ${c.files} files, ${c.violations} violations`);
    },
  };
};
