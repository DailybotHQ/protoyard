/**
 * `pnpm exec tsx scripts/check-texuli-adoption.ts` — keep Protoyard on Texuli.
 *
 * The rules, the pending ratchet and the exceptions live in
 * `packages/cli/src/lib/texuli-adoption.ts`, which `protoyard check texuli`
 * also runs in any workspace. This script runs them over this repository.
 *
 * Exit 0 when clean, 1 on any problem, 2 on usage errors.
 *
 *   pnpm exec tsx scripts/check-texuli-adoption.ts [--scope <path>]... [--strict] [--allow-gaps] [--prune] [--json]
 */
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  checkAdoption,
  scanRepository,
  writePending,
} from '../packages/cli/src/lib/texuli-adoption.ts';

export * from '../packages/cli/src/lib/texuli-adoption.ts';

const REPO = resolve(fileURLToPath(new URL('..', import.meta.url)));

function main(argv: string[]): number {
  const scopes: string[] = [];
  const flags = new Set<string>();
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scope') {
      const v = argv[++i];
      if (!v) {
        console.error('--scope needs a path');
        return 2;
      }
      scopes.push(v.replace(/\/$/, ''));
    } else if (
      ['--strict', '--allow-gaps', '--prune', '--write-baseline', '--json'].includes(a ?? '')
    ) {
      flags.add(a as string);
    } else {
      console.error(`unknown option ${a}`);
      return 2;
    }
  }
  if (flags.has('--allow-gaps') && !flags.has('--strict')) {
    console.error('--allow-gaps only applies with --strict');
    return 2;
  }
  if (flags.has('--write-baseline') || flags.has('--prune')) {
    const { violations } = scanRepository(REPO, scopes);
    writePending(REPO, violations, flags.has('--prune') ? 'prune' : 'baseline', scopes);
  }
  const report = checkAdoption({
    root: REPO,
    scopes,
    strict: flags.has('--strict'),
    allowGaps: flags.has('--allow-gaps'),
  });
  if (flags.has('--json')) console.log(JSON.stringify(report, null, 2));
  else {
    for (const p of report.problems) console.log(`✗ ${p}`);
    const c = report.counts;
    console.log(
      `${report.ok ? '✓' : '✗'} Texuli adoption: ${c.files} files, ${c.violations} violations (${c.pending} pending, ${c.gapBlocked} waiting on a Texuli gap)`
    );
  }
  return report.ok ? 0 : 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href)
  process.exit(main(process.argv.slice(2)));
