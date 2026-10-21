import { basename } from 'node:path';
import { throwIfAborted } from './abort.ts';
import { type RunResult, run, which } from './process.ts';

/**
 * Locates pnpm without a shell: the pnpm that launched us (npm_execpath), then
 * PATH, then corepack. Returns the argv prefix to run it.
 */
export async function pnpmCommand(): Promise<string[] | null> {
  const execPath = process.env.npm_execpath;
  if (execPath && /^pnpm(\.c?js)?$/.test(basename(execPath))) {
    return execPath.endsWith('js') ? [process.execPath, execPath] : [execPath];
  }
  const onPath = await which('pnpm');
  if (onPath) return [onPath];
  const corepack = await which('corepack');
  return corepack ? [corepack, 'pnpm'] : null;
}

export async function runPnpm(
  args: readonly string[],
  options: { cwd: string; stdio: 'pipe' | 'inherit'; timeoutMs?: number }
): Promise<RunResult> {
  const cmd = await pnpmCommand();
  if (!cmd) return { code: 127, stdout: '', stderr: '', spawnError: 'pnpm not found' };
  const [bin, ...prefix] = cmd as [string, ...string[]];
  return run(bin, [...prefix, ...args], options);
}

/**
 * Links a newly created workspace package. `--offline` succeeds when every
 * dependency is already in the store (the common case: a template only uses
 * workspace packages); otherwise we fall back to a normal install.
 */
export async function installWorkspace(root: string, stdio: 'pipe' | 'inherit') {
  throwIfAborted('installing dependencies');
  const offline = await runPnpm(['install', '--offline'], { cwd: root, stdio, timeoutMs: 300_000 });
  if (offline.code === 0) return { ok: true, mode: 'offline' as const, log: '' };
  // A cancelled offline install never falls through to a network install.
  throwIfAborted('installing dependencies online');
  const online = await runPnpm(['install'], { cwd: root, stdio, timeoutMs: 600_000 });
  return {
    ok: online.code === 0,
    mode: 'online' as const,
    log: (online.spawnError ?? `${online.stdout}\n${online.stderr}`).trim().slice(-4000),
  };
}
