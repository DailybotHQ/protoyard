import { existsSync, realpathSync } from 'node:fs';
import { join, sep } from 'node:path';
import { CliError } from '../output.ts';
import { workspaceLayout } from '../paths.ts';
import { runPnpm } from '../pnpm.ts';
import { readPackageJson } from '../workspace.ts';
import {
  type LocatePlayerOptions,
  locatePlayerAssets,
  PLAYER_BUILD_COMMAND,
  PLAYER_PACKAGE,
  type PlayerAssets,
} from './player-assets.ts';

/**
 * The one build `protoyard quick` may start: on a fresh clone of the
 * Protoyard monorepo, `packages/player/dist/app` does not exist yet, so the
 * first `quick` runs `pnpm --filter @protoyard/player build` once. A consumer
 * workspace or an installed player is never built, and a stale build is only
 * warned about (`stalePlayerBuildWarning`).
 */

/** Outcome of one player build; `detail` says why it failed. */
export interface PlayerBuildResult {
  ok: boolean;
  detail?: string;
}

/** Most of the build log shown when it is forwarded to stderr. */
const MAX_LOG_CHARS = 8_000;

/**
 * Runs `pnpm --filter @protoyard/player build` from the workspace root,
 * without a shell (lib/pnpm.ts → lib/process.ts). The output is captured and
 * forwarded to stderr, because stdout is reserved for the `--json` envelope.
 */
export async function runPlayerBuild(workspaceRoot: string): Promise<PlayerBuildResult> {
  const result = await runPnpm(['--filter', PLAYER_PACKAGE, 'build'], {
    cwd: workspaceRoot,
    stdio: 'pipe',
    timeoutMs: 300_000,
  });
  const log = `${result.stdout}${result.stderr}`.trim();
  if (log) process.stderr.write(`${log.slice(-MAX_LOG_CHARS)}\n`);
  if (result.spawnError) return { ok: false, detail: result.spawnError };
  if (result.timedOut) return { ok: false, detail: 'timed out after 5 minutes' };
  if (result.aborted) return { ok: false, detail: 'cancelled' };
  if (result.code !== 0) return { ok: false, detail: `exit code ${result.code}` };
  return { ok: true };
}

/**
 * The repository's own `packages/player` when it has never been built: the
 * workspace is the Protoyard monorepo, the package has its sources, and
 * `dist/app/` does not exist. Null otherwise (a consumer workspace, an
 * installed player, or a build that exists, fresh or stale).
 */
export function unbuiltMonorepoPlayer(workspaceRoot: string | null): string | null {
  if (!workspaceRoot || workspaceLayout(workspaceRoot) !== 'monorepo') return null;
  const local = join(workspaceRoot, 'packages', 'player');
  if (readPackageJson(join(local, 'package.json'))?.name !== PLAYER_PACKAGE) return null;
  if (!existsSync(join(local, 'src')) || !existsSync(join(local, 'vite.config.ts'))) return null;
  if (realpathSync(local).split(sep).includes('node_modules')) return null;
  return existsSync(join(local, 'dist', 'app')) ? null : local;
}

export interface EnsurePlayerOptions extends LocatePlayerOptions {
  locate?: (options: LocatePlayerOptions) => PlayerAssets;
  /** Test seam: replaces the real `pnpm --filter @protoyard/player build`. */
  build?: (workspaceRoot: string) => PlayerBuildResult | Promise<PlayerBuildResult>;
  /** Where the "building the player" line goes (default: stderr). */
  log?: (line: string) => void;
}

/**
 * `locatePlayerAssets`, plus one convenience for a fresh clone of the
 * monorepo: when no player is found and `packages/player/dist/app` is
 * missing, build it once, then look again. Never builds in a consumer
 * workspace or for an installed player, and never rebuilds a stale build
 * (`stalePlayerBuildWarning` covers that).
 */
export async function ensurePlayerAssets(options: EnsurePlayerOptions): Promise<PlayerAssets> {
  const locate = options.locate ?? locatePlayerAssets;
  const located: LocatePlayerOptions = {
    workspaceRoot: options.workspaceRoot,
    ...(options.resolveInstalled ? { resolveInstalled: options.resolveInstalled } : {}),
  };
  try {
    return locate(located);
  } catch (error) {
    const root = options.workspaceRoot;
    if (!(error instanceof CliError) || error.code !== 'not_found') throw error;
    if (!root || !unbuiltMonorepoPlayer(root)) throw error;
    const log = options.log ?? ((line: string) => process.stderr.write(`${line}\n`));
    log(`Building the player once for quick (about 10 s): ${PLAYER_BUILD_COMMAND}`);
    const result = await (options.build ?? runPlayerBuild)(root);
    if (!result.ok) {
      throw new CliError(
        'failure',
        `Building the player failed${result.detail ? ` (${result.detail})` : ''}.`,
        {
          hint: `Run \`${PLAYER_BUILD_COMMAND}\` from the repository root, fix what it reports, then run quick again.`,
        }
      );
    }
    return locate(located);
  }
}
