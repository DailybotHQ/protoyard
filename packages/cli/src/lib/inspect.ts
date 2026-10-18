import { fileURLToPath } from 'node:url';
import { CliError } from './output.ts';
import { resolvePackageBin, run } from './process.ts';

const RUNNER = fileURLToPath(new URL('../runners/inspect-prototype.ts', import.meta.url));
const RESULT_MARKER = '@@PROTOYARD_RESULT@@';

export interface InspectedScenario {
  id: string;
  name: string;
  group: string;
  version: number;
  seed: number;
  density: string;
}

export interface ScenarioRun {
  id: string;
  ok: boolean;
  counts?: Record<string, number>;
  /** Generated personas (first 50) with their first membership role. */
  personas?: { id: string; name: string; role: string | null }[];
  violationCount?: number;
  violations?: { table: string; rowId: string; field?: string; message: string }[];
  error?: string;
  durationMs: number;
}

export interface Inspection {
  validator: string;
  scenarios: InspectedScenario[];
  rawScenarioIds: string[];
  declared: string[];
  defaultScenario: string | null;
  databaseVersions: number[];
  /** Domain tables in the latest database version (reserved py_* tables excluded). */
  tables: string[];
  schemaVersion: number;
  runs?: ScenarioRun[];
}

/**
 * Runs `runners/inspect-prototype.ts` under tsx in a child process. The
 * prototype's code executes there, never in the CLI process.
 */
export async function inspectPrototype(
  root: string,
  dir: string,
  mode: 'inspect' | 'generate',
  scenarioId?: string
): Promise<Inspection> {
  const tsx = resolvePackageBin('tsx', 'tsx', [root, dir]);
  if (!tsx)
    throw new CliError('not_found', 'tsx is not installed.', { hint: 'Run `pnpm install`.' });
  const args = [tsx, RUNNER, dir, root, mode, ...(scenarioId ? [scenarioId] : [])];
  const result = await run(process.execPath, args, { cwd: dir, timeoutMs: 180_000 });
  const marker = result.stdout.lastIndexOf(RESULT_MARKER);
  if (marker === -1) {
    const detail = (result.stderr || result.stdout || result.spawnError || '')
      .trim()
      .split('\n')
      .slice(-8)
      .join('\n');
    throw new CliError(
      'failure',
      `Could not load src/prototype.ts${result.timedOut ? ' (timed out)' : ''}.`,
      {
        hint: detail || 'The runner produced no output.',
      }
    );
  }
  const payload = JSON.parse(
    result.stdout
      .slice(marker + RESULT_MARKER.length)
      .trim()
      .split('\n')[0] ?? '{}'
  ) as Inspection | { fatal: string };
  if ('fatal' in payload) {
    throw new CliError('validation', `src/prototype.ts failed to load: ${payload.fatal}`);
  }
  return payload;
}
